import { describe, expect, it } from 'vitest'

import {
  RateLimiterDestroyedError,
  RateLimiterService,
  RateLimitQueueOverflowError,
} from './rateLimiterService.js'

describe('RateLimiterService', () => {
  it('throws when queue capacity is exceeded', async () => {
    const service = new RateLimiterService(1, 1)

    const slowOperation = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 20)
      })

    const first = service.run(slowOperation)
    const second = service.run(slowOperation)

    await expect(service.run(slowOperation)).rejects.toBeInstanceOf(RateLimitQueueOverflowError)
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
  })

  it('enforces maxConcurrency by queuing excess operations', async () => {
    const service = new RateLimiterService(2, 10)
    let activeCount = 0
    let maxObservedActive = 0

    const resolvers: Array<() => void> = []

    const trackedOperation = () =>
      new Promise<string>((resolve) => {
        activeCount += 1
        maxObservedActive = Math.max(maxObservedActive, activeCount)
        resolvers.push(() => {
          activeCount -= 1
          resolve('done')
        })
      })

    const p1 = service.run(trackedOperation)
    const p2 = service.run(trackedOperation)
    const p3 = service.run(trackedOperation)

    // Give microtasks a tick so acquire() resolves for the first two
    await new Promise((r) => setTimeout(r, 0))

    // Only 2 should be active; third is queued
    expect(activeCount).toBe(2)
    expect(resolvers).toHaveLength(2)

    // Complete one operation to let the third start
    resolvers[0]()
    await new Promise((r) => setTimeout(r, 0))

    expect(activeCount).toBe(2) // third started, one finished -> still 2 active? No: 1 finished, 1 still running, 1 just started = 2
    expect(resolvers).toHaveLength(3)

    // Complete remaining
    resolvers[1]()
    resolvers[2]()

    await Promise.all([p1, p2, p3])

    expect(maxObservedActive).toBe(2)
  })

  it('propagates errors from operations and releases the slot', async () => {
    const service = new RateLimiterService(1, 10)
    const testError = new Error('operation failed')

    const failingOperation = () => Promise.reject(testError)

    await expect(service.run(failingOperation)).rejects.toThrow('operation failed')

    // Verify the slot was released by running another operation successfully
    const successOperation = () => Promise.resolve('success')
    await expect(service.run(successOperation)).resolves.toBe('success')
  })

  it('rejects queued operations when destroyed', async () => {
    const service = new RateLimiterService(1, 10)
    let resolveActive!: () => void

    const active = service.run(
      () =>
        new Promise<void>((resolve) => {
          resolveActive = resolve
        }),
    )
    const queued = service.run(() => Promise.resolve('queued'))

    await new Promise((r) => setTimeout(r, 0))

    service.destroy()
    resolveActive()

    await expect(queued).rejects.toBeInstanceOf(RateLimiterDestroyedError)
    await expect(active).resolves.toBeUndefined()
    await expect(service.run(() => Promise.resolve('after-destroy'))).rejects.toBeInstanceOf(
      RateLimiterDestroyedError,
    )
  })
})
