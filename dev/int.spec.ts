import type { Endpoint, Payload } from 'payload'

import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

const findEndpoint = (path: string, method: Endpoint['method']): Endpoint => {
  const endpoint = payload.config.endpoints?.find(
    (candidate) => candidate.path === path && candidate.method === method,
  )

  if (!endpoint) {
    throw new Error(`Expected endpoint not found: [${method}] ${path}`)
  }

  return endpoint
}

const createAuthedPayloadRequest = async (request: Request) => {
  const payloadRequest = await createPayloadRequest({ config, request })

  payloadRequest.user = {
    collection: 'users',
    email: 'admin@example.com',
    id: 'integration-user',
  } as unknown as typeof payloadRequest.user

  return payloadRequest
}

afterAll(async () => {
  if (payload && typeof (payload as { destroy?: () => Promise<void> }).destroy === 'function') {
    await payload.destroy!()
  }
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

describe('payload-plugin-ga4-ecommerce integration', () => {
  test('registers analytics endpoints', () => {
    expect(payload.config.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'get',
          path: '/analytics/ga4/health',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/global/aggregate',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/global/timeseries',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/page/aggregate',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/page/timeseries',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/report',
        }),
        expect.objectContaining({
          method: 'get',
          path: '/analytics/ga4/metadata',
        }),
        expect.objectContaining({
          method: 'post',
          path: '/analytics/ga4/compatibility',
        }),
        expect.objectContaining({
          method: 'get',
          path: '/analytics/ga4/live',
        }),
      ]),
    )
  })

  test('health endpoint returns plugin status', async () => {
    const endpoint = findEndpoint('/analytics/ga4/health', 'get')

    const request = new Request('http://localhost:3000/api/analytics/ga4/health', {
      method: 'GET',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(200)

    const body = await response.json()

    expect(body).toMatchObject({
      adminMode: 'route',
      source: {
        dimension: 'sessionSource',
      },
      status: 'ok',
    })
    expect(typeof body.timestamp).toBe('string')
  })

  test('health endpoint denies anonymous requests', async () => {
    const endpoint = findEndpoint('/analytics/ga4/health', 'get')

    const request = new Request('http://localhost:3000/api/analytics/ga4/health', {
      method: 'GET',
    })

    const payloadRequest = await createPayloadRequest({ config, request })
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body.error).toContain('Access denied')
  })

  test('aggregate endpoint validates metrics payload', async () => {
    const endpoint = findEndpoint('/analytics/ga4/global/aggregate', 'post')

    const request = new Request('http://localhost:3000/api/analytics/ga4/global/aggregate', {
      body: JSON.stringify({
        metrics: ['invalidMetric'],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('Invalid metric key')
  })

  test('page aggregate endpoint validates pagePath', async () => {
    const endpoint = findEndpoint('/analytics/ga4/page/aggregate', 'post')

    const request = new Request('http://localhost:3000/api/analytics/ga4/page/aggregate', {
      body: JSON.stringify({
        metrics: ['views'],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('pagePath is required')
  })

  test('page aggregate endpoint validates comparePrevious boolean', async () => {
    const endpoint = findEndpoint('/analytics/ga4/page/aggregate', 'post')

    const request = new Request('http://localhost:3000/api/analytics/ga4/page/aggregate', {
      body: JSON.stringify({
        comparePrevious: 'true',
        pagePath: '/products/browse/fireplaces/regency',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('comparePrevious must be a boolean')
  })

  test('report endpoint validates property key', async () => {
    const endpoint = findEndpoint('/analytics/ga4/report', 'post')

    const request = new Request('http://localhost:3000/api/analytics/ga4/report', {
      body: JSON.stringify({
        metrics: ['views'],
        property: 'invalidProperty',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('Invalid property key')
  })

  test('report endpoint validates optional pagePath when supplied', async () => {
    const endpoint = findEndpoint('/analytics/ga4/report', 'post')

    const request = new Request('http://localhost:3000/api/analytics/ga4/report', {
      body: JSON.stringify({
        pagePath: ' ',
        property: 'source',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const payloadRequest = await createAuthedPayloadRequest(request)
    const response = await endpoint.handler(payloadRequest)

    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('pagePath must be a non-empty string')
  })

  test('seed creates representative category and product URL data', async () => {
    const categories = await payload.find({
      collection: 'test-categories',
      limit: 50,
      depth: 0,
    })

    const products = await payload.find({
      collection: 'test-products',
      limit: 50,
      depth: 0,
    })

    const pages = await payload.find({
      collection: 'test-pages',
      limit: 50,
      depth: 0,
    })

    expect(categories.totalDocs).toBeGreaterThanOrEqual(6)
    expect(products.totalDocs).toBeGreaterThanOrEqual(4)
    expect(pages.totalDocs).toBeGreaterThanOrEqual(3)

    expect(
      categories.docs.some((category) => category.url === '/products/browse/fireplaces/regency'),
    ).toBe(true)

    expect(
      products.docs.some((product) =>
        String(product.slug ?? '').includes('demo-1001-regency-marble-fireplaces'),
      ),
    ).toBe(true)

    expect(pages.docs.some((page) => page.slug === 'case-studies')).toBe(true)
  })

  test('injects analytics tab into configured collections', () => {
    const target = payload.config.collections?.find((collection) => collection.slug === 'test-products')

    expect(target).toBeDefined()
    expect(target?.fields?.[0]?.type).toBe('tabs')

    const tabsField = target?.fields?.[0] as {
      tabs?: Array<{
        fields?: Array<{ name?: string }>
        label?: string
      }>
      type?: string
    }

    const analyticsTab = tabsField.tabs?.find((tab) => tab.label === 'Analytics')

    expect(analyticsTab).toBeDefined()
    expect(analyticsTab?.fields?.some((field) => field.name === 'ga4RecordAnalytics')).toBe(true)
  })
})
