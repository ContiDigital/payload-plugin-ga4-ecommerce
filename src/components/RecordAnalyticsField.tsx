import type { UIFieldServerComponent } from 'payload'

import { RecordAnalyticsPanelClient } from './RecordAnalyticsPanelClient.js'

type Ga4FieldCustomConfig = {
  ga4?: {
    apiBasePath?: string
    apiRoute?: string
    collectionConfig?: {
      getPathname?: (doc: Record<string, unknown>) => string
      pathnameField?: string
      slug?: string
    }
    collectionSlug?: string
  }
}

const normalizePath = (value: string): string => {
  if (value.startsWith('/')) {
    return value
  }

  return `/${value}`
}

const resolvePathFromDocument = (
  data: Record<string, unknown> | undefined,
  customConfig: Ga4FieldCustomConfig['ga4'],
): null | string => {
  if (!data || !customConfig?.collectionConfig) {
    return null
  }

  const { collectionConfig } = customConfig

  if (typeof collectionConfig.getPathname === 'function') {
    const resolved = collectionConfig.getPathname(data)
    return typeof resolved === 'string' && resolved.trim().length > 0 ? normalizePath(resolved) : null
  }

  if (collectionConfig.pathnameField) {
    const pathCandidate = data[collectionConfig.pathnameField]

    if (typeof pathCandidate === 'string' && pathCandidate.trim().length > 0) {
      return normalizePath(pathCandidate.trim())
    }
  }

  return null
}

export const RecordAnalyticsField: UIFieldServerComponent = ({ data, field }) => {
  const customConfig = (field?.custom ?? {}) as Ga4FieldCustomConfig
  const ga4Config = customConfig.ga4

  if (!ga4Config) {
    return (
      <div style={{ padding: '1rem' }}>
        <p style={{ color: 'var(--theme-error-500)', margin: 0 }}>Analytics field is missing plugin configuration.</p>
      </div>
    )
  }

  const pagePath = resolvePathFromDocument(data as Record<string, unknown> | undefined, ga4Config)

  if (!pagePath) {
    return (
      <div style={{ padding: '1rem' }}>
        <p style={{ color: 'var(--theme-elevation-600)', margin: 0 }}>
          Save this document with a valid pathname before analytics can be shown.
        </p>
      </div>
    )
  }

  const apiRoute = ga4Config.apiRoute ?? '/api'
  const normalizedApiRoute = apiRoute === '/' ? '' : apiRoute.replace(/\/$/, '')
  const apiBasePath = `${normalizedApiRoute}${ga4Config.apiBasePath ?? '/analytics/ga4'}`

  return <RecordAnalyticsPanelClient apiBasePath={apiBasePath} pagePath={pagePath} />
}

export default RecordAnalyticsField
