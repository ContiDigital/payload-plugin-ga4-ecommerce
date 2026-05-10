import type { PayloadRequest } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import type { MetricKey, NormalizedPluginOptions, Timeframe } from '../../types/index.js'
import type { CacheService } from './sub-services/cacheService.js'

import { createAnalyticsService } from './analyticsService.js'

const createOptions = (): NormalizedPluginOptions => ({
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
    aggregateTtlMs: 10_000,
    collectionSlug: 'ga4-cache',
    enabled: true,
    maxEntries: 100,
    strategy: 'payloadCollection',
    timeseriesTtlMs: 10_000,
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
    baseRetryDelayMs: 0,
    enabled: false,
    includePropertyQuota: false,
    jitterFactor: 0,
    maxConcurrency: 1,
    maxQueueSize: 10,
    maxRequestsPerMinute: 120,
    maxRetries: 0,
    maxRetryDelayMs: 0,
    requestTimeoutMs: 1_000,
  },
  source: {
    dimension: 'sessionSource',
  },
})

const createRequest = (): PayloadRequest =>
  ({
    payload: {
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    },
    user: {
      role: 'admin',
    },
  }) as unknown as PayloadRequest

const createMemoryCache = (): CacheService => {
  const map = new Map<string, unknown>()

  return {
    clear: () => {
      map.clear()
      return Promise.resolve()
    },
    get: ({ key }) => Promise.resolve(map.get(key) as undefined),
    set: ({ key, value }) => {
      map.set(key, value)
      return Promise.resolve()
    },
  }
}

