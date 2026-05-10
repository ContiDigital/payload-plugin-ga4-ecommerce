import type { PayloadRequest } from 'payload'

import type {
  AggregateResult,
  CacheClearResult,
  CompatibilityInput,
  CompatibilityResult,
  GlobalAggregateInput,
  GlobalTimeseriesInput,
  HealthResult,
  LiveResult,
  MetadataResult,
  MetricKey,
  NormalizedPluginOptions,
  PageAggregateInput,
  PageTimeseriesInput,
  PropertyQuota,
  PropertyQuotaStatus,
  ReportInput,
  ReportResult,
  TimeseriesPoint,
  TimeseriesResult,
} from '../../types/index.js'
import type { CacheService } from './sub-services/cacheService.js'
import type { GA4Reporter } from './sub-services/ga4ReporterService.js'

import {
  parseGA4DateDimension,
  resolveDateRange,
  shiftDateRangeBack,
} from '../utilities/dateRange.js'
import {
  DEFAULT_GLOBAL_AGGREGATE_METRICS,
  DEFAULT_GLOBAL_TIMESERIES_METRICS,
  DEFAULT_PAGE_AGGREGATE_METRICS,
  DEFAULT_PAGE_TIMESERIES_METRICS,
  getDefaultReportMetrics,
  METRIC_NAME_MAP,
  resolvePropertyName,
} from '../utilities/metricMap.js'
import { GA4ReporterService } from './sub-services/ga4ReporterService.js'
import { PayloadCollectionCacheService } from './sub-services/payloadCollectionCacheService.js'
import { RateLimiterService } from './sub-services/rateLimiterService.js'
import { RedisCacheService } from './sub-services/redisCacheService.js'
import { RetryService } from './sub-services/retryService.js'

export const parseMetricNumber = (value: null | string | undefined): number => {
  if (!value) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const dedupeMetrics = (metrics: readonly MetricKey[]): MetricKey[] => {
  return [...new Set(metrics)]
}

export const toMetricValueMap = (
  metrics: MetricKey[],
  metricValues: Array<{ value?: null | string }> | null | undefined,
): Partial<Record<MetricKey, number>> => {
  const result: Partial<Record<MetricKey, number>> = {}

  metrics.forEach((metric, index) => {
    result[metric] = parseMetricNumber(metricValues?.[index]?.value)
  })

  return result
}

export const toMetricDeltaMap = (args: {
  currentMetrics: Partial<Record<MetricKey, number>>
  metrics: MetricKey[]
  previousMetrics: Partial<Record<MetricKey, number>>
}) => {
  const result: Partial<
    Record<
      MetricKey,
      {
        absolute: number
        percentChange: null | number
      }
    >
  > = {}

  args.metrics.forEach((metric) => {
    const current = args.currentMetrics[metric] ?? 0
    const previous = args.previousMetrics[metric] ?? 0
    const absolute = current - previous
    const percentChange = previous === 0 ? null : (absolute / previous) * 100

    result[metric] = {
      absolute,
      percentChange,
    }
  })

  return result
}

export const buildCacheKey = (...parts: Array<null | number | string | undefined>): string => {
  const normalizedParts = parts
    .filter((part): part is number | string => part !== undefined && part !== null)
    .map((part) => String(part))

  return JSON.stringify(normalizedParts)
}

export const parseMetrics = (
  requestedMetrics: MetricKey[] | undefined,
  fallbackMetrics: readonly MetricKey[],
): MetricKey[] => {
  const base = requestedMetrics?.length ? requestedMetrics : fallbackMetrics
  return dedupeMetrics(base)
}

export const formatCompatibility = (value: null | number | string | undefined): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return 'UNKNOWN'
}

type GA4QuotaStatusLike = {
  consumed?: null | number
  remaining?: null | number
}

type GA4PropertyQuotaLike = {
  concurrentRequests?: GA4QuotaStatusLike | null
  potentiallyThresholdedRequestsPerHour?: GA4QuotaStatusLike | null
  serverErrorsPerProjectPerHour?: GA4QuotaStatusLike | null
  tokensPerDay?: GA4QuotaStatusLike | null
  tokensPerHour?: GA4QuotaStatusLike | null
  tokensPerProjectPerHour?: GA4QuotaStatusLike | null
}

