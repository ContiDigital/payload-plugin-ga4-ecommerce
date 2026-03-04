import type { PayloadRequest } from 'payload'

import { describe, expect, test } from 'vitest'

import type { NormalizedPluginOptions } from '../../types/index.js'

import { assertInboundRateLimit, InboundRateLimitExceededError } from './inboundRateLimit.js'

const createRequest = (ip: string): PayloadRequest =>
  ({
    headers: new Headers({
      'x-forwarded-for': ip,
    }),
  }) as PayloadRequest

const createOptions = (maxRequestsPerMinute: number): NormalizedPluginOptions =>
  ({
    admin: {
      mode: 'route',
      navLabel: 'Analytics',
      route: '/analytics',
    },
    api: {
      basePath: '/analytics/ga4',
    },
    autoInjectUI: true,
    cache: {
      aggregateTtlMs: 1_000,
      collectionSlug: 'ga4-cache',
      enabled: true,
      maxEntries: 100,
      strategy: 'payloadCollection',
      timeseriesTtlMs: 1_000,
    },
    collections: [],
    disabled: false,
    events: {
      reportLimit: 10,
      trackedEventNames: [],
    },
    getCredentials: () =>
      Promise.resolve({
        type: 'keyFilename',
        path: 'dev/.google-credentials.json',
      }),
    propertyId: '123',
    rateLimit: {
      baseRetryDelayMs: 100,
      enabled: true,
      includePropertyQuota: true,
      jitterFactor: 0.2,
      maxConcurrency: 2,
      maxQueueSize: 50,
      maxRequestsPerMinute,
      maxRetries: 2,
      maxRetryDelayMs: 1_000,
      requestTimeoutMs: 10_000,
    },
    source: {
      dimension: 'sessionSource',
    },
  }) satisfies NormalizedPluginOptions

describe('assertInboundRateLimit', () => {
  test('allows requests under configured limit', () => {
    const req = createRequest('203.0.113.10')
    const options = createOptions(2)

    expect(() => assertInboundRateLimit(req, options, 'report')).not.toThrow()
    expect(() => assertInboundRateLimit(req, options, 'report')).not.toThrow()
  })

  test('blocks requests above configured limit', () => {
    const req = createRequest('203.0.113.11')
    const options = createOptions(1)

    assertInboundRateLimit(req, options, 'report')

    expect(() => assertInboundRateLimit(req, options, 'report')).toThrow(InboundRateLimitExceededError)
  })

  test('uses x-real-ip when x-forwarded-for is absent', () => {
    const createRealIpRequest = (ip: string): PayloadRequest =>
      ({
        headers: new Headers({
          'x-real-ip': ip,
        }),
      }) as PayloadRequest

    const req = createRealIpRequest('198.51.100.5')
    const options = createOptions(2)

    expect(() => assertInboundRateLimit(req, options, 'realip-test')).not.toThrow()
    expect(() => assertInboundRateLimit(req, options, 'realip-test')).not.toThrow()
    expect(() => assertInboundRateLimit(req, options, 'realip-test')).toThrow(
      InboundRateLimitExceededError,
    )
  })

  test('all clients share bucket when no proxy headers present', () => {
    const createBareRequest = (): PayloadRequest =>
      ({
        headers: new Headers(),
      }) as PayloadRequest

    const options = createOptions(2)
    const routeKey = 'no-proxy-test'

    const reqA = createBareRequest()
    const reqB = createBareRequest()

    expect(() => assertInboundRateLimit(reqA, options, routeKey)).not.toThrow()
    expect(() => assertInboundRateLimit(reqB, options, routeKey)).not.toThrow()
    // Third request from either client should be blocked since they share the 'unknown' bucket
    expect(() => assertInboundRateLimit(reqA, options, routeKey)).toThrow(
      InboundRateLimitExceededError,
    )
  })
})
