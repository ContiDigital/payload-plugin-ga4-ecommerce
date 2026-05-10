import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { PayloadCollectionCacheService } from './payloadCollectionCacheService.js'

const createRequest = () => {
  const docs: Array<{
    accessedAt: string
    expiresAt: string
    id: string
    key: string
    value: unknown
  }> = []

  const payload = {
    count: vi.fn().mockResolvedValue({ totalDocs: docs.length }),
    create: vi.fn().mockImplementation(({ data }) => {
      docs.push({
        ...data,
        id: String(docs.length + 1),
      })

      return Promise.resolve(docs[docs.length - 1])
    }),
    delete: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockImplementation(({ where }) => {
      const key = where?.key?.equals
      const result = typeof key === 'string' ? docs.filter((doc) => doc.key === key) : docs

      return Promise.resolve({
        docs: result,
      })
    }),
    update: vi.fn().mockImplementation(({ id, data }) => {
      const index = docs.findIndex((doc) => doc.id === id)

      if (index >= 0) {
        docs[index] = {
          ...docs[index],
          ...data,
        }
      }

      return Promise.resolve(index >= 0 ? docs[index] : undefined)
    }),
  }

  return {
    docs,
    req: {
      payload,
    } as unknown as PayloadRequest,
  }
}

describe('PayloadCollectionCacheService', () => {
  it('creates and reads cache entries', async () => {
    const { req } = createRequest()
    const service = new PayloadCollectionCacheService({
      collectionSlug: 'ga4-cache',
      maxEntries: 100,
    })

    await service.set({ key: 'report', req, ttlMs: 60_000, value: { views: 12 } })

    await expect(service.get({ key: 'report', req })).resolves.toEqual({ views: 12 })
  })

  it('updates the raced entry when create loses a unique-key race', async () => {
    const { docs, req } = createRequest()
    const service = new PayloadCollectionCacheService({
      collectionSlug: 'ga4-cache',
      maxEntries: 100,
    })

    const create = req.payload.create as ReturnType<typeof vi.fn>
    create.mockImplementationOnce(() => {
      docs.push({
        id: 'raced',
        accessedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        key: 'same-key',
        value: { stale: true },
      })

      return Promise.reject(new Error('unique constraint violation'))
    })

    await service.set({ key: 'same-key', req, ttlMs: 60_000, value: { fresh: true } })

    await expect(service.get({ key: 'same-key', req })).resolves.toEqual({ fresh: true })
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'raced',
      }),
    )
  })

  it('clears all plugin cache entries', async () => {
    const { req } = createRequest()
    const service = new PayloadCollectionCacheService({
      collectionSlug: 'ga4-cache',
      maxEntries: 100,
    })

    await service.clear({ req })

    expect(req.payload.delete).toHaveBeenCalledWith({
      collection: 'ga4-cache',
      overrideAccess: true,
      req,
      where: {
        key: {
          exists: true,
        },
      },
    })
  })
})
