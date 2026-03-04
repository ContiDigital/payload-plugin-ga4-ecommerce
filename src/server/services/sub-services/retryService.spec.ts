import { describe, expect, it, vi } from 'vitest'

import { RetryService } from './retryService.js'

describe('RetryService', () => {
  it('retries retryable errors and eventually returns the value', async () => {
    const service = new RetryService({
      baseDelayMs: 0,
      jitterFactor: 0,
      maxDelayMs: 0,
      maxRetries: 2,
    })

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 8, message: 'RESOURCE_EXHAUSTED' })
      .mockResolvedValueOnce('ok')

    await expect(service.execute(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable errors', async () => {
    const service = new RetryService({
      baseDelayMs: 0,
      jitterFactor: 0,
      maxDelayMs: 0,
      maxRetries: 3,
    })

    const operation = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('invalid request'))

    await expect(service.execute(operation)).rejects.toThrow('invalid request')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('throws the final error when all retries are exhausted', async () => {
    const service = new RetryService({
      baseDelayMs: 0,
      jitterFactor: 0,
      maxDelayMs: 0,
      maxRetries: 2,
    })

    const finalError = { code: 8, message: 'RESOURCE_EXHAUSTED' }
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 8, message: 'RESOURCE_EXHAUSTED' })
      .mockRejectedValueOnce({ code: 8, message: 'RESOURCE_EXHAUSTED' })
      .mockRejectedValueOnce(finalError)

    await expect(service.execute(operation)).rejects.toBe(finalError)
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('retries gRPC DEADLINE_EXCEEDED (code 4)', async () => {
    const service = new RetryService({
      baseDelayMs: 0,
      jitterFactor: 0,
      maxDelayMs: 0,
      maxRetries: 1,
    })

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 4, message: 'DEADLINE_EXCEEDED' })
      .mockResolvedValueOnce('ok')

    await expect(service.execute(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('retries gRPC UNAVAILABLE (code 14)', async () => {
    const service = new RetryService({
      baseDelayMs: 0,
      jitterFactor: 0,
      maxDelayMs: 0,
      maxRetries: 1,
    })

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 14, message: 'UNAVAILABLE' })
      .mockResolvedValueOnce('ok')

    await expect(service.execute(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})
