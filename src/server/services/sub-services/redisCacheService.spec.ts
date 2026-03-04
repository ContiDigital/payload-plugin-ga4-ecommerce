import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMulti = {
  del: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockReturnThis(),
  zAdd: vi.fn().mockReturnThis(),
  zRem: vi.fn().mockReturnThis(),
}

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(1),
  disconnect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  multi: vi.fn().mockReturnValue(mockMulti),
  zAdd: vi.fn().mockResolvedValue(1),
  zCard: vi.fn().mockResolvedValue(0),
  zRange: vi.fn().mockResolvedValue([]),
  zRem: vi.fn().mockResolvedValue(0),
}

vi.mock('redis', () => ({
  createClient: () => mockClient,
}))

// Import after mock so the dynamic import('redis') resolves to our mock
const { RedisCacheService } = await import('./redisCacheService.js')

const fakeReq = {} as PayloadRequest

describe('RedisCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMulti.del.mockReturnValue(mockMulti)
    mockMulti.exec.mockResolvedValue([])
    mockMulti.set.mockReturnValue(mockMulti)
    mockMulti.zAdd.mockReturnValue(mockMulti)
    mockMulti.zRem.mockReturnValue(mockMulti)
  })

  it('retries connection after initial failure', async () => {
    mockClient.connect
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(undefined)

    const service = new RedisCacheService({
      keyPrefix: 'test',
      maxEntries: 100,
      url: 'redis://localhost:6379',
    })

    // First call should fail and clear the cached promise
    await expect(service.get({ key: 'k', req: fakeReq })).rejects.toThrow('connection refused')

    // Second call should retry connection and succeed
    mockClient.get.mockResolvedValueOnce(null)
    const result = await service.get({ key: 'k', req: fakeReq })
    expect(result).toBeUndefined()
    expect(mockClient.connect).toHaveBeenCalledTimes(2)
  })

  it('updates LRU score on successful get', async () => {
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.get.mockResolvedValueOnce(JSON.stringify({ data: 42 }))

    const service = new RedisCacheService({
      keyPrefix: 'test',
      maxEntries: 100,
      url: 'redis://localhost:6379',
    })

    const result = await service.get({ key: 'mykey', req: fakeReq })

    expect(result).toEqual({ data: 42 })
    expect(mockClient.zAdd).toHaveBeenCalledWith('test:__index__', [
      { score: expect.any(Number), value: 'test:mykey' },
    ])
  })

  it('uses atomic multi pipeline for eviction (zRem + del)', async () => {
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.zCard.mockResolvedValueOnce(5)
    mockClient.zRange.mockResolvedValueOnce(['test:old1', 'test:old2'])

    const service = new RedisCacheService({
      keyPrefix: 'test',
      maxEntries: 3,
      url: 'redis://localhost:6379',
    })

    // Trigger set which calls enforceMaxEntries
    await service.set({ key: 'newkey', req: fakeReq, ttlMs: 60000, value: 'val' })

    // Verify multi pipeline includes zRem and del calls
    expect(mockMulti.zRem).toHaveBeenCalledWith('test:__index__', ['test:old1', 'test:old2'])
    expect(mockMulti.del).toHaveBeenCalledWith('test:old1')
    expect(mockMulti.del).toHaveBeenCalledWith('test:old2')
    expect(mockMulti.exec).toHaveBeenCalled()
  })

  it('returns undefined and cleans up on JSON parse error', async () => {
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.get.mockResolvedValueOnce('not-valid-json{{{')

    const service = new RedisCacheService({
      keyPrefix: 'test',
      maxEntries: 100,
      url: 'redis://localhost:6379',
    })

    const result = await service.get({ key: 'badkey', req: fakeReq })

    expect(result).toBeUndefined()
    expect(mockClient.del).toHaveBeenCalledWith('test:badkey')
    expect(mockClient.zRem).toHaveBeenCalledWith('test:__index__', ['test:badkey'])
  })

  it('returns undefined on cache miss', async () => {
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.get.mockResolvedValueOnce(null)

    const service = new RedisCacheService({
      keyPrefix: 'test',
      maxEntries: 100,
      url: 'redis://localhost:6379',
    })

    const result = await service.get({ key: 'missing', req: fakeReq })

    expect(result).toBeUndefined()
    // Should clean up the index entry for the miss
    expect(mockClient.zRem).toHaveBeenCalledWith('test:__index__', ['test:missing'])
  })
})
