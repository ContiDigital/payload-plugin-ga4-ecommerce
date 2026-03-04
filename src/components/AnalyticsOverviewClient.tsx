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
  LiveResult,
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
  formatPercent,
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
  endpointBasePath?: string
  title?: string
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
        className='ga4-control-input'
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
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '0.5rem',
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
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>{heading}</h3>
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>{subheading}</p>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.85rem', margin: 0, padding: '0.9rem 1rem' }}>{emptyLabel}</p>
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
  const [aggregate, setAggregate] = useState<AggregateResult | null>(null)
  const [error, setError] = useState<null | string>(null)
  const [eventsReport, setEventsReport] = useState<null | ReportResult>(null)
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [live, setLive] = useState<LiveResult | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [sourceReport, setSourceReport] = useState<null | ReportResult>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('30d')
  const [timeseries, setTimeseries] = useState<null | TimeseriesResult>(null)
  const [topPagesReport, setTopPagesReport] = useState<null | ReportResult>(null)
  const [useComparison, setUseComparison] = useState(true)
  const [showViews, setShowViews] = useState(true)
  const [showVisitors, setShowVisitors] = useState(true)
  const [showSessions, setShowSessions] = useState(true)

  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    const run = async () => {
      setIsLoading(true)

      const requests = await Promise.allSettled([
        fetchJSON<HealthResult>(`${endpointBasePath}/health`, {
          signal: abortController.signal,
        }),
        fetchJSON<AggregateResult>(`${endpointBasePath}/global/aggregate`, {
          body: JSON.stringify({
            comparePrevious: useComparison,
            timeframe,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        }),
        fetchJSON<TimeseriesResult>(`${endpointBasePath}/global/timeseries`, {
          body: JSON.stringify({
            metrics: ['views', 'visitors', 'sessions'],
            timeframe,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        }),
        fetchJSON<ReportResult>(`${endpointBasePath}/report`, {
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
          signal: abortController.signal,
        }),
        fetchJSON<ReportResult>(`${endpointBasePath}/report`, {
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
          signal: abortController.signal,
        }),
        fetchJSON<ReportResult>(`${endpointBasePath}/report`, {
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
          signal: abortController.signal,
        }),
        fetchJSON<LiveResult>(`${endpointBasePath}/live`, {
          signal: abortController.signal,
        }),
      ])

      if (!isMounted) {
        return
      }

      const [
        healthResult,
        aggregateResult,
        timeseriesResult,
        pagesResult,
        sourcesResult,
        eventsResult,
        liveResult,
      ] = requests

      setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
      setAggregate(aggregateResult.status === 'fulfilled' ? aggregateResult.value : null)
      setTimeseries(timeseriesResult.status === 'fulfilled' ? timeseriesResult.value : null)
      setTopPagesReport(pagesResult.status === 'fulfilled' ? pagesResult.value : null)
      setSourceReport(sourcesResult.status === 'fulfilled' ? sourcesResult.value : null)
      setEventsReport(eventsResult.status === 'fulfilled' ? eventsResult.value : null)
      setLive(liveResult.status === 'fulfilled' ? liveResult.value : null)

      const failures = requests.filter((result) => result.status === 'rejected')
      if (failures.length === 0) {
        setError(null)
      } else if (failures.length === requests.length) {
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
        .filter((row): row is ReportResult['rows'][number] => row !== null)

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
    <AnalyticsErrorBoundary>
      <section style={{ padding: '1rem 0' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{title}</h1>
        <p style={{ color: 'var(--theme-elevation-600)', margin: '0.3rem 0 0' }}>
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

        <label style={{ alignItems: 'center', display: 'inline-flex', gap: '0.45rem' }}>
          <input
            aria-label='Compare previous window'
            checked={useComparison}
            className='ga4-control-input'
            onChange={(event) => {
              setUseComparison(event.currentTarget.checked)
            }}
            type='checkbox'
          />
          <span style={{ fontSize: '0.85rem' }}>Compare Previous Window</span>
        </label>

        <button
          className='ga4-control-button'
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
            backgroundColor: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            padding: '0.65rem 0.8rem',
          }}
        >
          <p style={{ fontSize: '0.82rem', margin: 0 }}>
            Cache: {health.cache.enabled ? `enabled (${health.cache.strategy})` : 'disabled'} | Rate limiting:{' '}
            {health.rateLimit.enabled ? 'enabled' : 'disabled'}
          </p>
          <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
            Source attribution dimension: {health.source.dimension}
          </p>
          <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
            Tracked events: {health.events.trackedEventNames.length ? health.events.trackedEventNames.join(', ') : 'all events'}
          </p>
        </div>
      ) : null}

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
            border: '1px solid var(--theme-elevation-150)',
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
              <p style={{ color: 'var(--theme-elevation-600)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
                {timeseries.range.startDate} to {timeseries.range.endDate}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
              <ChartMetricToggle checked={showViews} label='Views' onChange={setShowViews} />
              <ChartMetricToggle checked={showVisitors} label='Visitors' onChange={setShowVisitors} />
              <ChartMetricToggle checked={showSessions} label='Sessions' onChange={setShowSessions} />
            </div>
          </header>
          <div aria-label='Traffic timeseries chart' role='img' style={{ height: 320 }}>
            <ResponsiveContainer height='100%' width='100%'>
              <LineChart data={chartData} margin={{ bottom: 8, left: 8, right: 8, top: 16 }}>
                <CartesianGrid stroke={chartStroke.grid} strokeDasharray='3 3' />
                <XAxis dataKey='date' minTickGap={24} />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                {showViews ? (
                  <Line
                    dataKey='views'
                    dot={false}
                    name='Views'
                    stroke={chartStroke.views}
                    strokeWidth={2}
                    type='monotone'
                  />
                ) : null}
                {showVisitors ? (
                  <Line
                    dataKey='visitors'
                    dot={false}
                    name='Visitors'
                    stroke={chartStroke.visitors}
                    strokeWidth={2}
                    type='monotone'
                  />
                ) : null}
                {showSessions ? (
                  <Line
                    dataKey='sessions'
                    dot={false}
                    name='Sessions'
                    stroke={chartStroke.sessions}
                    strokeWidth={2}
                    type='monotone'
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table style={srOnlyStyle}>
            <caption>Traffic timeseries fallback table</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Views</th>
                <th>Visitors</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td>{formatInteger(point.views)}</td>
                  <td>{formatInteger(point.visitors)}</td>
                  <td>{formatInteger(point.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </AnalyticsErrorBoundary>
  )
}
