import type { PayloadRequest } from 'payload'

export interface CacheService {
  clear?: (args: { req: PayloadRequest }) => Promise<void> | void
  destroy?: () => Promise<void> | void
  get<T>(args: { key: string; req: PayloadRequest }): Promise<T | undefined>
  set<T>(args: { key: string; req: PayloadRequest; ttlMs: number; value: T }): Promise<void>
}
