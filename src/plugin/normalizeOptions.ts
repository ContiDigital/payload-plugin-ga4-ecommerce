import type {
  AdminMode,
  CacheStrategy,
  CollectionAnalyticsConfig,
  NormalizedPluginOptions,
  PayloadGA4AnalyticsPluginOptions,
  RedisCacheConfig,
  SourceDimensionKey,
} from '../types/index.js'

import {
  DEFAULT_ADMIN_NAV_LABEL,
  DEFAULT_ADMIN_ROUTE_PATH,
  DEFAULT_AGGREGATE_TTL_MS,
  DEFAULT_API_BASE_PATH,
  DEFAULT_BASE_RETRY_DELAY_MS,
  DEFAULT_CACHE_COLLECTION_SLUG,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_STRATEGY,
  DEFAULT_EVENTS_REPORT_LIMIT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_RATE_LIMIT_QUEUE_SIZE,
  DEFAULT_MAX_REQUESTS_PER_MINUTE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_RETRY_DELAY_MS,
  DEFAULT_REDIS_CACHE_KEY_PREFIX,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_JITTER_FACTOR,
  DEFAULT_SOURCE_DIMENSION,
  DEFAULT_TIMESERIES_TTL_MS,
} from '../constants.js'

const DEFAULT_ADMIN_MODE: AdminMode = 'route'

// ---------------------------------------------------------------------------
// Primitive normalizers
// ---------------------------------------------------------------------------

const normalizePath = (value: string): `/${string}` => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) {
    return `/${trimmed}`
  }
  return trimmed as `/${string}`
}

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1, Math.floor(value))
}

const normalizeNonNegativeNumber = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(0, value)
}

const normalizeFloat01 = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(0, Math.min(1, value))
}

// ---------------------------------------------------------------------------
// Domain normalizers
// ---------------------------------------------------------------------------

const normalizeAdminMode = (value: string | undefined): AdminMode => {
  if (value === 'both' || value === 'dashboard' || value === 'headless' || value === 'route') {
    return value
  }
  return DEFAULT_ADMIN_MODE
}

const validateCollections = (collections: CollectionAnalyticsConfig[]): void => {
  for (const collection of collections) {
    const hasPathnameField =
      typeof collection.pathnameField === 'string' && collection.pathnameField.length > 0
    const hasGetPathname = typeof collection.getPathname === 'function'

    if (!hasPathnameField && !hasGetPathname) {
      throw new Error(
        `Payload GA4 Analytics: collection "${collection.slug}" must define either pathnameField or getPathname`,
      )
    }
  }
}

const normalizeEventReportLimit = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EVENTS_REPORT_LIMIT
  }

  const integerLimit = Math.floor(value)
  if (integerLimit < 1) {
    return 1
  }

  if (integerLimit > 100) {
    return 100
  }

  return integerLimit
}

const normalizeEventNames = (value: string[] | undefined): string[] => {
  if (!value) {
    return []
  }

  const normalized = value
    .map((eventName) => eventName.trim())
    .filter((eventName) => eventName.length > 0)

  return [...new Set(normalized)]
}

const normalizeCacheMaxEntries = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CACHE_MAX_ENTRIES
  }

  return Math.max(1, Math.floor(value))
}

const normalizeCacheStrategy = (value: string | undefined): CacheStrategy => {
  if (value === 'payloadCollection' || value === 'redis') {
    return value
  }

  return DEFAULT_CACHE_STRATEGY
}

const normalizeCacheCollectionSlug = (value: string | undefined): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_CACHE_COLLECTION_SLUG
  }

  return value.trim()
}

const normalizeRedisCache = (
  strategy: CacheStrategy,
  value: RedisCacheConfig | undefined,
): RedisCacheConfig | undefined => {
  if (strategy !== 'redis') {
    return undefined
  }

  if (!value || typeof value.url !== 'string' || value.url.trim().length === 0) {
    throw new Error(
      'Payload GA4 Analytics: cache.redis.url is required when cache.strategy is "redis"',
    )
  }

  return {
    keyPrefix:
      typeof value.keyPrefix === 'string' && value.keyPrefix.trim().length > 0
        ? value.keyPrefix.trim()
        : DEFAULT_REDIS_CACHE_KEY_PREFIX,
    url: value.url.trim(),
  }
}

const normalizeSourceDimension = (value: string | undefined): SourceDimensionKey => {
  if (value === 'sessionSource' || value === 'firstUserSource' || value === 'source') {
    return value
  }

  return DEFAULT_SOURCE_DIMENSION
}

