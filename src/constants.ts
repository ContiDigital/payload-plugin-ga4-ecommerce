export const PLUGIN_MODULE_ID = 'payload-ga4-analytics-plugin'

export const DEFAULT_API_BASE_PATH = '/analytics/ga4'
export const DEFAULT_ADMIN_ROUTE_PATH = '/analytics'
export const DEFAULT_ADMIN_NAV_LABEL = 'Analytics'

export const DEFAULT_AGGREGATE_TTL_MS = 5 * 60_000
export const DEFAULT_TIMESERIES_TTL_MS = 5 * 60_000
export const DEFAULT_CACHE_MAX_ENTRIES = 1_000

export const DEFAULT_MAX_CONCURRENCY = 4
export const DEFAULT_MAX_RETRIES = 3
export const DEFAULT_BASE_RETRY_DELAY_MS = 250
export const DEFAULT_MAX_RETRY_DELAY_MS = 4_000
export const DEFAULT_RETRY_JITTER_FACTOR = 0.2

export const DEFAULT_EVENTS_REPORT_LIMIT = 10

export const DEFAULT_SOURCE_DIMENSION = 'sessionSource'
