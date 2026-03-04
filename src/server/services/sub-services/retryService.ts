const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

const RETRYABLE_HTTP_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const RETRYABLE_GRPC_CODES = new Set([4, 8, 14]) // DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, UNAVAILABLE

type RetryExecutionOptions = {
  onRetry?: (args: {
    attempt: number
    delayMs: number
    error: unknown
    maxRetries: number
  }) => Promise<void> | void
}

const inferCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  if ('code' in error && typeof error.code === 'number') {
    return error.code
  }

  return undefined
}

const inferStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status
  }

  return undefined
}

const isRetryable = (error: unknown): boolean => {
  const code = inferCode(error)
  if (code !== undefined && RETRYABLE_GRPC_CODES.has(code)) {
    return true
  }

  const status = inferStatusCode(error)
  if (status !== undefined && RETRYABLE_HTTP_STATUS_CODES.has(status)) {
    return true
  }

  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('UNAVAILABLE') ||
    message.includes('DEADLINE_EXCEEDED')
  )
}

export class RetryService {
  private readonly baseDelayMs: number
  private readonly jitterFactor: number
  private readonly maxDelayMs: number
  private readonly maxRetries: number

  constructor(options: {
    baseDelayMs: number
    jitterFactor: number
    maxDelayMs: number
    maxRetries: number
  }) {
    this.baseDelayMs = Math.max(0, options.baseDelayMs)
    this.jitterFactor = Math.max(0, options.jitterFactor)
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs)
    this.maxRetries = Math.max(0, options.maxRetries)
  }

  private computeDelayMs(attempt: number): number {
    const expDelay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt)
    const fullJitterUpperBound = expDelay * (1 + this.jitterFactor)
    return Math.max(0, Math.round(Math.random() * fullJitterUpperBound))
  }

  async execute<T>(operation: () => Promise<T>, options?: RetryExecutionOptions): Promise<T> {
    let attempt = 0

    while (true) {
      try {
        return await operation()
      } catch (error) {
        if (attempt >= this.maxRetries || !isRetryable(error)) {
          throw error
        }

        const retryDelay = this.computeDelayMs(attempt)
        await options?.onRetry?.({
          attempt: attempt + 1,
          delayMs: retryDelay,
          error,
          maxRetries: this.maxRetries,
        })
        attempt += 1
        await sleep(retryDelay)
      }
    }
  }
}
