import type { Endpoint } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'
import type { AnalyticsService } from '../services/analyticsService.js'

import { assertAccess } from '../utilities/access.js'
import { errorResponse, jsonResponse } from '../utilities/http.js'
import { assertInboundRateLimit } from '../utilities/inboundRateLimit.js'

export const createLiveEndpoint = (
  options: NormalizedPluginOptions,
  analyticsService: AnalyticsService,
): Endpoint => {
  return {
    handler: async (req) => {
      try {
        assertInboundRateLimit(req, options, 'live')

        await assertAccess(req, options)

        const result = await analyticsService.getLiveVisitors({ req })

        return jsonResponse(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
    method: 'get',
    path: `${options.api.basePath}/live`,
  }
}
