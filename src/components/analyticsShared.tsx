'use client'

import React from 'react'

import type { MetricDelta, MetricKey, Timeframe } from '../types/index.js'

export const fetchJSON = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json')
    ? ((await response.json()) as { error?: string } & T)
    : ({} as { error?: string } & T)

  if (!response.ok) {
    throw new Error(data.error ?? 'Analytics request failed')
  }

  return data
}

export const formatInteger = (value: number | undefined): string =>
  typeof value === 'number' ? Math.round(value).toLocaleString() : '0'

export const formatPercent = (value: number | undefined): string =>
  typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '0.00%'

export const formatSeconds = (value: number | undefined): string => {
  const total = typeof value === 'number' ? Math.round(value) : 0
  if (total < 60) {
    return `${total}s`
  }

  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}m ${seconds}s`
}

export const formatDelta = (metric: MetricKey, delta: MetricDelta | undefined): null | string => {
  if (!delta) {
    return null
  }

  const absolutePrefix = delta.absolute > 0 ? '+' : delta.absolute < 0 ? '-' : ''
  const absoluteValue =
    metric === 'sessionDuration'
      ? formatSeconds(Math.abs(delta.absolute))
      : metric === 'bounceRate'
        ? `${(Math.abs(delta.absolute) * 100).toFixed(1)} pts`
        : Math.abs(Math.round(delta.absolute)).toLocaleString()
  const percentValue =
    delta.percentChange === null
      ? 'n/a'
      : `${delta.percentChange > 0 ? '+' : ''}${delta.percentChange.toFixed(1)}%`

  return `${absolutePrefix}${absoluteValue} (${percentValue}) vs previous`
}

export const tooltipFormatter = (
  value: number | string | undefined,
  key: string | undefined,
): [string, string] => {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
  const resolvedKey = key ?? 'metric'

  if (resolvedKey === 'sessionDuration') {
    return [formatSeconds(numericValue), 'Avg Session Duration']
  }

  if (resolvedKey === 'bounceRate') {
    return [formatPercent(numericValue), 'Bounce Rate']
  }

  return [formatInteger(numericValue), resolvedKey]
}

type MetricCardProps = {
  delta?: null | string
  label: string
  value: string
}

export const MetricCard: React.FC<MetricCardProps> = ({ delta, label, value }) => {
  return (
    <article
      style={{
        backgroundColor: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>{value}</p>
      {delta ? (
        <p
          style={{ color: 'var(--theme-elevation-600)', fontSize: '0.75rem', margin: '0.3rem 0 0' }}
        >
          {delta}
        </p>
      ) : null}
    </article>
  )
}

export const tableHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--theme-elevation-150)',
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.5rem 1rem',
  textAlign: 'left',
}

export const tableCellStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--theme-elevation-100)',
  fontSize: '0.85rem',
  padding: '0.5rem 1rem',
}

export const srOnlyStyle: React.CSSProperties = {
  border: 0,
  clip: 'rect(0, 0, 0, 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
}

export const chartStroke = {
  grid: 'var(--theme-elevation-150)',
  sessions: 'var(--theme-warning-500, #d97706)',
  views: 'var(--theme-success-500, #16a34a)',
  visitors: 'var(--theme-elevation-800, #2563eb)',
} as const

export const TIMEFRAME_OPTIONS: ReadonlyArray<{ label: string; value: Timeframe }> = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '6 Months', value: '6mo' },
  { label: '12 Months', value: '12mo' },
  { label: 'Month to Date', value: 'currentMonth' },
]
