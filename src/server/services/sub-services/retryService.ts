const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

const retryableStatusCodes = new Set([429, 500, 502, 503, 504])

const inferStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  if ('code' in error && typeof error.code === 'number') {
    return error.code
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status
  }

  return undefined
}

const isRetryable = (error: unknown): boolean => {
  const status = inferStatusCode(error)

  if (status && retryableStatusCodes.has(status)) {
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
    const jitter = expDelay * this.jitterFactor * Math.random()
    return Math.round(expDelay + jitter)
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0

    while (true) {
      try {
        return await operation()
      } catch (error) {
        if (attempt >= this.maxRetries || !isRetryable(error)) {
          throw error
        }

        const retryDelay = this.computeDelayMs(attempt)
        attempt += 1
        await sleep(retryDelay)
      }
    }
  }
}
