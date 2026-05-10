export class RateLimitQueueOverflowError extends Error {
  readonly status = 429

  constructor() {
    super('Analytics request queue is full')
    this.name = 'RateLimitQueueOverflowError'
  }
}

export class RateLimiterDestroyedError extends Error {
  readonly status = 503

  constructor() {
    super('Analytics request limiter has been destroyed')
    this.name = 'RateLimiterDestroyedError'
  }
}

type QueueEntry = {
  reject: (error: Error) => void
  resolve: () => void
}

/**
 * In-memory concurrency limiter for outbound GA4 API requests.
 *
 * IMPORTANT: This limiter is per-process / per-node. In multi-instance
 * deployments, each instance enforces its own limit independently. To
 * maintain effective global concurrency, divide `maxConcurrency` by the
 * expected number of instances.
 */
export class RateLimiterService {
  private active = 0
  private destroyed = false
  private readonly maxConcurrency: number
  private readonly maxQueueSize: number
  private readonly queue: QueueEntry[] = []

  constructor(maxConcurrency: number, maxQueueSize = 100) {
    this.maxConcurrency = Math.max(1, maxConcurrency)
    this.maxQueueSize = Math.max(1, Math.floor(maxQueueSize))
  }

  private acquire(): Promise<void> {
    if (this.destroyed) {
      throw new RateLimiterDestroyedError()
    }

    if (this.active < this.maxConcurrency) {
      this.active += 1
      return Promise.resolve()
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new RateLimitQueueOverflowError()
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        reject,
        resolve: () => {
          if (this.destroyed) {
            reject(new RateLimiterDestroyedError())
            return
          }

          this.active += 1
          resolve()
        },
      })
    })
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1)

    if (this.destroyed) {
      return
    }

    const next = this.queue.shift()
    if (next) {
      next.resolve()
    }
  }

  destroy(): void {
    this.destroyed = true
    const error = new RateLimiterDestroyedError()
    while (this.queue.length > 0) {
      this.queue.shift()?.reject(error)
    }
    this.active = 0
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire()

    try {
      return await operation()
    } finally {
      this.release()
    }
  }
}
