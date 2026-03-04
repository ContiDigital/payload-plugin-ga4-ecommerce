import type { AdminViewServerProps } from 'payload'
import type React from 'react'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'

import { AnalyticsOverviewClient } from './AnalyticsOverviewClient.js'

type AnalyticsRouteViewProps = {
  apiRoute?: string
  endpointBasePath?: string
  title?: string
} & AdminViewServerProps

export const AnalyticsRouteView: React.FC<AnalyticsRouteViewProps> = ({
  apiRoute = '/api',
  endpointBasePath = '/analytics/ga4',
  initPageResult,
  params,
  searchParams,
  title = 'Analytics',
}: AnalyticsRouteViewProps) => {
  const normalizedApiRoute = apiRoute === '/' ? '' : apiRoute.replace(/\/$/, '')

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <AnalyticsOverviewClient
          endpointBasePath={`${normalizedApiRoute}${endpointBasePath}`}
          title={title}
        />
      </Gutter>
    </DefaultTemplate>
  )
}
