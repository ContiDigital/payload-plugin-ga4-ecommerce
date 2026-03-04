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

import type {
  AggregateResult,
  HealthResult,
  MetricKey,
  ReportResult,
  Timeframe,
  TimeseriesResult,
} from '../types/index.js'

import { AnalyticsErrorBoundary } from './AnalyticsErrorBoundary.js'
import {
  chartStroke,
  fetchJSON,
  formatDelta,
  formatInteger,
  formatSeconds,
  MetricCard,
  srOnlyStyle,
  tableCellStyle,
  tableHeaderStyle,
  TIMEFRAME_OPTIONS,
  tooltipFormatter,
} from './analyticsShared.js'
import './analyticsControls.css'

type Props = {
  apiBasePath: string
  pagePath: string
}

export const RecordAnalyticsPanelClient: React.FC<Props> = ({ apiBasePath, pagePath }) => {
  const [aggregate, setAggregate] = useState<AggregateResult | null>(null)
  const [comparePrevious, setComparePrevious] = useState(true)
  const [error, setError] = useState<null | string>(null)
  const [eventReport, setEventReport] = useState<null | ReportResult>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sourceReport, setSourceReport] = useState<null | ReportResult>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [trackedEventNames, setTrackedEventNames] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<Timeframe>('30d')
  const [timeseries, setTimeseries] = useState<null | TimeseriesResult>(null)

  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    const run = async (): Promise<void> => {
      setIsLoading(true)

      const body = {
        comparePrevious,
        metrics: ['views', 'visitors', 'sessions', 'sessionDuration'],
        pagePath,
        timeframe,
      }

      const results = await Promise.allSettled([
        fetchJSON<AggregateResult>(`${apiBasePath}/page/aggregate`, {
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        }),
        fetchJSON<TimeseriesResult>(`${apiBasePath}/page/timeseries`, {
          body: JSON.stringify({
            metrics: ['views', 'visitors'],
            pagePath,
            timeframe,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        }),
        fetchJSON<ReportResult>(`${apiBasePath}/report`, {
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
          signal: abortController.signal,
        }),
        fetchJSON<ReportResult>(`${apiBasePath}/report`, {
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
          signal: abortController.signal,
        }),
        fetchJSON<HealthResult>(`${apiBasePath}/health`, {
          signal: abortController.signal,
        }),
      ])

      if (!isMounted) {
        return
      }

      const [aggregateResult, timeseriesResult, sourceResult, eventsResult, healthResult] = results

      setAggregate(aggregateResult.status === 'fulfilled' ? aggregateResult.value : null)
      setTimeseries(timeseriesResult.status === 'fulfilled' ? timeseriesResult.value : null)
      setSourceReport(sourceResult.status === 'fulfilled' ? sourceResult.value : null)
      setEventReport(eventsResult.status === 'fulfilled' ? eventsResult.value : null)
      setTrackedEventNames(
        healthResult.status === 'fulfilled' ? healthResult.value.events.trackedEventNames : [],
      )

      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length === 0) {
        setError(null)
      } else if (failures.length === results.length) {
        const message = failures[0].reason instanceof Error ? failures[0].reason.message : 'Unable to load analytics'
        setError(message)
      } else {
        setError('Some analytics panels are temporarily unavailable.')
      }

      if (isMounted) {
        setIsLoading(false)
      }
    }

    void run()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [apiBasePath, comparePrevious, pagePath, refreshCounter, timeframe])

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
      .filter((row): row is ReportResult['rows'][number] => row !== null)

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
    <AnalyticsErrorBoundary>
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
          <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Path: <code>{pagePath}</code>
          </p>
        </div>

        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem' }}>Window</span>
            <select
              aria-label='Select timeframe'
              className='ga4-control-select'
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
              className='ga4-control-input'
              onChange={(event) => {
                setComparePrevious(event.currentTarget.checked)
              }}
              type='checkbox'
            />
            <span style={{ fontSize: '0.875rem' }}>Compare Previous</span>
          </label>

          <button
            className='ga4-control-button'
            onClick={() => setRefreshCounter((c) => c + 1)}
            type='button'
          >
            Refresh
          </button>
        </div>
      </header>

      {isLoading ? <p aria-live='polite'>Loading analytics...</p> : null}
      {error ? (
        <p aria-live='polite' role='alert' style={{ color: 'var(--theme-error-500)' }}>
          {error}
        </p>
      ) : null}

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
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
          }}
        >
          <div aria-label='Record traffic timeseries chart' role='img' style={{ height: 320 }}>
            <ResponsiveContainer height='100%' width='100%'>
              <LineChart data={chartData} margin={{ bottom: 8, left: 8, right: 8, top: 16 }}>
                <CartesianGrid stroke={chartStroke.grid} strokeDasharray='3 3' />
                <XAxis dataKey='date' minTickGap={24} />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                <Line
                  dataKey='views'
                  dot={false}
                  name='Views'
                  stroke={chartStroke.views}
                  strokeWidth={2}
                  type='monotone'
                />
                <Line
                  dataKey='visitors'
                  dot={false}
                  name='Visitors'
                  stroke={chartStroke.visitors}
                  strokeWidth={2}
                  type='monotone'
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table style={srOnlyStyle}>
            <caption>Record traffic timeseries fallback table</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Views</th>
                <th>Visitors</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td>{formatInteger(point.views)}</td>
                  <td>{formatInteger(point.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {sourceReport && sourceReport.rows.length > 0 ? (
        <div
          style={{
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '0.5rem',
            marginTop: '1rem',
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              backgroundColor: 'var(--theme-elevation-50)',
              borderBottom: '1px solid var(--theme-elevation-150)',
              padding: '0.75rem 1rem',
            }}
          >
            <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Top Traffic Sources</h4>
            <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
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
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '0.5rem',
            marginTop: '1rem',
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              backgroundColor: 'var(--theme-elevation-50)',
              borderBottom: '1px solid var(--theme-elevation-150)',
              padding: '0.75rem 1rem',
            }}
          >
            <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Tracked Events</h4>
            <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
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
    </AnalyticsErrorBoundary>
  )
}
