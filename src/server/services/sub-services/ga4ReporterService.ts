import type { protos } from '@google-analytics/data'
import type { PayloadRequest } from 'payload'

import { BetaAnalyticsDataClient } from '@google-analytics/data'

import type {
  CredentialResolution,
  GetCredentialsFn,
  GoogleServiceAccount,
  NormalizedPluginOptions,
} from '../../../types/index.js'

type RunRealtimeReportRequest =
  protos.google.analytics.data.v1beta.IRunRealtimeReportRequest

type RunRealtimeReportResponse =
  protos.google.analytics.data.v1beta.IRunRealtimeReportResponse

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse

type GetMetadataRequest = protos.google.analytics.data.v1beta.IGetMetadataRequest
type MetadataResponse = protos.google.analytics.data.v1beta.IMetadata

type CheckCompatibilityRequest = protos.google.analytics.data.v1beta.ICheckCompatibilityRequest
type CheckCompatibilityResponse = protos.google.analytics.data.v1beta.ICheckCompatibilityResponse

const MAX_CLIENT_CACHE_ENTRIES = 20

export type GA4Reporter = {
  checkCompatibility: (request: CheckCompatibilityRequest) => Promise<CheckCompatibilityResponse>
  getMetadata: (request?: GetMetadataRequest) => Promise<MetadataResponse>
  propertyName: string
  runRealtimeReport: (request: RunRealtimeReportRequest) => Promise<RunRealtimeReportResponse>
  runReport: (request: RunReportRequest) => Promise<RunReportResponse>
}

type GA4ClientCredentials =
  | {
      credentials: GoogleServiceAccount
      type: 'json'
    }
  | {
      keyFilename: string
      type: 'keyFilename'
    }

const normalizeCredentials = (value: CredentialResolution): GA4ClientCredentials => {
  if (value.type === 'keyFilename') {
    return {
      type: 'keyFilename',
      keyFilename: value.path,
    }
  }

  return {
    type: 'json',
    credentials: value.credentials,
  }
}

const cacheKeyFromCredentials = (credentials: GA4ClientCredentials): string => {
  if (credentials.type === 'keyFilename') {
    return `keyfile:${credentials.keyFilename}`
  }

  const project = credentials.credentials.project_id ?? 'unknown-project'
  return `json:${credentials.credentials.client_email}:${project}`
}

export class GA4ReporterService {
  private readonly clientByCredentials = new Map<string, BetaAnalyticsDataClient>()
  private readonly getCredentials: GetCredentialsFn
  private readonly propertyId: string
  private readonly requestTimeoutMs: number

  constructor(options: Pick<NormalizedPluginOptions, 'getCredentials' | 'propertyId' | 'rateLimit'>) {
    this.getCredentials = options.getCredentials
    this.propertyId = options.propertyId
    this.requestTimeoutMs = options.rateLimit.requestTimeoutMs
  }

  async destroy(): Promise<void> {
    const closePromises: Promise<void>[] = []
    for (const [_key, client] of this.clientByCredentials.entries()) {
      closePromises.push(client.close().catch(() => undefined))
    }
    this.clientByCredentials.clear()
    await Promise.all(closePromises)
  }

  async getReporter(req: PayloadRequest): Promise<GA4Reporter> {
    const resolution = await this.getCredentials({
      payload: req.payload,
      req,
    })

    const normalizedCredentials = normalizeCredentials(resolution)
    const key = cacheKeyFromCredentials(normalizedCredentials)

    let client = this.clientByCredentials.get(key)

    if (!client) {
      client =
        normalizedCredentials.type === 'keyFilename'
          ? new BetaAnalyticsDataClient({
              keyFilename: normalizedCredentials.keyFilename,
            })
          : new BetaAnalyticsDataClient({
              credentials: normalizedCredentials.credentials,
            })

      if (this.clientByCredentials.size >= MAX_CLIENT_CACHE_ENTRIES) {
        const oldestKey = this.clientByCredentials.keys().next().value
        if (oldestKey !== undefined) {
          const oldestClient = this.clientByCredentials.get(oldestKey)
          this.clientByCredentials.delete(oldestKey)
          void oldestClient?.close().catch(() => undefined)
        }
      }

      this.clientByCredentials.set(key, client)
    } else {
      // Touch existing client for LRU behavior.
      this.clientByCredentials.delete(key)
      this.clientByCredentials.set(key, client)
    }

    const propertyName = `properties/${this.propertyId}`
    const callOptions = {
      timeout: this.requestTimeoutMs,
    }

    return {
      checkCompatibility: async (request) => {
        const [response] = await client.checkCompatibility({
          ...request,
          property: propertyName,
        }, callOptions)

        return response
      },
      getMetadata: async (request = {}) => {
        const [response] = await client.getMetadata({
          ...request,
          name: request.name ?? `${propertyName}/metadata`,
        }, callOptions)

        return response
      },
      propertyName,
      runRealtimeReport: async (request) => {
        const [response] = await client.runRealtimeReport({
          ...request,
          property: propertyName,
        }, callOptions)

        return response
      },
      runReport: async (request) => {
        const [response] = await client.runReport({
          ...request,
          property: propertyName,
        }, callOptions)

        return response
      },
    }
  }
}
