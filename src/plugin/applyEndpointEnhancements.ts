import type { Config } from 'payload'

import type { NormalizedPluginOptions } from '../types/index.js'

import { createCacheClearEndpoint } from '../server/endpoints/cacheClearEndpoint.js'
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

const ACTIVE_ANALYTICS_SERVICES = new Set<Awaited<ReturnType<typeof createAnalyticsService>>>()
let shutdownHooksRegistered = false
let shutdownPromise: null | Promise<void> = null

const destroyActiveServices = async (): Promise<void> => {
  const services = [...ACTIVE_ANALYTICS_SERVICES]
  ACTIVE_ANALYTICS_SERVICES.clear()

  await Promise.allSettled(
    services.map(async (service) => {
      await service.destroy()
    }),
  )
}

const registerShutdownHooks = (): void => {
  if (shutdownHooksRegistered) {
    return
  }

  if (typeof process === 'undefined' || typeof process.once !== 'function') {
    return
  }

  shutdownHooksRegistered = true

  const handleShutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = destroyActiveServices()
    }
  }

  process.once('SIGINT', handleShutdown)
  process.once('SIGTERM', handleShutdown)
  process.once('beforeExit', handleShutdown)
}

export const applyEndpointEnhancements = (
  config: Config,
  options: NormalizedPluginOptions,
): Config => {
  const analyticsService = createAnalyticsService(options)
  ACTIVE_ANALYTICS_SERVICES.add(analyticsService)
  registerShutdownHooks()

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
    createCacheClearEndpoint(options, analyticsService),
  ]

  return {
    ...config,
    endpoints: [...(config.endpoints ?? []), ...endpoints],
  }
}
