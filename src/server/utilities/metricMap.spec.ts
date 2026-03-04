import { describe, expect, test } from 'vitest'

import { getDefaultReportMetrics, resolvePropertyName } from './metricMap.js'

describe('metricMap', () => {
  test('uses sessionSource as the default source attribution dimension', () => {
    expect(resolvePropertyName('source')).toBe('sessionSource')
  })

  test('allows overriding the source attribution dimension', () => {
    expect(resolvePropertyName('source', 'firstUserSource')).toBe('firstUserSource')
    expect(resolvePropertyName('source', 'source')).toBe('source')
  })

  test('resolves non-source properties using static mappings', () => {
    expect(resolvePropertyName('country')).toBe('country')
    expect(resolvePropertyName('device')).toBe('deviceCategory')
    expect(resolvePropertyName('event')).toBe('eventName')
    expect(resolvePropertyName('page')).toBe('pagePath')
  })

  test('keeps default report metric mappings stable', () => {
    expect(getDefaultReportMetrics('source')).toEqual(['sessions', 'visitors'])
    expect(getDefaultReportMetrics('event')).toEqual(['eventCount', 'visitors'])
  })
})
