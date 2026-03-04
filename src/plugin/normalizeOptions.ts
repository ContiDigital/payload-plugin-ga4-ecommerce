import type {
  CollectionAnalyticsConfig,
  NormalizedPluginOptions,
  PayloadGA4AnalyticsPluginOptions,
  SourceDimensionKey,
} from '../types/index.js'

import {
  DEFAULT_ADMIN_NAV_LABEL,
  DEFAULT_ADMIN_ROUTE_PATH,
  DEFAULT_AGGREGATE_TTL_MS,
  DEFAULT_API_BASE_PATH,
  DEFAULT_BASE_RETRY_DELAY_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_EVENTS_REPORT_LIMIT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_RETRY_DELAY_MS,
  DEFAULT_RETRY_JITTER_FACTOR,
  DEFAULT_SOURCE_DIMENSION,
  DEFAULT_TIMESERIES_TTL_MS,
} from '../constants.js'

const DEFAULT_ADMIN_MODE: NormalizedPluginOptions['admin']['mode'] = 'route'

const normalizePath = (value: string): `/${string}` => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) {
    return `/${trimmed}`
  }
  return trimmed as `/${string}`
}

const validateCollections = (collections: CollectionAnalyticsConfig[]): void => {
  for (const collection of collections) {
    const hasPathnameField = typeof collection.pathnameField === 'string' && collection.pathnameField.length > 0
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

  const integerValue = Math.floor(value)

  if (integerValue < 1) {
    return 1
  }

  return integerValue
}

const normalizeSourceDimension = (value: string | undefined): SourceDimensionKey => {
  if (value === 'sessionSource' || value === 'firstUserSource' || value === 'source') {
    return value
  }

  return DEFAULT_SOURCE_DIMENSION
}

export const normalizePluginOptions = (
  options: PayloadGA4AnalyticsPluginOptions,
): NormalizedPluginOptions => {
  if (options.disabled) {
    return {
      access: options.access,
      admin: {
        mode: options.admin?.mode ?? DEFAULT_ADMIN_MODE,
        navLabel: options.admin?.navLabel ?? DEFAULT_ADMIN_NAV_LABEL,
        route: normalizePath(options.admin?.route ?? DEFAULT_ADMIN_ROUTE_PATH),
      },
      api: {
        basePath: normalizePath(options.api?.basePath ?? DEFAULT_API_BASE_PATH),
      },
      cache: {
        aggregateTtlMs: options.cache?.aggregateTtlMs ?? DEFAULT_AGGREGATE_TTL_MS,
        enabled: options.cache?.enabled ?? true,
        maxEntries: normalizeCacheMaxEntries(options.cache?.maxEntries),
        timeseriesTtlMs: options.cache?.timeseriesTtlMs ?? DEFAULT_TIMESERIES_TTL_MS,
      },
      collections: options.collections ?? [],
      disabled: true,
      events: {
        reportLimit: normalizeEventReportLimit(options.events?.reportLimit),
        trackedEventNames: normalizeEventNames(options.events?.trackedEventNames),
      },
      getCredentials: options.getCredentials,
      propertyId: options.propertyId,
      rateLimit: {
        baseRetryDelayMs: options.rateLimit?.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
        enabled: options.rateLimit?.enabled ?? true,
        includePropertyQuota: options.rateLimit?.includePropertyQuota ?? true,
        jitterFactor: options.rateLimit?.jitterFactor ?? DEFAULT_RETRY_JITTER_FACTOR,
        maxConcurrency: options.rateLimit?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
        maxRetries: options.rateLimit?.maxRetries ?? DEFAULT_MAX_RETRIES,
        maxRetryDelayMs: options.rateLimit?.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      },
      source: {
        dimension: normalizeSourceDimension(options.source?.dimension),
      },
    }
  }

  if (!options.propertyId?.trim()) {
    throw new Error('Payload GA4 Analytics: propertyId is required')
  }

  if (typeof options.getCredentials !== 'function') {
    throw new Error('Payload GA4 Analytics: getCredentials must be a function')
  }

  const collections = options.collections ?? []
  validateCollections(collections)

  return {
    access: options.access,
    admin: {
      mode: options.admin?.mode ?? DEFAULT_ADMIN_MODE,
      navLabel: options.admin?.navLabel ?? DEFAULT_ADMIN_NAV_LABEL,
      route: normalizePath(options.admin?.route ?? DEFAULT_ADMIN_ROUTE_PATH),
    },
    api: {
      basePath: normalizePath(options.api?.basePath ?? DEFAULT_API_BASE_PATH),
    },
    cache: {
      aggregateTtlMs: options.cache?.aggregateTtlMs ?? DEFAULT_AGGREGATE_TTL_MS,
      enabled: options.cache?.enabled ?? true,
      maxEntries: normalizeCacheMaxEntries(options.cache?.maxEntries),
      timeseriesTtlMs: options.cache?.timeseriesTtlMs ?? DEFAULT_TIMESERIES_TTL_MS,
    },
    collections,
    disabled: false,
    events: {
      reportLimit: normalizeEventReportLimit(options.events?.reportLimit),
      trackedEventNames: normalizeEventNames(options.events?.trackedEventNames),
    },
    getCredentials: options.getCredentials,
    propertyId: options.propertyId,
    rateLimit: {
      baseRetryDelayMs: options.rateLimit?.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
      enabled: options.rateLimit?.enabled ?? true,
      includePropertyQuota: options.rateLimit?.includePropertyQuota ?? true,
      jitterFactor: options.rateLimit?.jitterFactor ?? DEFAULT_RETRY_JITTER_FACTOR,
      maxConcurrency: options.rateLimit?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      maxRetries: options.rateLimit?.maxRetries ?? DEFAULT_MAX_RETRIES,
      maxRetryDelayMs: options.rateLimit?.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
    },
    source: {
      dimension: normalizeSourceDimension(options.source?.dimension),
    },
  }
}
