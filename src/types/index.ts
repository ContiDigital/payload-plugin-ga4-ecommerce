import type { Config, Payload, PayloadRequest } from 'payload'

export const TIMEFRAMES = ['7d', '30d', '6mo', '12mo', 'currentMonth'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const METRIC_KEYS = [
  'views',
  'visitors',
  'sessions',
  'sessionDuration',
  'bounceRate',
  'eventCount',
] as const
export type MetricKey = (typeof METRIC_KEYS)[number]

export const PROPERTY_KEYS = ['page', 'country', 'source', 'device', 'event'] as const
export type PropertyKey = (typeof PROPERTY_KEYS)[number]

export type AdminMode = 'both' | 'dashboard' | 'headless' | 'route'

export type GoogleServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

export type CredentialResolution =
  | {
      credentials: GoogleServiceAccount
      type: 'json'
    }
  | {
      path: string
      type: 'keyFilename'
    }
  | string

export type GetCredentialsFn = (args: {
  payload: null | Payload
  req?: PayloadRequest
}) => Promise<CredentialResolution>

export type CollectionAnalyticsConfig = {
  getPathname?: (doc: Record<string, unknown>) => string
  pathnameField?: string
  slug: string
}

export type AccessFn = (args: {
  payload: Payload
  req: PayloadRequest
  user: PayloadRequest['user']
}) => boolean | Promise<boolean>

export type CacheConfig = {
  aggregateTtlMs?: number
  enabled?: boolean
  maxEntries?: number
  timeseriesTtlMs?: number
}

export type RateLimitConfig = {
  baseRetryDelayMs?: number
  enabled?: boolean
  includePropertyQuota?: boolean
  jitterFactor?: number
  maxConcurrency?: number
  maxRetries?: number
  maxRetryDelayMs?: number
}

export type AdminConfig = {
  mode?: AdminMode
  navLabel?: string
  route?: `/${string}`
}

export type APIConfig = {
  basePath?: `/${string}`
}

export type EventsConfig = {
  reportLimit?: number
  trackedEventNames?: string[]
}

export const SOURCE_DIMENSION_KEYS = ['sessionSource', 'firstUserSource', 'source'] as const
export type SourceDimensionKey = (typeof SOURCE_DIMENSION_KEYS)[number]

export type SourceConfig = {
  dimension?: SourceDimensionKey
}

export type PayloadGA4AnalyticsPluginOptions = {
  access?: AccessFn
  admin?: AdminConfig
  api?: APIConfig
  cache?: CacheConfig
  collections?: CollectionAnalyticsConfig[]
  disabled?: boolean
  events?: EventsConfig
  getCredentials: GetCredentialsFn
  propertyId: string
  rateLimit?: RateLimitConfig
  source?: SourceConfig
}

export type NormalizedPluginOptions = {
  access?: AccessFn
  admin: {
    mode: AdminMode
    navLabel: string
    route: `/${string}`
  }
  api: {
    basePath: `/${string}`
  }
  cache: {
    aggregateTtlMs: number
    enabled: boolean
    maxEntries: number
    timeseriesTtlMs: number
  }
  collections: CollectionAnalyticsConfig[]
  disabled: boolean
  events: {
    reportLimit: number
    trackedEventNames: string[]
  }
  getCredentials: GetCredentialsFn
  propertyId: string
  rateLimit: {
    baseRetryDelayMs: number
    enabled: boolean
    includePropertyQuota: boolean
    jitterFactor: number
    maxConcurrency: number
    maxRetries: number
    maxRetryDelayMs: number
  }
  source: {
    dimension: SourceDimensionKey
  }
}

export type DateRange = {
  endDate: string
  startDate: string
}

export type MetricDelta = {
  absolute: number
  percentChange: null | number
}

export type AggregateComparison = {
  deltas: Partial<Record<MetricKey, MetricDelta>>
  previousMetrics: Partial<Record<MetricKey, number>>
  previousRange: DateRange
}

export type AggregateResult = {
  comparison?: AggregateComparison
  metrics: Partial<Record<MetricKey, number>>
  pagePath?: string
  range: DateRange
  timeframe: Timeframe
}

export type TimeseriesPoint = {
  date: string
} & Partial<Record<MetricKey, number>>

export type TimeseriesResult = {
  metrics: MetricKey[]
  pagePath?: string
  points: TimeseriesPoint[]
  range: DateRange
  timeframe: Timeframe
}

export type ReportRow = {
  dimensionValue: string
  metrics: Partial<Record<MetricKey, number>>
}

export type ReportResult = {
  eventNames?: string[]
  limit: number
  metrics: MetricKey[]
  pagePath?: string
  property: PropertyKey
  range: DateRange
  rows: ReportRow[]
  timeframe: Timeframe
}

export type MetadataItem = {
  apiName: string
  category?: string
  deprecated?: boolean
  description?: string
  uiName?: string
}

export type MetadataResult = {
  dimensions: MetadataItem[]
  metrics: MetadataItem[]
}

export type CompatibilityResult = {
  dimensions: Array<{
    apiName: string
    compatibility: string
  }>
  metrics: Array<{
    apiName: string
    compatibility: string
  }>
  property: PropertyKey
}

export type LiveResult = {
  visitors: number
}

export type GlobalAggregateInput = {
  comparePrevious?: boolean
  metrics?: MetricKey[]
  timeframe?: Timeframe
  useCache?: boolean
}

export type GlobalTimeseriesInput = {
  metrics?: MetricKey[]
  timeframe?: Timeframe
  useCache?: boolean
}

export type PageAggregateInput = {
  comparePrevious?: boolean
  metrics?: MetricKey[]
  pagePath: string
  timeframe?: Timeframe
  useCache?: boolean
}

export type PageTimeseriesInput = {
  metrics?: MetricKey[]
  pagePath: string
  timeframe?: Timeframe
  useCache?: boolean
}

export type ReportInput = {
  eventNames?: string[]
  limit?: number
  metrics?: MetricKey[]
  pagePath?: string
  property: PropertyKey
  timeframe?: Timeframe
  useCache?: boolean
}

export type CompatibilityInput = {
  metrics?: MetricKey[]
  property: PropertyKey
}

export type HealthResult = {
  adminMode: AdminMode
  cache: {
    aggregateTtlMs: number
    enabled: boolean
    maxEntries: number
    timeseriesTtlMs: number
  }
  events: {
    reportLimit: number
    trackedEventNames: string[]
  }
  rateLimit: {
    baseRetryDelayMs: number
    enabled: boolean
    includePropertyQuota: boolean
    jitterFactor: number
    maxConcurrency: number
    maxRetries: number
    maxRetryDelayMs: number
  }
  routePath: string
  source: {
    dimension: SourceDimensionKey
  }
  status: 'ok'
  timestamp: string
}

export type Plugin = Exclude<Config['plugins'], undefined>[number]