const toQuotaStatus = (
  value: GA4QuotaStatusLike | null | undefined,
): PropertyQuotaStatus | undefined => {
  if (!value) {
    return undefined
  }

  const status: PropertyQuotaStatus = {}

  if (typeof value.consumed === 'number' && Number.isFinite(value.consumed)) {
    status.consumed = value.consumed
  }

  if (typeof value.remaining === 'number' && Number.isFinite(value.remaining)) {
    status.remaining = value.remaining
  }

  return Object.keys(status).length > 0 ? status : undefined
}

export const toPropertyQuota = (
  value: GA4PropertyQuotaLike | null | undefined,
): PropertyQuota | undefined => {
  if (!value) {
    return undefined
  }

  const quota: PropertyQuota = {
    concurrentRequests: toQuotaStatus(value.concurrentRequests),
    potentiallyThresholdedRequestsPerHour: toQuotaStatus(
      value.potentiallyThresholdedRequestsPerHour,
    ),
    serverErrorsPerProjectPerHour: toQuotaStatus(value.serverErrorsPerProjectPerHour),
    tokensPerDay: toQuotaStatus(value.tokensPerDay),
    tokensPerHour: toQuotaStatus(value.tokensPerHour),
    tokensPerProjectPerHour: toQuotaStatus(value.tokensPerProjectPerHour),
  }

  const definedEntries = Object.entries(quota).filter(
    (entry): entry is [keyof PropertyQuota, PropertyQuotaStatus] => Boolean(entry[1]),
  )

  return definedEntries.length > 0
    ? (Object.fromEntries(definedEntries) as PropertyQuota)
    : undefined
}

export const buildPagePathFilter = (pagePath?: string) => {
  if (!pagePath) {
    return undefined
  }

  return {
    filter: {
      fieldName: 'pagePath',
      stringFilter: {
        matchType: 'EXACT' as const,
        value: pagePath,
      },
    },
  }
}

export const buildInListFilter = (fieldName: string, values: string[]) => {
  if (values.length === 0) {
    return undefined
  }

  return {
    filter: {
      fieldName,
      inListFilter: {
        values,
      },
    },
  }
}

export const combineDimensionFilters = (
  filters: Array<null | Record<string, unknown> | undefined>,
): Record<string, unknown> | undefined => {
  const normalized = filters.filter((filter): filter is Record<string, unknown> => Boolean(filter))

  if (normalized.length === 0) {
    return undefined
  }

  if (normalized.length === 1) {
    return normalized[0]
  }

  return {
    andGroup: {
      expressions: normalized,
    },
  }
}

export const toClientValidationError = (message: string) => {
  const error = new Error(message) as { status: number } & Error
  error.status = 400
  return error
}

export const extractErrorDetails = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof error.details === 'string'
  ) {
    return error.details
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const isGa4InvalidArgumentError = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 3
}

export type AnalyticsService = {
  checkCompatibility: (args: {
    input: CompatibilityInput
    req: PayloadRequest
  }) => Promise<CompatibilityResult>
  clearCache: (args: { req: PayloadRequest }) => Promise<CacheClearResult>
  destroy: () => Promise<void>
  getGlobalAggregate: (args: {
    input: GlobalAggregateInput
    req: PayloadRequest
  }) => Promise<AggregateResult>
  getGlobalTimeseries: (args: {
    input: GlobalTimeseriesInput
    req: PayloadRequest
  }) => Promise<TimeseriesResult>
  getHealth: () => HealthResult
  getLiveVisitors: (args: { req: PayloadRequest }) => Promise<LiveResult>
  getMetadata: (args: { req: PayloadRequest }) => Promise<MetadataResult>
  getPageAggregate: (args: {
    input: PageAggregateInput
    req: PayloadRequest
  }) => Promise<AggregateResult>
  getPageTimeseries: (args: {
    input: PageTimeseriesInput
    req: PayloadRequest
  }) => Promise<TimeseriesResult>
  getReport: (args: { input: ReportInput; req: PayloadRequest }) => Promise<ReportResult>
}