// ---------------------------------------------------------------------------
// Shared builder (eliminates disabled/enabled duplication)
// ---------------------------------------------------------------------------

const buildNormalizedOptions = (
  options: PayloadGA4AnalyticsPluginOptions,
  overrides: {
    disabled: boolean
    normalizedStrategy: CacheStrategy
    redis: RedisCacheConfig | undefined
  },
): NormalizedPluginOptions => ({
  access: options.access,
  admin: {
    mode: normalizeAdminMode(options.admin?.mode),
    navLabel: options.admin?.navLabel ?? DEFAULT_ADMIN_NAV_LABEL,
    route: normalizePath(options.admin?.route ?? DEFAULT_ADMIN_ROUTE_PATH),
  },
  api: {
    basePath: normalizePath(options.api?.basePath ?? DEFAULT_API_BASE_PATH),
  },
  autoInjectUI: options.autoInjectUI ?? true,
  cache: {
    aggregateTtlMs: normalizePositiveInteger(
      options.cache?.aggregateTtlMs,
      DEFAULT_AGGREGATE_TTL_MS,
    ),
    collectionSlug: normalizeCacheCollectionSlug(options.cache?.collectionSlug),
    enabled: options.cache?.enabled ?? true,
    maxEntries: normalizeCacheMaxEntries(options.cache?.maxEntries),
    redis: overrides.redis,
    strategy: overrides.normalizedStrategy,
    timeseriesTtlMs: normalizePositiveInteger(
      options.cache?.timeseriesTtlMs,
      DEFAULT_TIMESERIES_TTL_MS,
    ),
  },
  collections: options.collections ?? [],
  disabled: overrides.disabled,
  events: {
    reportLimit: normalizeEventReportLimit(options.events?.reportLimit),
    trackedEventNames: normalizeEventNames(options.events?.trackedEventNames),
  },
  getCredentials: options.getCredentials,
  propertyId: (options.propertyId ?? '').trim(),
  rateLimit: {
    baseRetryDelayMs: normalizePositiveInteger(
      options.rateLimit?.baseRetryDelayMs,
      DEFAULT_BASE_RETRY_DELAY_MS,
    ),
    enabled: options.rateLimit?.enabled ?? true,
    includePropertyQuota: options.rateLimit?.includePropertyQuota ?? true,
    jitterFactor: normalizeFloat01(options.rateLimit?.jitterFactor, DEFAULT_RETRY_JITTER_FACTOR),
    maxConcurrency: normalizePositiveInteger(
      options.rateLimit?.maxConcurrency,
      DEFAULT_MAX_CONCURRENCY,
    ),
    maxQueueSize: normalizePositiveInteger(
      options.rateLimit?.maxQueueSize,
      DEFAULT_MAX_RATE_LIMIT_QUEUE_SIZE,
    ),
    maxRequestsPerMinute: normalizePositiveInteger(
      options.rateLimit?.maxRequestsPerMinute,
      DEFAULT_MAX_REQUESTS_PER_MINUTE,
    ),
    maxRetries: normalizeNonNegativeNumber(options.rateLimit?.maxRetries, DEFAULT_MAX_RETRIES),
    maxRetryDelayMs: normalizePositiveInteger(
      options.rateLimit?.maxRetryDelayMs,
      DEFAULT_MAX_RETRY_DELAY_MS,
    ),
    requestTimeoutMs: normalizePositiveInteger(
      options.rateLimit?.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
  },
  source: {
    dimension: normalizeSourceDimension(options.source?.dimension),
  },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const normalizePluginOptions = (
  options: PayloadGA4AnalyticsPluginOptions,
): NormalizedPluginOptions => {
  const normalizedStrategy = normalizeCacheStrategy(options.cache?.strategy)
  const cacheEnabled = options.cache?.enabled ?? true

  if (options.disabled) {
    // Disabled path: skip Redis URL validation because no connection is needed.
    return buildNormalizedOptions(options, {
      disabled: true,
      normalizedStrategy,
      redis: undefined,
    })
  }

  const trimmedPropertyId = (options.propertyId ?? '').trim()
  if (!trimmedPropertyId) {
    throw new Error('Payload GA4 Analytics: propertyId is required')
  }

  if (typeof options.getCredentials !== 'function') {
    throw new Error('Payload GA4 Analytics: getCredentials must be a function')
  }

  const collections = options.collections ?? []
  validateCollections(collections)

  return buildNormalizedOptions(options, {
    disabled: false,
    normalizedStrategy,
    redis: cacheEnabled ? normalizeRedisCache(normalizedStrategy, options.cache?.redis) : undefined,
  })
}