describe('analyticsService happy path', () => {
  test('returns aggregate metrics from reporter', async () => {
    const runReport = vi.fn().mockResolvedValue({
      propertyQuota: {
        tokensPerDay: {
          consumed: 5,
          remaining: 199995,
        },
      },
      rows: [
        {
          metricValues: [{ value: '100' }, { value: '50' }],
        },
      ],
    })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const result = await service.getGlobalAggregate({
      input: {
        metrics: ['views', 'visitors'],
        timeframe: '30d',
      },
      req: createRequest(),
    })

    expect(result.metrics.views).toBe(100)
    expect(result.metrics.visitors).toBe(50)
    expect(result.propertyQuota).toEqual({
      tokensPerDay: {
        consumed: 5,
        remaining: 199995,
      },
    })
    expect(runReport).toHaveBeenCalledTimes(1)
  })

  test('computes comparison deltas for previous period', async () => {
    const runReport = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            metricValues: [{ value: '120' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            metricValues: [{ value: '60' }],
          },
        ],
      })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const result = await service.getGlobalAggregate({
      input: {
        comparePrevious: true,
        metrics: ['views'],
        timeframe: '30d',
      },
      req: createRequest(),
    })

    expect(result.comparison?.deltas.views).toEqual({
      absolute: 60,
      percentChange: 100,
    })
    expect(runReport).toHaveBeenCalledTimes(2)
  })

  test('getReport returns rows with correct structure', async () => {
    const runReport = vi.fn().mockResolvedValue({
      rows: [
        {
          dimensionValues: [{ value: 'google' }],
          metricValues: [{ value: '200' }, { value: '150' }],
        },
        {
          dimensionValues: [{ value: 'direct' }],
          metricValues: [{ value: '80' }, { value: '60' }],
        },
      ],
    })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const result = await service.getReport({
      input: {
        metrics: ['views', 'visitors'],
        property: 'source',
        timeframe: '30d',
      },
      req: createRequest(),
    })

    expect(result.property).toBe('source')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].dimensionValue).toBe('google')
    expect(result.rows[0].metrics.views).toBe(200)
    expect(result.rows[0].metrics.visitors).toBe(150)
    expect(result.rows[1].dimensionValue).toBe('direct')
    expect(result.rows[1].metrics.views).toBe(80)
    expect(result.rows[1].metrics.visitors).toBe(60)
    expect(runReport).toHaveBeenCalledTimes(1)
  })

  test('getReport supports landing page reports', async () => {
    const runReport = vi.fn().mockResolvedValue({
      rows: [
        {
          dimensionValues: [{ value: '/campaign-entry' }],
          metricValues: [{ value: '22' }, { value: '18' }],
        },
      ],
    })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const result = await service.getReport({
      input: {
        property: 'landingPage',
        timeframe: '30d',
      },
      req: createRequest(),
    })

    expect(result.property).toBe('landingPage')
    expect(result.metrics).toEqual(['sessions', 'visitors'])
    expect(result.rows[0].dimensionValue).toBe('/campaign-entry')
    expect(runReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: [{ name: 'landingPagePlusQueryString' }],
      }),
    )
  })

  test('getPageAggregate returns result with pagePath', async () => {
    const runReport = vi.fn().mockResolvedValue({
      rows: [
        {
          metricValues: [{ value: '42' }, { value: '30' }],
        },
      ],
    })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const result = await service.getPageAggregate({
      input: {
        metrics: ['views', 'visitors'],
        pagePath: '/about',
        timeframe: '30d',
      },
      req: createRequest(),
    })

    expect(result.pagePath).toBe('/about')
    expect(result.metrics.views).toBe(42)
    expect(result.metrics.visitors).toBe(30)
    expect(runReport).toHaveBeenCalledTimes(1)
  })

  test('propagates errors from runReport in getGlobalAggregate', async () => {
    const ga4Error = Object.assign(new Error('INVALID_ARGUMENT'), { code: 3 })
    const runReport = vi.fn().mockRejectedValue(ga4Error)

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    await expect(
      service.getGlobalAggregate({
        input: {
          metrics: ['views'],
          timeframe: '30d',
        },
        req: createRequest(),
      }),
    ).rejects.toThrow()
  })

  test('coalesces concurrent requests with the same cache key', async () => {
    let resolveReport!: (value: unknown) => void
    const runReport = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveReport = resolve
      }),
    )

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const req = createRequest()
    const input = {
      metrics: ['views'] as MetricKey[],
      timeframe: '30d' as Timeframe,
    }

    const first = service.getGlobalAggregate({ input, req })
    const second = service.getGlobalAggregate({ input, req })

    resolveReport({
      rows: [{ metricValues: [{ value: '77' }] }],
    })

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult.metrics.views).toBe(77)
    expect(secondResult.metrics.views).toBe(77)
    expect(runReport).toHaveBeenCalledTimes(1)
  })

  test('uses cache and avoids duplicate reporter calls for same key', async () => {
    const runReport = vi.fn().mockResolvedValue({
      rows: [
        {
          metricValues: [{ value: '33' }],
        },
      ],
    })

    const service = createAnalyticsService(createOptions(), {
      cacheService: createMemoryCache(),
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport,
          } as never),
      },
    })

    const req = createRequest()
    const input = {
      metrics: ['views'] as MetricKey[],
      timeframe: '30d' as Timeframe,
    }

    const first = await service.getGlobalAggregate({ input, req })
    const second = await service.getGlobalAggregate({ input, req })

    expect(first.metrics.views).toBe(33)
    expect(second.metrics.views).toBe(33)
    expect(runReport).toHaveBeenCalledTimes(1)
  })

  test('clearCache clears the cache service and returns cache status', async () => {
    const cacheClear = vi.fn().mockResolvedValue(undefined)
    const service = createAnalyticsService(createOptions(), {
      cacheService: {
        clear: cacheClear,
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
      },
      reporterService: {
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport: () => Promise.resolve({}),
          } as never),
      },
    })

    await expect(service.clearCache({ req: createRequest() })).resolves.toEqual({
      cache: {
        enabled: true,
        strategy: 'payloadCollection',
      },
      status: 'cleared',
    })
    expect(cacheClear).toHaveBeenCalledTimes(1)
  })

  test('clearCache is inert when cache is disabled', async () => {
    const cacheClear = vi.fn().mockResolvedValue(undefined)
    const service = createAnalyticsService(
      {
        ...createOptions(),
        cache: {
          ...createOptions().cache,
          enabled: false,
        },
      },
      {
        cacheService: {
          clear: cacheClear,
          get: () => Promise.resolve(undefined),
          set: () => Promise.resolve(),
        },
      },
    )

    await expect(service.clearCache({ req: createRequest() })).resolves.toEqual({
      cache: {
        enabled: false,
        strategy: 'payloadCollection',
      },
      status: 'disabled',
    })
    expect(cacheClear).not.toHaveBeenCalled()
  })

  test('destroy calls destroy on cache, limiter, and reporter services', async () => {
    const cacheDestroy = vi.fn().mockResolvedValue(undefined)
    const limiterDestroy = vi.fn()
    const reporterDestroy = vi.fn().mockResolvedValue(undefined)

    const service = createAnalyticsService(createOptions(), {
      cacheService: {
        destroy: cacheDestroy,
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
      },
      limiterService: {
        destroy: limiterDestroy,
        run: (operation) => operation(),
      },
      reporterService: {
        destroy: reporterDestroy,
        getReporter: () =>
          Promise.resolve({
            checkCompatibility: () => Promise.resolve({}),
            getMetadata: () => Promise.resolve({}),
            propertyName: 'properties/123',
            runRealtimeReport: () => Promise.resolve({}),
            runReport: () =>
              Promise.resolve({
                rows: [{ metricValues: [{ value: '1' }] }],
              }),
          } as never),
      },
    })

    await service.destroy()

    expect(cacheDestroy).toHaveBeenCalledTimes(1)
    expect(limiterDestroy).toHaveBeenCalledTimes(1)
    expect(reporterDestroy).toHaveBeenCalledTimes(1)
  })
})
