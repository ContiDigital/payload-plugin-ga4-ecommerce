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
      .mockRejectedValueOnce({ code: 429, message: 'RESOURCE_EXHAUSTED' })
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
})
