import type { Config } from 'payload'

import type { PayloadGA4AnalyticsPluginOptions } from './types/index.js'

import { applyAdminEnhancements } from './plugin/applyAdminEnhancements.js'
import { applyCollectionEnhancements } from './plugin/applyCollectionEnhancements.js'
import { applyEndpointEnhancements } from './plugin/applyEndpointEnhancements.js'
import { normalizePluginOptions } from './plugin/normalizeOptions.js'

export const payloadGa4AnalyticsPlugin =
  (incomingOptions: PayloadGA4AnalyticsPluginOptions) =>
  (incomingConfig: Config): Config => {
    const options = normalizePluginOptions(incomingOptions)

    if (options.disabled) {
      return incomingConfig
    }

    const configWithCollections = applyCollectionEnhancements(incomingConfig, options)
    const configWithEndpoints = applyEndpointEnhancements(configWithCollections, options)
    const configWithAdmin = applyAdminEnhancements(configWithEndpoints, options)

    return configWithAdmin
  }

export {
  AnalyticsUIPlaceholder,
  getAnalyticsField,
  getAnalyticsTab,
} from './plugin/applyCollectionEnhancements.js'
export { createAnalyticsService } from './server/services/analyticsService.js'
export type { AnalyticsService } from './server/services/analyticsService.js'
export type { PayloadGA4AnalyticsPluginOptions } from './types/index.js'
export type {
  AggregateResult,
  AnalyticsUIPlacementConfig,
  CacheClearResult,
  CollectionAnalyticsConfig,
  HealthResult,
  LiveResult,
  MetricKey,
  NormalizedPluginOptions,
  PropertyQuota,
  PropertyQuotaStatus,
  ReportPropertyKey,
  ReportResult,
  Timeframe,
  TimeseriesResult,
} from './types/index.js'

export default payloadGa4AnalyticsPlugin
