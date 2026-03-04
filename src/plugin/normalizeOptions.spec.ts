import { describe, expect, test } from 'vitest'

import { normalizePluginOptions } from './normalizeOptions.js'

describe('normalizePluginOptions', () => {
  const base = {
    getCredentials: () =>
      Promise.resolve({
        type: 'keyFilename' as const,
        path: 'dev/.google-credentials.json',
      }),
    propertyId: '123456789',
  } as const

  test('defaults source attribution dimension to sessionSource', () => {
    const normalized = normalizePluginOptions(base)

    expect(normalized.cache.collectionSlug).toBe('ga4-cache-entries')
    expect(normalized.cache.maxEntries).toBe(1_000)
    expect(normalized.cache.strategy).toBe('payloadCollection')
    expect(normalized.rateLimit.maxQueueSize).toBe(100)
    expect(normalized.rateLimit.maxRequestsPerMinute).toBe(120)
    expect(normalized.rateLimit.requestTimeoutMs).toBe(10_000)
    expect(normalized.source.dimension).toBe('sessionSource')
  })

  test('accepts an explicit source attribution dimension', () => {
    const normalized = normalizePluginOptions({
      ...base,
      source: {
        dimension: 'firstUserSource',
      },
    })

    expect(normalized.source.dimension).toBe('firstUserSource')
  })

  test('falls back to sessionSource for invalid source dimension input', () => {
    const normalized = normalizePluginOptions({
      ...base,
      source: {
        dimension: 'bad-value' as never,
      },
    })

    expect(normalized.source.dimension).toBe('sessionSource')
  })

  test('normalizes cache max entries to at least one', () => {
    const normalized = normalizePluginOptions({
      ...base,
      cache: {
        maxEntries: 0,
      },
    })

    expect(normalized.cache.maxEntries).toBe(1)
  })

  test('normalizes cache strategy and request timeout', () => {
    const normalized = normalizePluginOptions({
      ...base,
      cache: {
        collectionSlug: 'analytics-cache',
        redis: {
          url: 'redis://localhost:6379',
        },
        strategy: 'redis',
      },
      rateLimit: {
        maxQueueSize: 0,
        maxRequestsPerMinute: 0,
        requestTimeoutMs: 0,
      },
    })

    expect(normalized.cache.collectionSlug).toBe('analytics-cache')
    expect(normalized.cache.redis?.keyPrefix).toBe('payload-ga4')
    expect(normalized.cache.strategy).toBe('redis')
    expect(normalized.rateLimit.maxQueueSize).toBe(1)
    expect(normalized.rateLimit.maxRequestsPerMinute).toBe(1)
    expect(normalized.rateLimit.requestTimeoutMs).toBe(1)
  })

  test('throws when redis cache strategy is selected without redis url', () => {
    expect(() =>
      normalizePluginOptions({
        ...base,
        cache: {
          strategy: 'redis',
        },
      }),
    ).toThrow('cache.redis.url is required')
  })

  test('disabled path does not throw when redis strategy has no url', () => {
    expect(() =>
      normalizePluginOptions({
        ...base,
        cache: { strategy: 'redis' },
        disabled: true,
      }),
    ).not.toThrow()

    const normalized = normalizePluginOptions({
      ...base,
      cache: { strategy: 'redis' },
      disabled: true,
    })
    expect(normalized.disabled).toBe(true)
    expect(normalized.cache.redis).toBeUndefined()
  })

  test('trims whitespace from propertyId', () => {
    const normalized = normalizePluginOptions({
      ...base,
      propertyId: '  123456  ',
    })
    expect(normalized.propertyId).toBe('123456')
  })

  test('normalizes admin.mode to default for invalid value', () => {
    const normalized = normalizePluginOptions({
      ...base,
      admin: { mode: 'invalid' as never },
    })
    expect(normalized.admin.mode).toBe('route')
  })

  test('clamps jitterFactor to 0-1 range', () => {
    const high = normalizePluginOptions({
      ...base,
      rateLimit: { jitterFactor: 5 },
    })
    expect(high.rateLimit.jitterFactor).toBe(1)

    const negative = normalizePluginOptions({
      ...base,
      rateLimit: { jitterFactor: -2 },
    })
    expect(negative.rateLimit.jitterFactor).toBe(0)
  })

  test('normalizes negative maxRetries to 0', () => {
    const normalized = normalizePluginOptions({
      ...base,
      rateLimit: { maxRetries: -3 },
    })
    expect(normalized.rateLimit.maxRetries).toBe(0)
  })

  test('normalizes negative maxConcurrency to 1', () => {
    const normalized = normalizePluginOptions({
      ...base,
      rateLimit: { maxConcurrency: -5 },
    })
    expect(normalized.rateLimit.maxConcurrency).toBe(1)
  })

  test('validates collections on enabled path', () => {
    expect(() =>
      normalizePluginOptions({
        ...base,
        collections: [{ slug: 'posts' }],
      }),
    ).toThrow('pathnameField or getPathname')
  })

  test('defaults autoInjectUI to true', () => {
    const normalized = normalizePluginOptions(base)
    expect(normalized.autoInjectUI).toBe(true)
  })

  test('respects autoInjectUI when set to false', () => {
    const normalized = normalizePluginOptions({
      ...base,
      autoInjectUI: false,
    })
    expect(normalized.autoInjectUI).toBe(false)
  })
})
