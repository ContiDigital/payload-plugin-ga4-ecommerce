import { describe, expect, test } from 'vitest'

import { normalizePluginOptions } from './normalizeOptions.js'

describe('normalizePluginOptions', () => {
  const base = {
    getCredentials: () => Promise.resolve('dev/.google-credentials.json'),
    propertyId: '123456789',
  } as const

  test('defaults source attribution dimension to sessionSource', () => {
    const normalized = normalizePluginOptions(base)

    expect(normalized.cache.maxEntries).toBe(1_000)
    expect(normalized.source.dimension).toBe('sessionSource')
  })

  test('accepts an explicit source attribution dimension', () => {
    const normalized = normalizePluginOptions({
      ...base,
      source: {
        dimension: 'firstUserSource',
      },
    })

    expect(normalized.source.dimension).toBe('firstUserSource')
  })

  test('falls back to sessionSource for invalid source dimension input', () => {
    const normalized = normalizePluginOptions({
      ...base,
      source: {
        dimension: 'bad-value' as never,
      },
    })

    expect(normalized.source.dimension).toBe('sessionSource')
  })

  test('normalizes cache max entries to at least one', () => {
    const normalized = normalizePluginOptions({
      ...base,
      cache: {
        maxEntries: 0,
      },
    })

    expect(normalized.cache.maxEntries).toBe(1)
  })
})
