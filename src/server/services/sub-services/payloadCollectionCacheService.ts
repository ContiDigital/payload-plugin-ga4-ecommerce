import type { PayloadRequest } from 'payload'

import type { CacheService } from './cacheService.js'

type CacheDoc = {
  accessedAt?: string
  createdAt?: string
  expiresAt: string
  id: number | string
  key: string
  value: unknown
}

export class PayloadCollectionCacheService implements CacheService {
  private readonly cleanupIntervalMs = 30_000
  private readonly collectionSlug: string
  private lastCleanupAt = 0
  private readonly maxEntries: number

  constructor(args: { collectionSlug: string; maxEntries: number }) {
    this.collectionSlug = args.collectionSlug
    this.maxEntries = Math.max(1, Math.floor(args.maxEntries))
  }

  private async deleteExpiredEntries(req: PayloadRequest): Promise<void> {
    await req.payload.delete({
      collection: this.collectionSlug,
      overrideAccess: true,
      req,
      where: {
        expiresAt: {
          less_than_equal: new Date().toISOString(),
        },
      },
    })
  }

  private async enforceMaxEntries(req: PayloadRequest): Promise<void> {
    const count = await req.payload.count({
      collection: this.collectionSlug,
      overrideAccess: true,
      req,
    })

    const overflow = count.totalDocs - this.maxEntries
    if (overflow <= 0) {
      return
    }

    const oldest = await req.payload.find({
      collection: this.collectionSlug,
      depth: 0,
      limit: overflow,
      overrideAccess: true,
      req,
      sort: 'accessedAt',
    })

    if (oldest.docs.length === 0) {
      return
    }

    const ids = oldest.docs.map((doc) => doc.id)
    await req.payload.delete({
      collection: this.collectionSlug,
      overrideAccess: true,
      req,
      where: {
        id: {
          in: ids,
        },
      },
    })
  }

  private async findByKey(req: PayloadRequest, key: string): Promise<CacheDoc | undefined> {
    const query = await req.payload.find({
      collection: this.collectionSlug,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: {
        key: {
          equals: key,
        },
      },
    })

    return query.docs[0] as CacheDoc | undefined
  }

  private isExpired(expiresAtISO: string): boolean {
    return Date.parse(expiresAtISO) <= Date.now()
  }

  private async maybeCleanup(req: PayloadRequest): Promise<void> {
    const now = Date.now()
    if (now - this.lastCleanupAt < this.cleanupIntervalMs) {
      return
    }

    this.lastCleanupAt = now
    await this.deleteExpiredEntries(req)
    await this.enforceMaxEntries(req)
  }

  async get<T>({ key, req }: { key: string; req: PayloadRequest }): Promise<T | undefined> {
    const entry = await this.findByKey(req, key)
    if (!entry) {
      return undefined
    }

    if (this.isExpired(entry.expiresAt)) {
      await req.payload.delete({
        id: entry.id,
        collection: this.collectionSlug,
        overrideAccess: true,
        req,
      })

      return undefined
    }

    // Touch accessedAt for LRU ordering
    void req.payload.update({
      id: entry.id,
      collection: this.collectionSlug,
      data: { accessedAt: new Date().toISOString() },
      overrideAccess: true,
      req,
    }).catch(() => {})

    return entry.value as T
  }

  async set<T>({
    key,
    req,
    ttlMs,
    value,
  }: {
    key: string
    req: PayloadRequest
    ttlMs: number
    value: T
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMs)).toISOString()
    const existing = await this.findByKey(req, key)

    if (existing) {
      await req.payload.update({
        id: existing.id,
        collection: this.collectionSlug,
        data: {
          accessedAt: new Date().toISOString(),
          expiresAt,
          value,
        },
        overrideAccess: true,
        req,
      })
    } else {
      await req.payload.create({
        collection: this.collectionSlug,
        data: {
          accessedAt: new Date().toISOString(),
          expiresAt,
          key,
          value,
        },
        overrideAccess: true,
        req,
      })
    }

    await this.maybeCleanup(req)
  }
}
