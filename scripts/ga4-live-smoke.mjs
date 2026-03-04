import fs from 'node:fs'
import path from 'node:path'

import { BetaAnalyticsDataClient } from '@google-analytics/data'

const propertyId = process.env.GA4_PROPERTY_ID
const credentialsPath = process.env.GA4_CREDENTIALS_PATH

if (!propertyId) {
  throw new Error('Missing GA4_PROPERTY_ID')
}

if (!credentialsPath) {
  throw new Error('Missing GA4_CREDENTIALS_PATH')
}

const resolvedCredentialsPath = path.resolve(credentialsPath)
const credentials = JSON.parse(fs.readFileSync(resolvedCredentialsPath, 'utf8'))

const client = new BetaAnalyticsDataClient({
  credentials,
})

const [response] = await client.runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ endDate: 'today', startDate: '7daysAgo' }],
  dimensions: [{ name: 'date' }],
  limit: 1,
  metrics: [{ name: 'activeUsers' }],
})

if (!response || !Array.isArray(response.rows)) {
  throw new Error('GA4 live smoke test returned no rows array')
}

console.log(
  JSON.stringify({
    propertyId,
    rows: response.rows.length,
  }),
)
