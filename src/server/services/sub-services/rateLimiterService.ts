export class RateLimiterService {
  private active = 0
  private readonly maxConcurrency: number
  private readonly queue: Array<() => void> = []

  constructor(maxConcurrency: number) {
    this.maxConcurrency = Math.max(1, maxConcurrency)
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1
        resolve()
      })
    })
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1)

    const next = this.queue.shift()
    if (next) {
      next()
    }
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