type AnalyticsServiceDependencies = {
  cacheService?: CacheService
  limiterService?: Pick<RateLimiterService, 'destroy' | 'run'>
  reporterService?: {
    destroy?: () => Promise<void>
    getReporter: (req: PayloadRequest) => Promise<GA4Reporter>
  }
  retryService?: Pick<RetryService, 'execute'>
}

const noopCacheService: CacheService = {
  clear: () => Promise.resolve(),
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
}

const createDefaultCacheService = (options: NormalizedPluginOptions): CacheService => {
  if (!options.cache.enabled) {
    return noopCacheService
  }

  if (options.cache.strategy === 'redis') {
    return new RedisCacheService({
      keyPrefix: options.cache.redis!.keyPrefix!,
      maxEntries: options.cache.maxEntries,
      url: options.cache.redis!.url,
    })
  }

  return new PayloadCollectionCacheService({
    collectionSlug: options.cache.collectionSlug,
    maxEntries: options.cache.maxEntries,
  })
}

export const createAnalyticsService = (
  options: NormalizedPluginOptions,
  dependencies: AnalyticsServiceDependencies = {},
): AnalyticsService => {
  const cacheService: CacheService = dependencies.cacheService ?? createDefaultCacheService(options)

  const reporterService = dependencies.reporterService ?? new GA4ReporterService(options)

  const retryService =
    dependencies.retryService ??
    new RetryService({
      baseDelayMs: options.rateLimit.baseRetryDelayMs,
      jitterFactor: options.rateLimit.jitterFactor,
      maxDelayMs: options.rateLimit.maxRetryDelayMs,
      maxRetries: options.rateLimit.maxRetries,
    })

  const limiterService =
    dependencies.limiterService ??
    new RateLimiterService(options.rateLimit.maxConcurrency, options.rateLimit.maxQueueSize)
  const inflightByCacheKey = new Map<string, Promise<unknown>>()

  const runWithPolicy = async <T>(args: {
    operation: () => Promise<T>
    operationName: string
    req: PayloadRequest
  }): Promise<T> => {
    const runOperation = async (): Promise<T> => {
      return retryService.execute(args.operation, {
        onRetry: ({ attempt, delayMs, error, maxRetries }) => {
          args.req.payload.logger.warn(
            {
              attempt,
              delayMs,
              error,
              maxRetries,
              operation: args.operationName,
            },
            '[payload-ga4-analytics] retrying GA4 request',
          )
        },
      })
    }

    try {
      if (!options.rateLimit.enabled) {
        return await runOperation()
      }

      return await limiterService.run(runOperation)
    } catch (error) {
      args.req.payload.logger.error(
        {
          error,
          operation: args.operationName,
        },
        '[payload-ga4-analytics] analytics service operation failed',
      )
      throw error
    }
  }

  const getFromCache = async <T>({
    cacheEnabled,
    cacheKey,
    req,
  }: {
    cacheEnabled: boolean
    cacheKey: string
    req: PayloadRequest
  }): Promise<T | undefined> => {
    if (!cacheEnabled) {
      return undefined
    }

    return cacheService.get<T>({
      key: cacheKey,
      req,
    })
  }

  const setInCache = async <T>({
    cacheEnabled,
    cacheKey,
    req,
    ttlMs,
    value,
  }: {
    cacheEnabled: boolean
    cacheKey: string
    req: PayloadRequest
    ttlMs: number
    value: T
  }): Promise<void> => {
    if (!cacheEnabled) {
      return
    }

    await cacheService.set({
      key: cacheKey,
      req,
      ttlMs,
      value,
    })
  }

  const coalesceByCacheKey = async <T>(args: {
    cacheEnabled: boolean
    cacheKey: string
    operation: () => Promise<T>
  }): Promise<T> => {
    if (!args.cacheEnabled) {
      return args.operation()
    }

    const inflight = inflightByCacheKey.get(args.cacheKey)
    if (inflight) {
      return inflight as Promise<T>
    }

    const nextPromise = args.operation().finally(() => {
      inflightByCacheKey.delete(args.cacheKey)
    })

    inflightByCacheKey.set(args.cacheKey, nextPromise)
    return nextPromise
  }

  const runAggregate = async (args: {
    cacheEnabled: boolean
    cacheKey: string
    comparePrevious: boolean
    fallbackMetrics: readonly MetricKey[]
    inputMetrics: MetricKey[] | undefined
    pagePath?: string
    req: PayloadRequest
    timeframe: GlobalAggregateInput['timeframe']
  }): Promise<AggregateResult> => {
    const timeframe = args.timeframe ?? '30d'
    const metrics = parseMetrics(args.inputMetrics, args.fallbackMetrics)

    const cached = await getFromCache<AggregateResult>({
      cacheEnabled: args.cacheEnabled,
      cacheKey: args.cacheKey,
      req: args.req,
    })
    if (cached) {
      return cached
    }

    return coalesceByCacheKey({
      cacheEnabled: args.cacheEnabled,
      cacheKey: args.cacheKey,
      operation: async () => {
        const range = resolveDateRange(timeframe)
        const reporter = await reporterService.getReporter(args.req)
        const metricDefs = metrics.map((metric) => ({
          name: METRIC_NAME_MAP[metric],
        }))
        const pagePathFilter = buildPagePathFilter(args.pagePath)

        const currentPromise = runWithPolicy({
          operation: () =>
            reporter.runReport({
              dateRanges: [range],
              dimensionFilter: pagePathFilter,
              metrics: metricDefs,
              returnPropertyQuota: options.rateLimit.includePropertyQuota,
            }),
          operationName: 'aggregate.current',
          req: args.req,
        })

        let currentResponse: Awaited<typeof currentPromise>
        let previousResponse: Awaited<typeof currentPromise> | undefined
        let previousRange: ReturnType<typeof shiftDateRangeBack> | undefined

        if (args.comparePrevious) {
          const previousRangeResolved = shiftDateRangeBack(range)
          previousRange = previousRangeResolved

          const previousPromise = runWithPolicy({
            operation: () =>
              reporter.runReport({
                dateRanges: [previousRangeResolved],
                dimensionFilter: pagePathFilter,
                metrics: metricDefs,
                returnPropertyQuota: options.rateLimit.includePropertyQuota,
              }),
            operationName: 'aggregate.previous',
            req: args.req,
          })

          ;[currentResponse, previousResponse] = await Promise.all([
            currentPromise,
            previousPromise,
          ])
        } else {
          currentResponse = await currentPromise
        }

        const currentMetrics = toMetricValueMap(metrics, currentResponse.rows?.[0]?.metricValues)

        let comparison: AggregateResult['comparison'] = undefined
        if (previousResponse && previousRange) {
          const previousMetrics = toMetricValueMap(
            metrics,
            previousResponse.rows?.[0]?.metricValues,
          )
          comparison = {
            deltas: toMetricDeltaMap({
              currentMetrics,
              metrics,
              previousMetrics,
            }),
            previousMetrics,
            previousRange,
          }
        }

        const result: AggregateResult = {
          comparison,
          metrics: currentMetrics,
          pagePath: args.pagePath,
          propertyQuota: toPropertyQuota(currentResponse.propertyQuota),
          range,
          timeframe,
        }

        await setInCache({
          cacheEnabled: args.cacheEnabled,
          cacheKey: args.cacheKey,
          req: args.req,
          ttlMs: options.cache.aggregateTtlMs,
          value: result,
        })

        return result
      },
    })
  }

  const runTimeseries = async (args: {
    cacheEnabled: boolean
    cacheKey: string
    fallbackMetrics: readonly MetricKey[]
    inputMetrics: MetricKey[] | undefined
    pagePath?: string
    req: PayloadRequest
    timeframe: GlobalTimeseriesInput['timeframe']
  }): Promise<TimeseriesResult> => {
    const timeframe = args.timeframe ?? '30d'
    const metrics = parseMetrics(args.inputMetrics, args.fallbackMetrics)

    const cached = await getFromCache<TimeseriesResult>({
      cacheEnabled: args.cacheEnabled,
      cacheKey: args.cacheKey,
      req: args.req,
    })
    if (cached) {
      return cached
    }

    return coalesceByCacheKey({
      cacheEnabled: args.cacheEnabled,
      cacheKey: args.cacheKey,
      operation: async () => {
        const range = resolveDateRange(timeframe)
        const reporter = await reporterService.getReporter(args.req)

        const response = await runWithPolicy({
          operation: () =>
            reporter.runReport({
              dateRanges: [range],
              dimensionFilter: buildPagePathFilter(args.pagePath),
              dimensions: [{ name: 'date' }],
              keepEmptyRows: false,
              metrics: metrics.map((metric) => ({
                name: METRIC_NAME_MAP[metric],
              })),
              orderBys: [
                {
                  dimension: {
                    dimensionName: 'date',
                  },
                },
              ],
              returnPropertyQuota: options.rateLimit.includePropertyQuota,
            }),
          operationName: 'timeseries',
          req: args.req,
        })

        const points: TimeseriesPoint[] =
          response.rows?.map((row) => {
            const dateValue = row.dimensionValues?.[0]?.value ?? ''

            return {
              date: parseGA4DateDimension(dateValue),
              ...toMetricValueMap(metrics, row.metricValues),
            }
          }) ?? []

        const result: TimeseriesResult = {
          metrics,
          pagePath: args.pagePath,
          points,
          propertyQuota: toPropertyQuota(response.propertyQuota),
          range,
          timeframe,
        }

        await setInCache({
          cacheEnabled: args.cacheEnabled,
          cacheKey: args.cacheKey,
          req: args.req,
          ttlMs: options.cache.timeseriesTtlMs,
          value: result,
        })

        return result
      },
    })
  }

  const getGlobalAggregate: AnalyticsService['getGlobalAggregate'] = async ({ input, req }) => {
    const timeframe = input.timeframe ?? '30d'
    const metrics = parseMetrics(input.metrics, DEFAULT_GLOBAL_AGGREGATE_METRICS)
    const cacheEnabled = options.cache.enabled && input.useCache !== false
    const comparePrevious = input.comparePrevious === true

    return runAggregate({
      cacheEnabled,
      cacheKey: buildCacheKey(
        'globalAggregate',
        timeframe,
        metrics.join(','),
        comparePrevious ? 'compare' : 'no-compare',
      ),
      comparePrevious,
      fallbackMetrics: DEFAULT_GLOBAL_AGGREGATE_METRICS,
      inputMetrics: input.metrics,
      req,
      timeframe,
    })
  }

  const getGlobalTimeseries: AnalyticsService['getGlobalTimeseries'] = async ({ input, req }) => {
    const timeframe = input.timeframe ?? '30d'
    const metrics = parseMetrics(input.metrics, DEFAULT_GLOBAL_TIMESERIES_METRICS)
    const cacheEnabled = options.cache.enabled && input.useCache !== false

    return runTimeseries({
      cacheEnabled,
      cacheKey: buildCacheKey('globalTimeseries', timeframe, metrics.join(',')),
      fallbackMetrics: DEFAULT_GLOBAL_TIMESERIES_METRICS,
      inputMetrics: input.metrics,
      req,
      timeframe,
    })
  }

  const getPageAggregate: AnalyticsService['getPageAggregate'] = async ({ input, req }) => {
    const timeframe = input.timeframe ?? '30d'
    const metrics = parseMetrics(input.metrics, DEFAULT_PAGE_AGGREGATE_METRICS)
    const cacheEnabled = options.cache.enabled && input.useCache !== false
    const comparePrevious = input.comparePrevious === true

    return runAggregate({
      cacheEnabled,
      cacheKey: buildCacheKey(
        'pageAggregate',
        timeframe,
        input.pagePath,
        metrics.join(','),
        comparePrevious ? 'compare' : 'no-compare',
      ),
      comparePrevious,
      fallbackMetrics: DEFAULT_PAGE_AGGREGATE_METRICS,
      inputMetrics: input.metrics,
      pagePath: input.pagePath,
      req,
      timeframe,
    })
  }

  const getPageTimeseries: AnalyticsService['getPageTimeseries'] = async ({ input, req }) => {
    const timeframe = input.timeframe ?? '30d'
    const metrics = parseMetrics(input.metrics, DEFAULT_PAGE_TIMESERIES_METRICS)
    const cacheEnabled = options.cache.enabled && input.useCache !== false

    return runTimeseries({
      cacheEnabled,
      cacheKey: buildCacheKey('pageTimeseries', timeframe, input.pagePath, metrics.join(',')),
      fallbackMetrics: DEFAULT_PAGE_TIMESERIES_METRICS,
      inputMetrics: input.metrics,
      pagePath: input.pagePath,
      req,
      timeframe,
    })
  }

  const getReport: AnalyticsService['getReport'] = async ({ input, req }) => {
    const timeframe = input.timeframe ?? '30d'
    const property = input.property
    const metrics = parseMetrics(input.metrics, getDefaultReportMetrics(property))
    const limit = input.limit ?? (property === 'event' ? options.events.reportLimit : 10)
    const cacheEnabled = options.cache.enabled && input.useCache !== false
    const dimensionName = resolvePropertyName(property, options.source.dimension)
    const hasExplicitEventNames = input.eventNames !== undefined
    const eventNames =
      property === 'event'
        ? hasExplicitEventNames
          ? [...new Set(input.eventNames)]
          : options.events.trackedEventNames
        : undefined

    const cacheKey = buildCacheKey(
      'report',
      timeframe,
      property,
      dimensionName,
      input.pagePath ?? '__all__',
      eventNames?.join(',') ?? '__all-events__',
      metrics.join(','),
      limit,
    )

    const cached = await getFromCache<ReportResult>({
      cacheEnabled,
      cacheKey,
      req,
    })
    if (cached) {
      return cached
    }

    return coalesceByCacheKey({
      cacheEnabled,
      cacheKey,
      operation: async () => {
        const range = resolveDateRange(timeframe)
        const reporter = await reporterService.getReporter(req)

        const response = await (async () => {
          try {
            return await runWithPolicy({
              operation: () =>
                reporter.runReport({
                  dateRanges: [range],
                  dimensionFilter: combineDimensionFilters([
                    buildPagePathFilter(input.pagePath),
                    buildInListFilter('eventName', eventNames ?? []),
                  ]),
                  dimensions: [{ name: dimensionName }],
                  limit,
                  metrics: metrics.map((metric) => ({
                    name: METRIC_NAME_MAP[metric],
                  })),
                  orderBys: [
                    {
                      desc: true,
                      metric: {
                        metricName: METRIC_NAME_MAP[metrics[0]],
                      },
                    },
                  ],
                  returnPropertyQuota: options.rateLimit.includePropertyQuota,
                }),
              operationName: 'report',
              req,
            })
          } catch (error) {
            if (isGa4InvalidArgumentError(error)) {
              throw toClientValidationError(
                `Incompatible metric/dimension combination: ${extractErrorDetails(error)}`,
              )
            }

            throw error
          }
        })()

        const rows =
          response.rows?.map((row) => ({
            dimensionValue: row.dimensionValues?.[0]?.value ?? '',
            metrics: toMetricValueMap(metrics, row.metricValues),
          })) ?? []

        const result: ReportResult = {
          eventNames,
          limit,
          metrics,
          pagePath: input.pagePath,
          property,
          propertyQuota: toPropertyQuota(response.propertyQuota),
          range,
          rows,
          timeframe,
        }

        await setInCache({
          cacheEnabled,
          cacheKey,
          req,
          ttlMs: options.cache.aggregateTtlMs,
          value: result,
        })

        return result
      },
    })
  }

  const getMetadata: AnalyticsService['getMetadata'] = async ({ req }) => {
    const cacheEnabled = options.cache.enabled
    const cacheKey = buildCacheKey('metadata')

    const cached = await getFromCache<MetadataResult>({
      cacheEnabled,
      cacheKey,
      req,
    })
    if (cached) {
      return cached
    }

    return coalesceByCacheKey({
      cacheEnabled,
      cacheKey,
      operation: async () => {
        const reporter = await reporterService.getReporter(req)

        const response = await runWithPolicy({
          operation: () => reporter.getMetadata(),
          operationName: 'metadata',
          req,
        })

        const result: MetadataResult = {
          dimensions:
            response.dimensions?.map((dimension) => ({
              apiName: dimension.apiName ?? '',
              category: dimension.category ?? undefined,
              deprecated: dimension.deprecatedApiNames?.length
                ? Boolean(dimension.deprecatedApiNames.length)
                : false,
              description: dimension.description ?? undefined,
              uiName: dimension.uiName ?? undefined,
            })) ?? [],
          metrics:
            response.metrics?.map((metric) => ({
              apiName: metric.apiName ?? '',
              category: metric.category ?? undefined,
              deprecated: metric.deprecatedApiNames?.length
                ? Boolean(metric.deprecatedApiNames.length)
                : false,
              description: metric.description ?? undefined,
              uiName: metric.uiName ?? undefined,
            })) ?? [],
        }

        await setInCache({
          cacheEnabled,
          cacheKey,
          req,
          ttlMs: options.cache.aggregateTtlMs,
          value: result,
        })

        return result
      },
    })
  }

  const checkCompatibility: AnalyticsService['checkCompatibility'] = async ({ input, req }) => {
    const metrics = parseMetrics(input.metrics, getDefaultReportMetrics(input.property))
    const reporter = await reporterService.getReporter(req)

    const response = await runWithPolicy({
      operation: () =>
        reporter.checkCompatibility({
          dimensions: [{ name: resolvePropertyName(input.property, options.source.dimension) }],
          metrics: metrics.map((metric) => ({
            name: METRIC_NAME_MAP[metric],
          })),
        }),
      operationName: 'compatibility',
      req,
    })

    return {
      dimensions:
        response.dimensionCompatibilities?.map((item) => ({
          apiName: item.dimensionMetadata?.apiName ?? '',
          compatibility: formatCompatibility(item.compatibility),
        })) ?? [],
      metrics:
        response.metricCompatibilities?.map((item) => ({
          apiName: item.metricMetadata?.apiName ?? '',
          compatibility: formatCompatibility(item.compatibility),
        })) ?? [],
      property: input.property,
    }
  }

  const getLiveVisitors: AnalyticsService['getLiveVisitors'] = async ({ req }) => {
    const reporter = await reporterService.getReporter(req)

    const response = await runWithPolicy({
      operation: () =>
        reporter.runRealtimeReport({
          metrics: [{ name: 'activeUsers' }],
          returnPropertyQuota: options.rateLimit.includePropertyQuota,
        }),
      operationName: 'liveVisitors',
      req,
    })

    const visitors = parseMetricNumber(response.rows?.[0]?.metricValues?.[0]?.value)

    return {
      propertyQuota: toPropertyQuota(response.propertyQuota),
      visitors,
    }
  }

  const clearCache: AnalyticsService['clearCache'] = async ({ req }) => {
    if (!options.cache.enabled) {
      return {
        cache: {
          enabled: false,
          strategy: options.cache.strategy,
        },
        status: 'disabled',
      }
    }

    await cacheService.clear?.({ req })
    inflightByCacheKey.clear()

    return {
      cache: {
        enabled: true,
        strategy: options.cache.strategy,
      },
      status: 'cleared',
    }
  }

  const getHealth = (): HealthResult => {
    return {
      adminMode: options.admin.mode,
      cache: {
        enabled: options.cache.enabled,
        strategy: options.cache.strategy,
      },
      events: {
        trackedEventNames: [...options.events.trackedEventNames],
      },
      rateLimit: {
        enabled: options.rateLimit.enabled,
      },
      source: {
        dimension: options.source.dimension,
      },
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  const destroy: AnalyticsService['destroy'] = async () => {
    inflightByCacheKey.clear()

    const tasks: Array<Promise<unknown>> = []

    if (typeof cacheService.destroy === 'function') {
      tasks.push(Promise.resolve(cacheService.destroy()))
    }

    if (typeof reporterService.destroy === 'function') {
      tasks.push(Promise.resolve(reporterService.destroy()))
    }

    if (typeof limiterService.destroy === 'function') {
      tasks.push(Promise.resolve(limiterService.destroy()))
    }

    await Promise.allSettled(tasks)
  }

  return {
    checkCompatibility,
    clearCache,
    destroy,
    getGlobalAggregate,
    getGlobalTimeseries,
    getHealth,
    getLiveVisitors,
    getMetadata,
    getPageAggregate,
    getPageTimeseries,
    getReport,
  }
}
