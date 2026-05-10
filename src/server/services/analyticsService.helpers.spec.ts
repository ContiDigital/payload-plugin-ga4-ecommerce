import { describe, expect, test } from 'vitest'

import {
  buildCacheKey,
  buildInListFilter,
  buildPagePathFilter,
  combineDimensionFilters,
  parseMetricNumber,
  toMetricDeltaMap,
  toMetricValueMap,
  toPropertyQuota,
} from './analyticsService.js'

describe('analyticsService helper functions', () => {
  test('parseMetricNumber handles null and invalid values', () => {
    expect(parseMetricNumber(undefined)).toBe(0)
    expect(parseMetricNumber(null)).toBe(0)
    expect(parseMetricNumber('NaN')).toBe(0)
    expect(parseMetricNumber('Infinity')).toBe(0)
    expect(parseMetricNumber('123.45')).toBe(123.45)
  })

  test('toMetricValueMap aligns metric values by index', () => {
    const metrics = ['views', 'visitors'] as const
    const values = [{ value: '12' }, { value: '8' }]

    expect(toMetricValueMap([...metrics], values)).toEqual({
      views: 12,
      visitors: 8,
    })
  })

  test('toMetricDeltaMap handles division-by-zero for percent change', () => {
    const result = toMetricDeltaMap({
      currentMetrics: { views: 100, visitors: 0 },
      metrics: ['views', 'visitors'],
      previousMetrics: { views: 50, visitors: 0 },
    })

    expect(result.views).toEqual({
      absolute: 50,
      percentChange: 100,
    })
    expect(result.visitors).toEqual({
      absolute: 0,
      percentChange: null,
    })
  })

  test('buildCacheKey filters nullish values and preserves order', () => {
    expect(buildCacheKey('report', undefined, 'page', null, 42)).toBe('["report","page","42"]')
  })

  test('buildCacheKey avoids delimiter collisions', () => {
    expect(buildCacheKey('a|b', 'c')).not.toBe(buildCacheKey('a', 'b|c'))
  })

  test('combineDimensionFilters merges multiple filters into andGroup', () => {
    const pageFilter = buildPagePathFilter('/products')
    const sourceFilter = buildInListFilter('eventName', ['purchase'])

    expect(combineDimensionFilters([pageFilter, sourceFilter])).toEqual({
      andGroup: {
        expressions: [pageFilter, sourceFilter],
      },
    })
  })

  test('toPropertyQuota strips empty quota fields', () => {
    expect(
      toPropertyQuota({
        concurrentRequests: { consumed: 1, remaining: 9 },
        tokensPerDay: null,
        tokensPerHour: { consumed: null, remaining: undefined },
      }),
    ).toEqual({
      concurrentRequests: {
        consumed: 1,
        remaining: 9,
      },
    })
  })
})
