import type { PayloadRequest } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import type { NormalizedPluginOptions } from '../../types/index.js'

import { AccessDeniedError, assertAccess } from './access.js'

const createRequest = (user?: PayloadRequest['user']): PayloadRequest => {
  return {
    payload: {
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    },
    user,
  } as unknown as PayloadRequest
}

const createOptions = (overrides?: Partial<NormalizedPluginOptions>): NormalizedPluginOptions => {
  return {
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
      collectionSlug: 'ga4-cache-entries',
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
        type: 'keyFilename' as const,
        path: 'dev/.google-credentials.json',
      }),
    propertyId: '123456',
    rateLimit: {
      baseRetryDelayMs: 100,
      enabled: true,
      includePropertyQuota: true,
      jitterFactor: 0.2,
      maxConcurrency: 2,
      maxQueueSize: 100,
      maxRequestsPerMinute: 120,
      maxRetries: 2,
      maxRetryDelayMs: 2_000,
      requestTimeoutMs: 10_000,
    },
    source: {
      dimension: 'sessionSource',
    },
    ...overrides,
  }
}

describe('assertAccess', () => {
  test('denies anonymous requests by default when no custom access function is provided', async () => {
    await expect(assertAccess(createRequest(), createOptions())).rejects.toBeInstanceOf(AccessDeniedError)
  })

  test('allows admin users by default when no custom access function is provided', async () => {
    await expect(
      assertAccess(
        createRequest({ id: '1', collection: 'users', role: 'admin' } as unknown as PayloadRequest['user']),
        createOptions(),
      ),
    ).resolves.toBeUndefined()
  })

  test('denies non-admin users by default when no custom access function is provided', async () => {
    await expect(
      assertAccess(
        createRequest({ id: '1', collection: 'users', role: 'editor' } as unknown as PayloadRequest['user']),
        createOptions(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError)
  })

  test('honors a custom access function when provided', async () => {
    const allowOptions = createOptions({
      access: () => true,
    })
    const denyOptions = createOptions({
      access: () => false,
    })

    await expect(assertAccess(createRequest(), allowOptions)).resolves.toBeUndefined()
    await expect(assertAccess(createRequest(), denyOptions)).rejects.toBeInstanceOf(AccessDeniedError)
  })
})
