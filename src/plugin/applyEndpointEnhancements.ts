import type { Config } from 'payload'

import type { NormalizedPluginOptions } from '../types/index.js'

import { createCompatibilityEndpoint } from '../server/endpoints/compatibilityEndpoint.js'
import { createGlobalAggregateEndpoint } from '../server/endpoints/globalAggregateEndpoint.js'
import { createGlobalTimeseriesEndpoint } from '../server/endpoints/globalTimeseriesEndpoint.js'
import { createHealthEndpoint } from '../server/endpoints/healthEndpoint.js'
import { createLiveEndpoint } from '../server/endpoints/liveEndpoint.js'
import { createMetadataEndpoint } from '../server/endpoints/metadataEndpoint.js'
import { createPageAggregateEndpoint } from '../server/endpoints/pageAggregateEndpoint.js'
import { createPageTimeseriesEndpoint } from '../server/endpoints/pageTimeseriesEndpoint.js'
import { createReportEndpoint } from '../server/endpoints/reportEndpoint.js'
import { createAnalyticsService } from '../server/services/analyticsService.js'

export const applyEndpointEnhancements = (
  config: Config,
  options: NormalizedPluginOptions,
): Config => {
  const analyticsService = createAnalyticsService(options)

  const endpoints = [
    createHealthEndpoint(options, analyticsService),
    createGlobalAggregateEndpoint(options, analyticsService),
    createGlobalTimeseriesEndpoint(options, analyticsService),
    createPageAggregateEndpoint(options, analyticsService),
    createPageTimeseriesEndpoint(options, analyticsService),
    createReportEndpoint(options, analyticsService),
    createMetadataEndpoint(options, analyticsService),
    createCompatibilityEndpoint(options, analyticsService),
    createLiveEndpoint(options, analyticsService),
  ]

  return {
    ...config,
    endpoints: [...(config.endpoints ?? []), ...endpoints],
  }
}
