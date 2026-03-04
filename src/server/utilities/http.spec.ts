import type { PayloadRequest } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { errorResponse } from './http.js'

const createRequest = (): PayloadRequest => {
  return {
    payload: {
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    },
  } as unknown as PayloadRequest
}

describe('errorResponse', () => {
  test('returns a sanitized message for server errors', async () => {
    const req = createRequest()
    const response = errorResponse(req, new Error('do not leak this'))

    expect(response.status).toBe(500)

    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('Internal analytics error')
  })

  test('returns original message for client errors', async () => {
    const req = createRequest()
    const error = new Error('bad request') as { status?: number } & Error
    error.status = 400
    const response = errorResponse(req, error)

    expect(response.status).toBe(400)

    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('bad request')
  })
})
