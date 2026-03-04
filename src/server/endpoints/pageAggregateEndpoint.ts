import type { Endpoint } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'
import type { AnalyticsService } from '../services/analyticsService.js'

import { assertAccess } from '../utilities/access.js'
import { errorResponse, jsonResponse } from '../utilities/http.js'
import { assertInboundRateLimit } from '../utilities/inboundRateLimit.js'
import { parsePageAggregateInput, parseRequestBody } from '../utilities/validation.js'

export const createPageAggregateEndpoint = (
  options: NormalizedPluginOptions,
  analyticsService: AnalyticsService,
): Endpoint => {
  return {
    handler: async (req) => {
      try {
        assertInboundRateLimit(req, options, 'pageAggregate')

        await assertAccess(req, options)

        const requestBody = await parseRequestBody(req)
        const input = parsePageAggregateInput(requestBody)
        const result = await analyticsService.getPageAggregate({
          input,
          req,
        })

        return jsonResponse(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
    method: 'post',
    path: `${options.api.basePath}/page/aggregate`,
  }
}
