import { describe, expect, it } from 'vitest'

import { parseGA4DateDimension, resolveDateRange, shiftDateRangeBack } from './dateRange.js'

describe('dateRange utilities', () => {
  it('resolves 30d timeframe into ISO dates', () => {
    const now = new Date('2026-03-04T12:00:00.000Z')
    const range = resolveDateRange('30d', now)

    expect(range.endDate).toBe('2026-03-04')
    expect(range.startDate).toBe('2026-02-02')
  })

  it('resolves currentMonth timeframe from first day of month', () => {
    const now = new Date('2026-03-20T12:00:00.000Z')
    const range = resolveDateRange('currentMonth', now)

    expect(range.startDate).toBe('2026-03-01')
    expect(range.endDate).toBe('2026-03-20')
  })

  it('formats GA4 compact date dimensions', () => {
    expect(parseGA4DateDimension('20260304')).toBe('2026-03-04')
    expect(parseGA4DateDimension('2026-03-04')).toBe('2026-03-04')
  })

  it('shifts ranges backward by equal duration', () => {
    const shifted = shiftDateRangeBack({
      endDate: '2026-03-04',
      startDate: '2026-02-02',
    })

    expect(shifted.startDate).toBe('2026-01-02')
    expect(shifted.endDate).toBe('2026-02-01')
  })

  it('throws for invalid ranges', () => {
    expect(() =>
      shiftDateRangeBack({
        endDate: '2026-03-01',
        startDate: '2026-03-04',
      }),
    ).toThrow('startDate 2026-03-04 is after endDate 2026-03-01')
  })
})
