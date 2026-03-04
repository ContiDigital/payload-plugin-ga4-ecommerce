export interface CacheService {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs: number): void
}

type CacheEntry = {
  expiresAt: number
  value: unknown
}

export class InMemoryCacheService implements CacheService {
  private readonly maxEntries: number
  private readonly store = new Map<string, CacheEntry>()

  constructor(maxEntries = 1_000) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries))
  }

  private pruneExpiredEntries(): void {
    const now = Date.now()

    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key)
      }
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }

    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.pruneExpiredEntries()

    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey)
      }
    }

    this.store.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    })
  }
}
