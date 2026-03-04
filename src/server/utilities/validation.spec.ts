import { describe, expect, it } from 'vitest'

import {
  parseGlobalAggregateInput,
  parsePageAggregateInput,
  parseReportInput,
  ValidationError,
} from './validation.js'

describe('analytics input validation', () => {
  it('parses comparePrevious for aggregate inputs', () => {
    const globalInput = parseGlobalAggregateInput({
      comparePrevious: true,
      metrics: ['views'],
      timeframe: '30d',
    })

    const pageInput = parsePageAggregateInput({
      comparePrevious: true,
      metrics: ['views'],
      pagePath: '/products/browse/fireplaces/regency',
      timeframe: '30d',
    })

    expect(globalInput.comparePrevious).toBe(true)
    expect(pageInput.comparePrevious).toBe(true)
  })

  it('rejects non-boolean comparePrevious values', () => {
    expect(() =>
      parsePageAggregateInput({
        comparePrevious: 'yes',
        metrics: ['views'],
        pagePath: '/products',
      }),
    ).toThrowError(ValidationError)
  })

  it('parses report input with optional pagePath filter', () => {
    const input = parseReportInput({
      eventNames: ['purchase', 'add_to_cart', 'purchase'],
      limit: 6,
      metrics: ['views', 'visitors'],
      pagePath: '/products/browse/fireplaces/regency',
      property: 'source',
      timeframe: '30d',
    })

    expect(input.pagePath).toBe('/products/browse/fireplaces/regency')
    expect(input.eventNames).toEqual(['purchase', 'add_to_cart'])
    expect(input.property).toBe('source')
  })

  it('preserves explicit empty eventNames array for event fallback queries', () => {
    const input = parseReportInput({
      eventNames: [],
      property: 'event',
    })

    expect(input.eventNames).toEqual([])
  })

  it('rejects empty report pagePath values', () => {
    expect(() =>
      parseReportInput({
        pagePath: '  ',
        property: 'source',
      }),
    ).toThrow('pagePath must be a non-empty string')
  })

  it('rejects non-string event names', () => {
    expect(() =>
      parseReportInput({
        eventNames: ['purchase', 123],
        property: 'event',
      }),
    ).toThrow('eventNames must be an array of strings')
  })
})
