import type { PayloadRequest } from 'payload'

import type { CacheService } from './cacheService.js'

type RedisClientLike = {
  connect: () => Promise<void>
  del: (key: string | string[]) => Promise<number>
  get: (key: string) => Promise<null | string>
  multi: () => RedisMultiLike
  zAdd: (key: string, members: Array<{ score: number; value: string }>) => Promise<number>
  zCard: (key: string) => Promise<number>
  zRange: (key: string, min: number, max: number) => Promise<string[]>
  zRem: (key: string, members: string[]) => Promise<number>
}

type RedisMultiLike = {
  del: (key: string | string[]) => RedisMultiLike
  exec: () => Promise<unknown>
  set: (key: string, value: string, options: { EX: number }) => RedisMultiLike
  zAdd: (
    key: string,
    members: Array<{
      score: number
      value: string
    }>,
  ) => RedisMultiLike
  zRem: (key: string, members: string[]) => RedisMultiLike
}

type RedisModuleLike = {
  createClient: (options: { url: string }) => RedisClientLike
}

export class RedisCacheService implements CacheService {
  private clientPromise: null | Promise<RedisClientLike> = null
  private readonly indexKey: string
  private readonly keyPrefix: string
  private readonly maxEntries: number
  private readonly url: string

  constructor(args: { keyPrefix: string; maxEntries: number; url: string }) {
    this.url = args.url
    this.maxEntries = Math.max(1, Math.floor(args.maxEntries))
    this.keyPrefix = args.keyPrefix
    this.indexKey = `${this.keyPrefix}:__index__`
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}:${key}`
  }

  private async enforceMaxEntries(client: RedisClientLike): Promise<void> {
    const count = await client.zCard(this.indexKey)
    const overflow = count - this.maxEntries

    if (overflow <= 0) {
      return
    }

    const staleKeys = await client.zRange(this.indexKey, 0, overflow - 1)
    if (staleKeys.length === 0) {
      return
    }

    const multi = client.multi().zRem(this.indexKey, staleKeys)
    for (const staleKey of staleKeys) {
      multi.del(staleKey)
    }
    await multi.exec()
  }

  private async getClient(): Promise<RedisClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        let redisModule: RedisModuleLike

        try {
          redisModule = (await import('redis')) as unknown as RedisModuleLike
        } catch {
          throw new Error(
            'Payload GA4 Analytics: cache strategy "redis" requires the "redis" package. Install it in the host app.',
          )
        }

        const client = redisModule.createClient({
          url: this.url,
        })

        await client.connect()
        return client
      })()
      // Clear cached promise on failure so next call retries
      this.clientPromise.catch(() => {
        this.clientPromise = null
      })
    }

    return this.clientPromise
  }

  async destroy(): Promise<void> {
    if (this.clientPromise) {
      try {
        const client = await this.clientPromise
        await (client as unknown as { disconnect: () => Promise<void> }).disconnect()
      } catch {
        // Swallow disconnect errors during shutdown
      } finally {
        this.clientPromise = null
      }
    }
  }

  async get<T>({ key }: { key: string; req: PayloadRequest }): Promise<T | undefined> {
    const client = await this.getClient()
    const redisKey = this.buildKey(key)
    const raw = await client.get(redisKey)

    if (!raw) {
      await client.zRem(this.indexKey, [redisKey])
      return undefined
    }

    try {
      const parsed = JSON.parse(raw) as T
      // Touch: update score for LRU ordering
      await client.zAdd(this.indexKey, [{ score: Date.now(), value: redisKey }])
      return parsed
    } catch {
      await client.del(redisKey)
      await client.zRem(this.indexKey, [redisKey])
      return undefined
    }
  }

  async set<T>({
    key,
    ttlMs,
    value,
  }: {
    key: string
    req: PayloadRequest
    ttlMs: number
    value: T
  }): Promise<void> {
    const client = await this.getClient()
    const redisKey = this.buildKey(key)
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1_000))
    const payload = JSON.stringify(value)

    await client
      .multi()
      .set(redisKey, payload, {
        EX: ttlSeconds,
      })
      .zAdd(this.indexKey, [
        {
          score: Date.now(),
          value: redisKey,
        },
      ])
      .exec()

    await this.enforceMaxEntries(client)
  }
}
