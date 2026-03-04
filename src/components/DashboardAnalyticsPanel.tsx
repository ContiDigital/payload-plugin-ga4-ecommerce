'use client'

import React from 'react'

import { AnalyticsOverviewClient } from './AnalyticsOverviewClient.js'

export const DashboardAnalyticsPanel: React.FC = () => {
  return <AnalyticsOverviewClient endpointBasePath='/api/analytics/ga4' title='Analytics Snapshot' />
}
