import type { Endpoint } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'
import type { AnalyticsService } from '../services/analyticsService.js'

import { assertAccess } from '../utilities/access.js'
import { errorResponse, jsonResponse } from '../utilities/http.js'

export const createMetadataEndpoint = (
  options: NormalizedPluginOptions,
  analyticsService: AnalyticsService,
): Endpoint => {
  return {
    handler: async (req) => {
      try {
        await assertAccess(req, options)

        const result = await analyticsService.getMetadata({
          req,
        })

        return jsonResponse(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
    method: 'get',
    path: `${options.api.basePath}/metadata`,
  }
}
