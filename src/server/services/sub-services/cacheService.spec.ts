import { describe, expect, test } from 'vitest'

import { InMemoryCacheService } from './cacheService.js'

describe('InMemoryCacheService', () => {
  test('evicts the oldest key when max entries is reached', () => {
    const cache = new InMemoryCacheService(2)

    cache.set('a', 1, 10_000)
    cache.set('b', 2, 10_000)
    cache.set('c', 3, 10_000)

    expect(cache.get<number>('a')).toBeUndefined()
    expect(cache.get<number>('b')).toBe(2)
    expect(cache.get<number>('c')).toBe(3)
  })
})
