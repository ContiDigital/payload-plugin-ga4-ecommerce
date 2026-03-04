import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'

import { AnalyticsOverviewClient } from './AnalyticsOverviewClient.js'

type AnalyticsRouteViewProps = {
  endpointBasePath?: string
  title?: string
} & AdminViewServerProps

export const AnalyticsRouteView = ({
  endpointBasePath = '/analytics/ga4',
  initPageResult,
  params,
  searchParams,
  title = 'Analytics',
}: AnalyticsRouteViewProps) => {
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
        <AnalyticsOverviewClient endpointBasePath={`/api${endpointBasePath}`} title={title} />
      </Gutter>
    </DefaultTemplate>
  )
}
