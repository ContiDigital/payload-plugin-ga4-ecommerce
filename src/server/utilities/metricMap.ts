import type { MetricKey, PropertyKey, SourceDimensionKey } from '../../types/index.js'

import { DEFAULT_SOURCE_DIMENSION } from '../../constants.js'

export const METRIC_NAME_MAP: Record<MetricKey, string> = {
  bounceRate: 'bounceRate',
  eventCount: 'eventCount',
  sessionDuration: 'averageSessionDuration',
  sessions: 'sessions',
  views: 'screenPageViews',
  visitors: 'activeUsers',
}

const PROPERTY_NAME_BASE_MAP: Record<Exclude<PropertyKey, 'source'>, string> = {
  country: 'country',
  device: 'deviceCategory',
  event: 'eventName',
  page: 'pagePath',
}

export const resolvePropertyName = (
  property: PropertyKey,
  sourceDimension: SourceDimensionKey = DEFAULT_SOURCE_DIMENSION,
): string => {
  if (property === 'source') {
    return sourceDimension
  }

  return PROPERTY_NAME_BASE_MAP[property]
}

export const DEFAULT_GLOBAL_AGGREGATE_METRICS: MetricKey[] = [
  'views',
  'visitors',
  'sessions',
  'sessionDuration',
  'bounceRate',
]

export const DEFAULT_GLOBAL_TIMESERIES_METRICS: MetricKey[] = ['views', 'visitors']

export const DEFAULT_PAGE_AGGREGATE_METRICS: MetricKey[] = ['views', 'visitors', 'sessionDuration']

export const DEFAULT_PAGE_TIMESERIES_METRICS: MetricKey[] = ['views', 'visitors']

export const DEFAULT_REPORT_METRICS: MetricKey[] = ['views']

const DEFAULT_REPORT_METRICS_BY_PROPERTY: Record<PropertyKey, MetricKey[]> = {
  country: ['visitors', 'sessions'],
  device: ['visitors', 'sessions'],
  event: ['eventCount', 'visitors'],
  page: ['views'],
  source: ['sessions', 'visitors'],
}

export const getDefaultReportMetrics = (property: PropertyKey): MetricKey[] => {
  return DEFAULT_REPORT_METRICS_BY_PROPERTY[property]
}
