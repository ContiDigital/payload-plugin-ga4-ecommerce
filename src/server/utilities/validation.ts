import {
  METRIC_KEYS,
  type MetricKey,
  PROPERTY_KEYS,
  type ReportPropertyKey,
  type Timeframe,
  TIMEFRAMES,
} from '../../types/index.js'

const metricSet = new Set(METRIC_KEYS)
const propertySet = new Set(PROPERTY_KEYS)
const timeframeSet = new Set(TIMEFRAMES)

export class ValidationError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class UnsupportedMediaTypeError extends Error {
  readonly status = 415

  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedMediaTypeError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type JSONRequest = {
  headers: Headers
  json?: () => Promise<unknown>
}

export const parseRequestBody = async (req: JSONRequest): Promise<Record<string, unknown>> => {
  if (!req.json) {
    return {}
  }

  const contentType = req.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new UnsupportedMediaTypeError('Content-Type must be application/json')
  }

  try {
    const parsed = await req.json()
    if (!isObject(parsed)) {
      throw new ValidationError('JSON body must be an object')
    }

    return parsed
  } catch (error) {
    if (error instanceof UnsupportedMediaTypeError || error instanceof ValidationError) {
      throw error
    }

    throw new ValidationError(
      `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const ensureMetricArray = (input: unknown): MetricKey[] => {
  if (input === undefined) {
    return []
  }

  if (!Array.isArray(input)) {
    throw new ValidationError('metrics must be an array of metric keys')
  }

  const invalid = input.find((candidate) => !metricSet.has(candidate as MetricKey))
  if (invalid) {
    throw new ValidationError(`Invalid metric key: ${String(invalid)}`)
  }

  return input as MetricKey[]
}

const ensureTimeframe = (input: unknown): Timeframe | undefined => {
  if (input === undefined) {
    return undefined
  }

  if (typeof input !== 'string' || !timeframeSet.has(input as Timeframe)) {
    throw new ValidationError(`Invalid timeframe: ${String(input)}`)
  }

  return input as Timeframe
}

const ensureBoolean = (input: unknown, field: string): boolean | undefined => {
  if (input === undefined) {
    return undefined
  }

  if (typeof input !== 'boolean') {
    throw new ValidationError(`${field} must be a boolean`)
  }

  return input
}

const ensureProperty = (input: unknown): ReportPropertyKey => {
  if (typeof input !== 'string' || !propertySet.has(input as ReportPropertyKey)) {
    throw new ValidationError(`Invalid property key: ${String(input)}`)
  }

  return input as ReportPropertyKey
}

const ensurePagePath = (input: unknown): string => {
  const normalized = ensureOptionalPagePath(input)

  if (!normalized) {
    throw new ValidationError('pagePath is required')
  }

  return normalized
}

const ensureOptionalPagePath = (input: unknown): string | undefined => {
  if (input === undefined) {
    return undefined
  }

  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ValidationError('pagePath must be a non-empty string')
  }

  const normalized = input.trim()

  if (!normalized.startsWith('/')) {
    throw new ValidationError('pagePath must start with "/"')
  }

  if (normalized.length > 2_048) {
    throw new ValidationError('pagePath must be 2048 characters or fewer')
  }

  const hasControlCharacters = [...normalized].some((char) => {
    const code = char.charCodeAt(0)
    return code < 32 || code === 127
  })

  if (hasControlCharacters) {
    throw new ValidationError('pagePath must not include control characters')
  }

  return normalized
}

const ensureLimit = (input: unknown): number | undefined => {
  if (input === undefined) {
    return undefined
  }

  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new ValidationError('limit must be a finite number')
  }

  const integerLimit = Math.floor(input)

  if (integerLimit < 1 || integerLimit > 100) {
    throw new ValidationError('limit must be between 1 and 100')
  }

  return integerLimit
}

const ensureStringArray = (input: unknown, field: string): string[] | undefined => {
  if (input === undefined) {
    return undefined
  }

  if (!Array.isArray(input)) {
    throw new ValidationError(`${field} must be an array of strings`)
  }

  const normalized = input
    .map((value) => {
      if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be an array of strings`)
      }

      return value.trim()
    })
    .filter((value) => value.length > 0)

  return [...new Set(normalized)]
}

export const parseGlobalAggregateInput = (value: Record<string, unknown>) => {
  return {
    comparePrevious: ensureBoolean(value.comparePrevious, 'comparePrevious'),
    metrics: ensureMetricArray(value.metrics),
    timeframe: ensureTimeframe(value.timeframe),
    useCache: ensureBoolean(value.useCache, 'useCache'),
  }
}

export const parseGlobalTimeseriesInput = (value: Record<string, unknown>) => {
  return {
    metrics: ensureMetricArray(value.metrics),
    timeframe: ensureTimeframe(value.timeframe),
    useCache: ensureBoolean(value.useCache, 'useCache'),
  }
}

export const parsePageAggregateInput = (value: Record<string, unknown>) => {
  return {
    comparePrevious: ensureBoolean(value.comparePrevious, 'comparePrevious'),
    metrics: ensureMetricArray(value.metrics),
    pagePath: ensurePagePath(value.pagePath),
    timeframe: ensureTimeframe(value.timeframe),
    useCache: ensureBoolean(value.useCache, 'useCache'),
  }
}

export const parsePageTimeseriesInput = (value: Record<string, unknown>) => {
  return {
    metrics: ensureMetricArray(value.metrics),
    pagePath: ensurePagePath(value.pagePath),
    timeframe: ensureTimeframe(value.timeframe),
    useCache: ensureBoolean(value.useCache, 'useCache'),
  }
}

export const parseReportInput = (value: Record<string, unknown>) => {
  return {
    eventNames: ensureStringArray(value.eventNames, 'eventNames'),
    limit: ensureLimit(value.limit),
    metrics: ensureMetricArray(value.metrics),
    pagePath: ensureOptionalPagePath(value.pagePath),
    property: ensureProperty(value.property),
    timeframe: ensureTimeframe(value.timeframe),
    useCache: ensureBoolean(value.useCache, 'useCache'),
  }
}

export const parseCompatibilityInput = (value: Record<string, unknown>) => {
  return {
    metrics: ensureMetricArray(value.metrics),
    property: ensureProperty(value.property),
  }
}
