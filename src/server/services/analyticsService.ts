import type { PayloadRequest } from 'payload'

import type {
  AggregateResult,
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
  ReportInput,
  ReportResult,
  TimeseriesPoint,
  TimeseriesResult,
} from '../../types/index.js'

import { parseGA4DateDimension, resolveDateRange, shiftDateRangeBack } from '../utilities/dateRange.js'
import {
  DEFAULT_GLOBAL_AGGREGATE_METRICS,
  DEFAULT_GLOBAL_TIMESERIES_METRICS,
  DEFAULT_PAGE_AGGREGATE_METRICS,
  DEFAULT_PAGE_TIMESERIES_METRICS,
  getDefaultReportMetrics,
  METRIC_NAME_MAP,
  resolvePropertyName,
} from '../utilities/metricMap.js'
import { InMemoryCacheService } from './sub-services/cacheService.js'
import { GA4ReporterService } from './sub-services/ga4ReporterService.js'
import { RateLimiterService } from './sub-services/rateLimiterService.js'
import { RetryService } from './sub-services/retryService.js'

const parseMetricNumber = (value: null | string | undefined): number => {
  if (!value) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const dedupeMetrics = (metrics: MetricKey[]): MetricKey[] => {
  return [...new Set(metrics)]
}

const toMetricValueMap = (
  metrics: MetricKey[],
  metricValues: Array<{ value?: null | string }> | null | undefined,
): Partial<Record<MetricKey, number>> => {
  const result: Partial<Record<MetricKey, number>> = {}

  metrics.forEach((metric, index) => {
    result[metric] = parseMetricNumber(metricValues?.[index]?.value)
  })

  return result
}

const toMetricDeltaMap = (args: {
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

const buildCacheKey = (...parts: Array<null | number | string | undefined>): string => {
  return parts
    .filter((part): part is number | string => part !== undefined && part !== null)
    .map((part) => String(part))
    .join('|')
}

const parseMetrics = (
  requestedMetrics: MetricKey[] | undefined,
  fallbackMetrics: MetricKey[],
): MetricKey[] => {
  const base = requestedMetrics?.length ? requestedMetrics : fallbackMetrics
  return dedupeMetrics(base)
}

const formatCompatibility = (value: null | number | string | undefined): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return 'UNKNOWN'
}

const buildPagePathFilter = (pagePath?: string) => {
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

const buildInListFilter = (fieldName: string, values: string[]) => {
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

const combineDimensionFilters = (
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

const toClientValidationError = (message: string) => {
  const error = new Error(message) as { status: number } & Error
  error.status = 400
  return error
}

const extractErrorDetails = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'details' in error && typeof error.details === 'string') {
    return error.details
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const isGa4InvalidArgumentError = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 3
}

export type AnalyticsService = {
  checkCompatibility: (args: {
    input: CompatibilityInput
    req: PayloadRequest
  }) => Promise<CompatibilityResult>
  getGlobalAggregate: (args: { input: GlobalAggregateInput; req: PayloadRequest }) => Promise<AggregateResult>
  getGlobalTimeseries: (args: {
    input: GlobalTimeseriesInput
    req: PayloadRequest
  }) => Promise<TimeseriesResult>
  getHealth: () => HealthResult
  getLiveVisitors: (args: { req: PayloadRequest }) => Promise<LiveResult>
  getMetadata: (args: { req: PayloadRequest }) => Promise<MetadataResult>
  getPageAggregate: (args: { input: PageAggregateInput; req: PayloadRequest }) => Promise<AggregateResult>
  getPageTimeseries: (args: {
    input: PageTimeseriesInput
    req: PayloadRequest
  }) => Promise<TimeseriesResult>
  getReport: (args: { input: ReportInput; req: PayloadRequest }) => Promise<ReportResult>
}

export const createAnalyticsService = (options: NormalizedPluginOptions): AnalyticsService => {
  const cacheService = new InMemoryCacheService(options.cache.maxEntries)
  const reporterService = new GA4ReporterService(options)

  const retryService = new RetryService({
    baseDelayMs: options.rateLimit.baseRetryDelayMs,
    jitterFactor: options.rateLimit.jitterFactor,
    maxDelayMs: options.rateLimit.maxRetryDelayMs,
    maxRetries: options.rateLimit.maxRetries,
  })

  const limiterService = new RateLimiterService(options.rateLimit.maxConcurrency)

  const runWithPolicy = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (!options.rateLimit.enabled) {
      return operation()
    }

    return limiterService.run(async () => retryService.execute(operation))
  }

  const runAggregate = async (args: {
    cacheEnabled: boolean
    cacheKey: string
    comparePrevious: boolean
    fallbackMetrics: MetricKey[]
    inputMetrics: MetricKey[] | undefined
    pagePath?: string
    req: PayloadRequest
    timeframe: GlobalAggregateInput['timeframe']
  }): Promise<AggregateResult> => {
    const timeframe = args.timeframe ?? '30d'
    const metrics = parseMetrics(args.inputMetrics, args.fallbackMetrics)

    if (args.cacheEnabled) {
      const cached = cacheService.get<AggregateResult>(args.cacheKey)
      if (cached) {
        return cached
      }
    }

    const range = resolveDateRange(timeframe)
    const reporter = await reporterService.getReporter(args.req)

    const response = await runWithPolicy(() =>
      reporter.runReport({
        dateRanges: [range],
        dimensionFilter: buildPagePathFilter(args.pagePath),
        metrics: metrics.map((metric) => ({
          name: METRIC_NAME_MAP[metric],
        })),
        returnPropertyQuota: options.rateLimit.includePropertyQuota,
      }),
    )

    const row = response.rows?.[0]
    const currentMetrics = toMetricValueMap(metrics, row?.metricValues)

    let comparison: AggregateResult['comparison'] = undefined

    if (args.comparePrevious) {
      const previousRange = shiftDateRangeBack(range)

      const previousResponse = await runWithPolicy(() =>
        reporter.runReport({
          dateRanges: [previousRange],
          dimensionFilter: buildPagePathFilter(args.pagePath),
          metrics: metrics.map((metric) => ({
            name: METRIC_NAME_MAP[metric],
          })),
          returnPropertyQuota: options.rateLimit.includePropertyQuota,
        }),
      )

      const previousMetrics = toMetricValueMap(metrics, previousResponse.rows?.[0]?.metricValues)

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
      range,
      timeframe,
    }

    if (args.cacheEnabled) {
      cacheService.set(args.cacheKey, result, options.cache.aggregateTtlMs)
    }

    return result
  }

  const runTimeseries = async (args: {
    cacheEnabled: boolean
    cacheKey: string
    fallbackMetrics: MetricKey[]
    inputMetrics: MetricKey[] | undefined
    pagePath?: string
    req: PayloadRequest
    timeframe: GlobalTimeseriesInput['timeframe']
  }): Promise<TimeseriesResult> => {
    const timeframe = args.timeframe ?? '30d'
    const metrics = parseMetrics(args.inputMetrics, args.fallbackMetrics)

    if (args.cacheEnabled) {
      const cached = cacheService.get<TimeseriesResult>(args.cacheKey)
      if (cached) {
        return cached
      }
    }

    const range = resolveDateRange(timeframe)
    const reporter = await reporterService.getReporter(args.req)

    const response = await runWithPolicy(() =>
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
    )

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
      range,
      timeframe,
    }

    if (args.cacheEnabled) {
      cacheService.set(args.cacheKey, result, options.cache.timeseriesTtlMs)
    }

    return result
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

    if (cacheEnabled) {
      const cached = cacheService.get<ReportResult>(cacheKey)
      if (cached) {
        return cached
      }
    }

    const range = resolveDateRange(timeframe)
    const reporter = await reporterService.getReporter(req)

    const response = await (async () => {
      try {
        return await runWithPolicy(() =>
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
        )
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
      range,
      rows,
      timeframe,
    }

    if (cacheEnabled) {
      cacheService.set(cacheKey, result, options.cache.aggregateTtlMs)
    }

    return result
  }

  const getMetadata: AnalyticsService['getMetadata'] = async ({ req }) => {
    const cacheEnabled = options.cache.enabled
    const cacheKey = buildCacheKey('metadata')

    if (cacheEnabled) {
      const cached = cacheService.get<MetadataResult>(cacheKey)
      if (cached) {
        return cached
      }
    }

    const reporter = await reporterService.getReporter(req)

    const response = await runWithPolicy(() => reporter.getMetadata())

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

    if (cacheEnabled) {
      cacheService.set(cacheKey, result, options.cache.aggregateTtlMs)
    }

    return result
  }

  const checkCompatibility: AnalyticsService['checkCompatibility'] = async ({ input, req }) => {
    const metrics = parseMetrics(input.metrics, getDefaultReportMetrics(input.property))

    const reporter = await reporterService.getReporter(req)

    const response = await runWithPolicy(() =>
      reporter.checkCompatibility({
        dimensions: [{ name: resolvePropertyName(input.property, options.source.dimension) }],
        metrics: metrics.map((metric) => ({
          name: METRIC_NAME_MAP[metric],
        })),
      }),
    )

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

    const response = await runWithPolicy(() =>
      reporter.runRealtimeReport({
        metrics: [{ name: 'activeUsers' }],
      }),
    )

    const visitors = parseMetricNumber(response.rows?.[0]?.metricValues?.[0]?.value)

    return {
      visitors,
    }
  }

  const getHealth = (): HealthResult => {
    return {
      adminMode: options.admin.mode,
      cache: {
        aggregateTtlMs: options.cache.aggregateTtlMs,
        enabled: options.cache.enabled,
        maxEntries: options.cache.maxEntries,
        timeseriesTtlMs: options.cache.timeseriesTtlMs,
      },
      events: {
        reportLimit: options.events.reportLimit,
        trackedEventNames: [...options.events.trackedEventNames],
      },
      rateLimit: {
        baseRetryDelayMs: options.rateLimit.baseRetryDelayMs,
        enabled: options.rateLimit.enabled,
        includePropertyQuota: options.rateLimit.includePropertyQuota,
        jitterFactor: options.rateLimit.jitterFactor,
        maxConcurrency: options.rateLimit.maxConcurrency,
        maxRetries: options.rateLimit.maxRetries,
        maxRetryDelayMs: options.rateLimit.maxRetryDelayMs,
      },
      routePath: options.admin.route,
      source: {
        dimension: options.source.dimension,
      },
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  return {
    checkCompatibility,
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
