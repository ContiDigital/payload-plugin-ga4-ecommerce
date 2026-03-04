'use client'

import React from 'react'

import { AnalyticsOverviewClient } from './AnalyticsOverviewClient.js'

type DashboardAnalyticsPanelProps = {
  endpointBasePath?: string
}

export const DashboardAnalyticsPanel: React.FC<DashboardAnalyticsPanelProps> = ({
  endpointBasePath = '/api/analytics/ga4',
}) => {
  return <AnalyticsOverviewClient endpointBasePath={endpointBasePath} title='Analytics Snapshot' />
}
