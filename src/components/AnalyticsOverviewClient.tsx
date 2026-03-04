'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MetricDelta, MetricKey, PropertyKey, Timeframe } from '../types/index.js'

type AggregateResponse = {
  comparison?: {
    deltas: Partial<Record<MetricKey, MetricDelta>>
    previousMetrics: Partial<Record<MetricKey, number>>
    previousRange: {
      endDate: string
      startDate: string
    }
  }
  metrics: Partial<Record<MetricKey, number>>
  range: {
    endDate: string
    startDate: string
  }
  timeframe: Timeframe
}

type TimeseriesPoint = {
  date: string
} & Partial<Record<MetricKey, number>>

type TimeseriesResponse = {
  metrics: MetricKey[]
  points: TimeseriesPoint[]
  range: {
    endDate: string
    startDate: string
  }
  timeframe: Timeframe
}

type ReportResponse = {
  eventNames?: string[]
  limit: number
  metrics: MetricKey[]
  pagePath?: string
  property: PropertyKey
  range: {
    endDate: string
    startDate: string
  }
  rows: Array<{
    dimensionValue: string
    metrics: Partial<Record<MetricKey, number>>
  }>
  timeframe: Timeframe
}

type HealthResponse = {
  adminMode: 'both' | 'dashboard' | 'headless' | 'route'
  cache: {
    aggregateTtlMs: number
    enabled: boolean
    maxEntries: number
    timeseriesTtlMs: number
  }
  events: {
    reportLimit: number
    trackedEventNames: string[]
  }
  rateLimit: {
    baseRetryDelayMs: number
    enabled: boolean
    includePropertyQuota: boolean
    jitterFactor: number
    maxConcurrency: number
    maxRetries: number
    maxRetryDelayMs: number
  }
  routePath: string
  source: {
    dimension: 'firstUserSource' | 'sessionSource' | 'source'
  }
  status: 'ok'
  timestamp: string
}

type LiveResponse = {
  visitors: number
}

type Props = {
  endpointBasePath?: string
  title?: string
}

const TIMEFRAME_OPTIONS: Array<{ label: string; value: Timeframe }> = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '6 Months', value: '6mo' },
  { label: '12 Months', value: '12mo' },
  { label: 'Month to Date', value: 'currentMonth' },
]

const fetchJSON = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)
  const data = (await response.json()) as { error?: string } & T

  if (!response.ok) {
    throw new Error(data.error ?? 'Analytics request failed')
  }

  return data
}

const formatInteger = (value: number | undefined): string =>
  typeof value === 'number' ? Math.round(value).toLocaleString() : '0'

const formatPercent = (value: number | undefined): string =>
  typeof value === 'number' ? `${value.toFixed(2)}%` : '0.00%'

