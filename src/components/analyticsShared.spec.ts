import { describe, expect, it } from 'vitest'

import { formatDelta, formatPercent } from './analyticsShared.js'

describe('analyticsShared formatting helpers', () => {
  it('formats GA4 fractional rates as percentages', () => {
    expect(formatPercent(0.2761)).toBe('27.61%')
  })

  it('formats bounce rate deltas as percentage points', () => {
    expect(
      formatDelta('bounceRate', {
        absolute: 0.1,
        percentChange: 50,
      }),
    ).toBe('+10.0 pts (+50.0%) vs previous')
  })
})
