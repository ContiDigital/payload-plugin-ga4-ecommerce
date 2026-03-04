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
  pagePath?: string
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
  pagePath?: string
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
  events: {
    trackedEventNames: string[]
  }
}

type Props = {
  apiBasePath: string
  pagePath: string
}

const TIMEFRAME_OPTIONS: Array<{ label: string; value: Timeframe }> = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '6mo', value: '6mo' },
  { label: '12mo', value: '12mo' },
  { label: 'Month to Date', value: 'currentMonth' },
]

const fetchJSON = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)

  const json = (await response.json()) as { error?: string } & T

  if (!response.ok) {
    throw new Error(json.error ?? 'Analytics request failed')
  }

  return json
}

const formatInteger = (value: number | undefined): string =>
  typeof value === 'number' ? Math.round(value).toLocaleString() : '0'

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
    return [`${numericValue.toFixed(2)}%`, 'Bounce Rate']
  }

  return [formatInteger(numericValue), resolvedKey]
}

export const RecordAnalyticsPanelClient: React.FC<Props> = ({ apiBasePath, pagePath }) => {
  const [aggregate, setAggregate] = useState<AggregateResponse | null>(null)
  const [comparePrevious, setComparePrevious] = useState(true)
  const [error, setError] = useState<null | string>(null)
  const [eventReport, setEventReport] = useState<null | ReportResponse>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sourceReport, setSourceReport] = useState<null | ReportResponse>(null)
  const [trackedEventNames, setTrackedEventNames] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>('30d')
  const [timeseries, setTimeseries] = useState<null | TimeseriesResponse>(null)

  useEffect(() => {
    let isMounted = true

    const run = async (): Promise<void> => {
      try {
        setIsLoading(true)

        const body = {
          comparePrevious,
          metrics: ['views', 'visitors', 'sessions', 'sessionDuration'],
          pagePath,
          timeframe,
        }

        const [aggregateResponse, timeseriesResponse, sourceResponse, eventsResponse, healthResponse] = await Promise.all([
          fetchJSON<AggregateResponse>(`${apiBasePath}/page/aggregate`, {
            body: JSON.stringify(body),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
          fetchJSON<TimeseriesResponse>(`${apiBasePath}/page/timeseries`, {
            body: JSON.stringify({
              metrics: ['views', 'visitors'],
              pagePath,
              timeframe,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
          fetchJSON<ReportResponse>(`${apiBasePath}/report`, {
            body: JSON.stringify({
              limit: 6,
              metrics: ['sessions', 'visitors'],
              pagePath,
              property: 'source',
              timeframe,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
          fetchJSON<ReportResponse>(`${apiBasePath}/report`, {
            body: JSON.stringify({
              eventNames: [],
              limit: 100,
              metrics: ['eventCount', 'visitors'],
              pagePath,
              property: 'event',
              timeframe,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
          fetchJSON<HealthResponse>(`${apiBasePath}/health`),
        ])

        if (!isMounted) {
          return
        }

        setAggregate(aggregateResponse)
        setEventReport(eventsResponse)
        setSourceReport(sourceResponse)
        setTrackedEventNames(healthResponse.events.trackedEventNames)
        setTimeseries(timeseriesResponse)
        setError(null)
      } catch (requestError) {
        if (!isMounted) {
          return
        }

        setAggregate(null)
        setEventReport(null)
        setSourceReport(null)
        setTrackedEventNames([])
        setTimeseries(null)
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
  }, [apiBasePath, comparePrevious, pagePath, timeframe])

  const chartData = useMemo(() => {
    return timeseries?.points ?? []
  }, [timeseries])

  const eventRows = useMemo(() => {
    if (!eventReport) {
      return []
    }

    const trackedNameSet = new Set(trackedEventNames)
    const rowByEventName = new Map(eventReport.rows.map((row) => [row.dimensionValue, row]))

    const hasNonZeroMetrics = (metrics: Partial<Record<MetricKey, number>> | undefined): boolean =>
      (metrics?.eventCount ?? 0) > 0 || (metrics?.visitors ?? 0) > 0

    const prioritizedTrackedRows = trackedEventNames
      .map((eventName) => {
        const row = rowByEventName.get(eventName)

        if (!row || !hasNonZeroMetrics(row.metrics)) {
          return null
        }

        return row
      })
      .filter((row): row is ReportResponse['rows'][number] => row !== null)

    const additionalRows = eventReport.rows.filter((row) => {
      if (!hasNonZeroMetrics(row.metrics)) {
        return false
      }

      return !trackedNameSet.has(row.dimensionValue)
    })

    const displayRows = prioritizedTrackedRows.length > 0 ? [...prioritizedTrackedRows, ...additionalRows] : additionalRows

    return displayRows.map((row) => ({
      eventCount: row.metrics.eventCount,
      eventName: row.dimensionValue,
      visitors: row.metrics.visitors,
    }))
  }, [eventReport, trackedEventNames])

  return (
    <section style={{ padding: '1rem 0' }}>
      <header
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Record Analytics</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Path: <code>{pagePath}</code>
          </p>
        </div>

        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem' }}>Window</span>
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

          <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.5rem' }}>
            <input
              aria-label='Compare previous period'
              checked={comparePrevious}
              onChange={(event) => {
                setComparePrevious(event.currentTarget.checked)
              }}
              type='checkbox'
            />
            <span style={{ fontSize: '0.875rem' }}>Compare Previous</span>
          </label>
        </div>
      </header>

      {isLoading ? <p>Loading analytics...</p> : null}
      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}

      {aggregate ? (
        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
          <MetricCard
            delta={formatDelta('sessionDuration', aggregate.comparison?.deltas.sessionDuration)}
            label='Avg Session Duration'
            value={formatSeconds(aggregate.metrics.sessionDuration)}
          />
        </div>
      ) : null}

      {chartData.length > 0 ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            height: 320,
            padding: '0.5rem 0.75rem',
          }}
        >
          <ResponsiveContainer height='100%' width='100%'>
            <LineChart data={chartData} margin={{ bottom: 8, left: 8, right: 8, top: 16 }}>
              <CartesianGrid stroke='#e5e7eb' strokeDasharray='3 3' />
              <XAxis dataKey='date' minTickGap={24} />
              <YAxis />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Line
                dataKey='views'
                dot={false}
                name='Views'
                stroke='#2563eb'
                strokeWidth={2}
                type='monotone'
              />
              <Line
                dataKey='visitors'
                dot={false}
                name='Visitors'
                stroke='#16a34a'
                strokeWidth={2}
                type='monotone'
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {sourceReport && sourceReport.rows.length > 0 ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            marginTop: '1rem',
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
            <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Top Traffic Sources</h4>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Source breakdown for this record and selected timeframe.
            </p>
          </header>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Source</th>
                <th style={tableHeaderStyle}>Sessions</th>
                <th style={tableHeaderStyle}>Visitors</th>
              </tr>
            </thead>
            <tbody>
              {sourceReport.rows.map((row, index) => (
                <tr key={`${row.dimensionValue}-${index}`}>
                  <td style={tableCellStyle}>{row.dimensionValue || '(not set)'}</td>
                  <td style={tableCellStyle}>{formatInteger(row.metrics.sessions)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.metrics.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {eventReport && eventRows.length > 0 ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            marginTop: '1rem',
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
            <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Tracked Events</h4>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Event activity for this record and selected timeframe.
            </p>
          </header>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Event</th>
                <th style={tableHeaderStyle}>Event Count</th>
                <th style={tableHeaderStyle}>Visitors</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.map((row) => (
                <tr key={row.eventName}>
                  <td style={tableCellStyle}>{row.eventName}</td>
                  <td style={tableCellStyle}>{formatInteger(row.eventCount)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
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
