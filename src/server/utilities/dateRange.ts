import type { DateRange, Timeframe } from '../../types/index.js'

const DAY_MS = 24 * 60 * 60 * 1000

const toISODate = (input: Date): string => input.toISOString().slice(0, 10)

const subtractDays = (date: Date, days: number): Date => new Date(date.getTime() - days * DAY_MS)

const subtractMonths = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  const targetMonthIndex = year * 12 + month - months
  const targetYear = Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12

  const targetMonthLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, targetMonthLastDay)

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

const parseISODate = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`)

  if (!Number.isFinite(date.getTime()) || toISODate(date) !== value) {
    throw new Error(`Invalid ISO date value: ${value}`)
  }

  return date
}

export const resolveDateRange = (timeframe: Timeframe, now: Date = new Date()): DateRange => {
  const endDate = toISODate(now)

  if (timeframe === '7d') {
    return {
      endDate,
      startDate: toISODate(subtractDays(now, 7)),
    }
  }

  if (timeframe === '30d') {
    return {
      endDate,
      startDate: toISODate(subtractDays(now, 30)),
    }
  }

  if (timeframe === '6mo') {
    return {
      endDate,
      startDate: toISODate(subtractMonths(now, 6)),
    }
  }

  if (timeframe === '12mo') {
    return {
      endDate,
      startDate: toISODate(subtractMonths(now, 12)),
    }
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  return {
    endDate,
    startDate: toISODate(monthStart),
  }
}

export const parseGA4DateDimension = (value: string): string => {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  return value
}

export const shiftDateRangeBack = (range: DateRange): DateRange => {
  const start = parseISODate(range.startDate)
  const end = parseISODate(range.endDate)

  if (start.getTime() > end.getTime()) {
    throw new Error(`Invalid range: startDate ${range.startDate} is after endDate ${range.endDate}`)
  }

  const spanDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1
  const previousEnd = subtractDays(start, 1)
  const previousStart = subtractDays(previousEnd, spanDays - 1)

  return {
    endDate: toISODate(previousEnd),
    startDate: toISODate(previousStart),
  }
}