const formatSeconds = (value: number | undefined): string => {
  const total = typeof value === 'number' ? Math.round(value) : 0
  if (total < 60) {
    return `${total}s`
  }

  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}m ${seconds}s`
}

const formatDelta = (metric: MetricKey, delta: MetricDelta | undefined): null | string => {
  if (!delta) {
    return null
  }

  const absolutePrefix = delta.absolute > 0 ? '+' : delta.absolute < 0 ? '-' : ''
  const absoluteValue =
    metric === 'sessionDuration'
      ? formatSeconds(Math.abs(delta.absolute))
      : Math.abs(Math.round(delta.absolute)).toLocaleString()
  const percentValue =
    delta.percentChange === null
      ? 'n/a'
      : `${delta.percentChange > 0 ? '+' : ''}${delta.percentChange.toFixed(1)}%`

  return `${absolutePrefix}${absoluteValue} (${percentValue}) vs previous`
}

const tooltipFormatter = (
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

const ChartMetricToggle: React.FC<{
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}> = ({ checked, label, onChange }) => {
  return (
    <label style={{ alignItems: 'center', display: 'inline-flex', fontSize: '0.8rem', gap: '0.35rem' }}>
      <input
        aria-label={label}
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked)
        }}
        type='checkbox'
      />
      {label}
    </label>
  )
}

type TopTableProps = {
  emptyLabel: string
  headers: string[]
  heading: string
  rows: Array<{
    cells: string[]
    key: string
  }>
  subheading: string
}

const TopTable: React.FC<TopTableProps> = ({ emptyLabel, headers, heading, rows, subheading }) => {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          padding: '0.75rem 1rem',
        }}
      >
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>{heading}</h3>
        <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>{subheading}</p>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0, padding: '0.9rem 1rem' }}>{emptyLabel}</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} style={tableHeaderStyle}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, cellIndex) => (
                  <td key={`${row.key}-${cellIndex}`} style={tableCellStyle}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const AnalyticsOverviewClient: React.FC<Props> = ({
  endpointBasePath = '/api/analytics/ga4',
  title = 'Analytics',
}) => {
  const [aggregate, setAggregate] = useState<AggregateResponse | null>(null)
  const [error, setError] = useState<null | string>(null)
  const [eventsReport, setEventsReport] = useState<null | ReportResponse>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [live, setLive] = useState<LiveResponse | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [sourceReport, setSourceReport] = useState<null | ReportResponse>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('30d')
  const [timeseries, setTimeseries] = useState<null | TimeseriesResponse>(null)
  const [topPagesReport, setTopPagesReport] = useState<null | ReportResponse>(null)
  const [useComparison, setUseComparison] = useState(true)
  const [showViews, setShowViews] = useState(true)
  const [showVisitors, setShowVisitors] = useState(true)
  const [showSessions, setShowSessions] = useState(true)

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      try {
        setIsLoading(true)

        const [healthResponse, aggregateResponse, timeseriesResponse, pagesResponse, sourcesResponse, eventsResponse, liveResponse] =
          await Promise.all([
            fetchJSON<HealthResponse>(`${endpointBasePath}/health`),
            fetchJSON<AggregateResponse>(`${endpointBasePath}/global/aggregate`, {
              body: JSON.stringify({
                comparePrevious: useComparison,
                timeframe,
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }),
            fetchJSON<TimeseriesResponse>(`${endpointBasePath}/global/timeseries`, {
              body: JSON.stringify({
                metrics: ['views', 'visitors', 'sessions'],
                timeframe,
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }),
            fetchJSON<ReportResponse>(`${endpointBasePath}/report`, {
              body: JSON.stringify({
                limit: 8,
                metrics: ['views', 'visitors'],
                property: 'page',
                timeframe,
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }),
            fetchJSON<ReportResponse>(`${endpointBasePath}/report`, {
              body: JSON.stringify({
                limit: 8,
                metrics: ['sessions', 'visitors'],
                property: 'source',
                timeframe,
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }),
            fetchJSON<ReportResponse>(`${endpointBasePath}/report`, {
              body: JSON.stringify({
                eventNames: [],
                limit: 100,
                metrics: ['eventCount', 'visitors'],
                property: 'event',
                timeframe,
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }),
            fetchJSON<LiveResponse>(`${endpointBasePath}/live`),
          ])

        if (!isMounted) {
          return
        }

        setAggregate(aggregateResponse)
        setError(null)
        setEventsReport(eventsResponse)
        setHealth(healthResponse)
        setLive(liveResponse)
        setSourceReport(sourcesResponse)
        setTimeseries(timeseriesResponse)
        setTopPagesReport(pagesResponse)
      } catch (requestError) {
        if (!isMounted) {
          return
        }

        setAggregate(null)
        setEventsReport(null)
        setSourceReport(null)
        setTimeseries(null)
        setTopPagesReport(null)
        setError(requestError instanceof Error ? requestError.message : 'Unable to load analytics')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [endpointBasePath, refreshCounter, timeframe, useComparison])

  const chartData = useMemo(() => {
    return timeseries?.points ?? []
  }, [timeseries])

  const sourceRows = useMemo(
    () =>
      (sourceReport?.rows ?? []).map((row, index) => ({
        cells: [
          row.dimensionValue || '(not set)',
          formatInteger(row.metrics.sessions),
          formatInteger(row.metrics.visitors),
        ],
        key: `${row.dimensionValue}-${index}`,
      })),
    [sourceReport],
  )

  const eventRows = useMemo(
    () => {
      if (!eventsReport) {
        return []
      }

      const trackedEventNames = health?.events.trackedEventNames ?? []
      const trackedEventNameSet = new Set(trackedEventNames)
      const rowsByEventName = new Map(eventsReport.rows.map((row) => [row.dimensionValue, row]))

      const hasNonZeroMetrics = (metrics: Partial<Record<MetricKey, number>> | undefined): boolean => {
        return (metrics?.eventCount ?? 0) > 0 || (metrics?.visitors ?? 0) > 0
      }

      const prioritizedTrackedRows = trackedEventNames
        .map((eventName) => {
          const row = rowsByEventName.get(eventName)

          if (!row || !hasNonZeroMetrics(row.metrics)) {
            return null
          }

          return row
        })
        .filter((row): row is ReportResponse['rows'][number] => row !== null)

      const additionalRows = eventsReport.rows.filter((row) => {
        if (!hasNonZeroMetrics(row.metrics)) {
          return false
        }

        return !trackedEventNameSet.has(row.dimensionValue)
      })

      const displayRows = prioritizedTrackedRows.length > 0 ? [...prioritizedTrackedRows, ...additionalRows] : additionalRows

      return displayRows.map((row, index) => ({
        cells: [
          row.dimensionValue || '(not set)',
          formatInteger(row.metrics.eventCount),
          formatInteger(row.metrics.visitors),
        ],
        key: `${row.dimensionValue}-${index}`,
      }))
    },
    [eventsReport, health],
  )

  const topPageRows = useMemo(
    () =>
      (topPagesReport?.rows ?? []).map((row, index) => ({
        cells: [row.dimensionValue || '(not set)', formatInteger(row.metrics.views), formatInteger(row.metrics.visitors)],
        key: `${row.dimensionValue}-${index}`,
      })),
    [topPagesReport],
  )

  return (
    <section style={{ padding: '1rem 0' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{title}</h1>
        <p style={{ color: '#6b7280', margin: '0.3rem 0 0' }}>
          GA4 reporting with configurable caching, retry policy, and tracked events.
        </p>
      </header>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.45rem' }}>
          <span style={{ fontSize: '0.85rem' }}>Window</span>
          <select
            aria-label='Select timeframe'
            onChange={(event) => {
              setTimeframe(event.currentTarget.value as Timeframe)
            }}
            value={timeframe}
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.45rem' }}>
          <input
            aria-label='Compare previous window'
            checked={useComparison}
            onChange={(event) => {
              setUseComparison(event.currentTarget.checked)
            }}
            type='checkbox'
          />
          <span style={{ fontSize: '0.85rem' }}>Compare Previous Window</span>
        </label>

        <button
          onClick={() => {
            setRefreshCounter((count) => count + 1)
          }}
          type='button'
        >
          Refresh
        </button>
      </div>

      {health ? (
        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            padding: '0.65rem 0.8rem',
          }}
        >
          <p style={{ fontSize: '0.82rem', margin: 0 }}>
            Cache: {health.cache.enabled ? 'enabled' : 'disabled'} (aggregate TTL {health.cache.aggregateTtlMs}ms,
            timeseries TTL {health.cache.timeseriesTtlMs}ms, max entries {health.cache.maxEntries}) | Rate limit:{' '}
            {health.rateLimit.enabled
              ? `enabled (${health.rateLimit.maxConcurrency} concurrent, ${health.rateLimit.maxRetries} retries)`
              : 'disabled'}
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
            Source attribution dimension: {health.source.dimension}
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
            Tracked events: {health.events.trackedEventNames.length ? health.events.trackedEventNames.join(', ') : 'all events'}
          </p>
        </div>
      ) : null}

      {isLoading ? <p>Loading analytics...</p> : null}
      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}

      {aggregate ? (
        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            marginBottom: '1rem',
          }}
        >
          <MetricCard
            delta={formatDelta('views', aggregate.comparison?.deltas.views)}
            label='Views'
            value={formatInteger(aggregate.metrics.views)}
          />
          <MetricCard
            delta={formatDelta('visitors', aggregate.comparison?.deltas.visitors)}
            label='Visitors'
            value={formatInteger(aggregate.metrics.visitors)}
          />
          <MetricCard
            delta={formatDelta('sessions', aggregate.comparison?.deltas.sessions)}
            label='Sessions'
            value={formatInteger(aggregate.metrics.sessions)}
          />
          <MetricCard label='Live Visitors' value={formatInteger(live?.visitors)} />
          <MetricCard
            delta={formatDelta('bounceRate', aggregate.comparison?.deltas.bounceRate)}
            label='Bounce Rate'
            value={formatPercent(aggregate.metrics.bounceRate)}
          />
          <MetricCard
            delta={formatDelta('sessionDuration', aggregate.comparison?.deltas.sessionDuration)}
            label='Avg Session Duration'
            value={formatSeconds(aggregate.metrics.sessionDuration)}
          />
        </div>
      ) : null}

      {timeseries ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            padding: '0.8rem',
          }}
        >
          <header
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.7rem',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1rem', margin: 0 }}>Traffic Timeseries</h2>
              <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
                {timeseries.range.startDate} to {timeseries.range.endDate}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
              <ChartMetricToggle checked={showViews} label='Views' onChange={setShowViews} />
              <ChartMetricToggle checked={showVisitors} label='Visitors' onChange={setShowVisitors} />
              <ChartMetricToggle checked={showSessions} label='Sessions' onChange={setShowSessions} />
            </div>
          </header>
          <div style={{ height: 320 }}>
            <ResponsiveContainer height='100%' width='100%'>
              <LineChart data={chartData} margin={{ bottom: 8, left: 8, right: 8, top: 16 }}>
                <CartesianGrid stroke='#e5e7eb' strokeDasharray='3 3' />
                <XAxis dataKey='date' minTickGap={24} />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                {showViews ? (
                  <Line dataKey='views' dot={false} name='Views' stroke='#2563eb' strokeWidth={2} type='monotone' />
                ) : null}
                {showVisitors ? (
                  <Line
                    dataKey='visitors'
                    dot={false}
                    name='Visitors'
                    stroke='#16a34a'
                    strokeWidth={2}
                    type='monotone'
                  />
                ) : null}
                {showSessions ? (
                  <Line
                    dataKey='sessions'
                    dot={false}
                    name='Sessions'
                    stroke='#d97706'
                    strokeWidth={2}
                    type='monotone'
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        <TopTable
          emptyLabel='No page rows returned for the selected timeframe.'
          headers={['Page', 'Views', 'Visitors']}
          heading='Top Pages'
          rows={topPageRows}
          subheading='Highest traffic page paths for this window.'
        />
        <TopTable
          emptyLabel='No source rows returned for the selected timeframe.'
          headers={['Source', 'Sessions', 'Visitors']}
          heading='Top Sources'
          rows={sourceRows}
          subheading='Session and visitor contribution by source.'
        />
        <TopTable
          emptyLabel='No event rows returned for the selected timeframe.'
          headers={['Event', 'Event Count', 'Visitors']}
          heading='Top Events'
          rows={eventRows}
          subheading='Event activity (uses configured trackedEventNames when provided).'
        />
      </div>
    </section>
  )
}

type MetricCardProps = {
  delta?: null | string
  label: string
  value: string
}

const MetricCard: React.FC<MetricCardProps> = ({ delta, label, value }) => {
  return (
    <article
      style={{
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>{value}</p>
      {delta ? (
        <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0.3rem 0 0' }}>{delta}</p>
      ) : null}
    </article>
  )
}

const tableHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid #e5e7eb',
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.5rem 1rem',
  textAlign: 'left',
}

const tableCellStyle: React.CSSProperties = {
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.85rem',
  padding: '0.5rem 1rem',
}
