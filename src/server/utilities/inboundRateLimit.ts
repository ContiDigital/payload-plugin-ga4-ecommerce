import type { PayloadRequest } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'

export class InboundRateLimitExceededError extends Error {
  readonly status = 429

  constructor() {
    super('Too many analytics requests')
    this.name = 'InboundRateLimitExceededError'
  }
}

type Bucket = {
  count: number
  resetAt: number
}

const WINDOW_MS = 60_000
const buckets = new Map<string, Bucket>()

let pruneCounter = 0
const PRUNE_INTERVAL = 100

/**
 * Resolves a client key from the request for rate limiting.
 *
 * WARNING: Relies on `x-forwarded-for` or `x-real-ip` headers set by a
 * trusted reverse proxy. If the application is directly exposed without a
 * proxy, clients can spoof these headers to bypass rate limits.
 *
 * When no proxy headers are present, returns 'unknown' — all unidentifiable
 * clients share a single per-route rate limit bucket.
 */
const resolveClientKey = (req: PayloadRequest): string => {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  return 'unknown'
}

const pruneExpiredBuckets = (now: number): void => {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export const assertInboundRateLimit = (
  req: PayloadRequest,
  options: NormalizedPluginOptions,
  routeKey: string,
): void => {
  if (!options.rateLimit.enabled) {
    return
  }

  const maxRequestsPerMinute = options.rateLimit.maxRequestsPerMinute
  if (maxRequestsPerMinute < 1) {
    return
  }

  const now = Date.now()
  pruneCounter += 1
  if (pruneCounter >= PRUNE_INTERVAL) {
    pruneCounter = 0
    pruneExpiredBuckets(now)
  }

  const clientKey = resolveClientKey(req)
  const bucketKey = `${routeKey}:${clientKey}`
  const existing = buckets.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + WINDOW_MS,
    })
    return
  }

  if (existing.count >= maxRequestsPerMinute) {
    throw new InboundRateLimitExceededError()
  }

  existing.count += 1
}
