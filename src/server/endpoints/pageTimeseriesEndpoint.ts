import type { Endpoint } from 'payload'

import type { NormalizedPluginOptions } from '../../types/index.js'
import type { AnalyticsService } from '../services/analyticsService.js'

import { assertAccess } from '../utilities/access.js'
import { errorResponse, jsonResponse } from '../utilities/http.js'
import { parsePageTimeseriesInput, parseRequestBody } from '../utilities/validation.js'

export const createPageTimeseriesEndpoint = (
  options: NormalizedPluginOptions,
  analyticsService: AnalyticsService,
): Endpoint => {
  return {
    handler: async (req) => {
      try {
        await assertAccess(req, options)

        const requestBody = await parseRequestBody(req)
        const input = parsePageTimeseriesInput(requestBody)
        const result = await analyticsService.getPageTimeseries({
          input,
          req,
        })

        return jsonResponse(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
    method: 'post',
    path: `${options.api.basePath}/page/timeseries`,
  }
}
