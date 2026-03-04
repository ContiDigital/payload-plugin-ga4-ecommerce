import type { Endpoint } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'
import type { AnalyticsService } from '../services/analyticsService.js'

import { assertAccess } from '../utilities/access.js'
import { errorResponse, jsonResponse } from '../utilities/http.js'
import { assertInboundRateLimit } from '../utilities/inboundRateLimit.js'
import { parseGlobalAggregateInput, parseRequestBody } from '../utilities/validation.js'

export const createGlobalAggregateEndpoint = (
  options: NormalizedPluginOptions,
  analyticsService: AnalyticsService,
): Endpoint => {
  return {
    handler: async (req) => {
      try {
        assertInboundRateLimit(req, options, 'globalAggregate')

        await assertAccess(req, options)

        const requestBody = await parseRequestBody(req)
        const input = parseGlobalAggregateInput(requestBody)
        const result = await analyticsService.getGlobalAggregate({
          input,
          req,
        })

        return jsonResponse(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
    method: 'post',
    path: `${options.api.basePath}/global/aggregate`,
  }
}
