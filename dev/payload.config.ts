import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import fs from 'fs'
import path from 'path'
import { buildConfig } from 'payload'
import { payloadGa4AnalyticsPlugin } from 'payload-ga4-analytics-plugin'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { TestCategories } from './collections/TestCategories.js'
import { TestPages } from './collections/TestPages.js'
import { TestProducts } from './collections/TestProducts.js'
import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const resolveSQLiteURL = (): string => {
  if (process.env.NODE_ENV === 'test') {
    const testDBPath = path.resolve(dirname, `.test-db-${process.pid}-${Date.now()}.db`)
    return `file:${testDBPath}`
  }

  if (process.env.LOCAL_OVERRIDE_DATABASE) {
    return process.env.LOCAL_OVERRIDE_DATABASE
  }

  if (process.env.DATABASE_URI) {
    return process.env.DATABASE_URI
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  return `file:${path.resolve(dirname, 'dev.db')}`
}

const resolveGA4CredentialsPath = (): string => {
  if (process.env.GA4_CREDENTIALS_PATH) {
    return process.env.GA4_CREDENTIALS_PATH
  }

  return path.resolve(dirname, '.google-credentials.json')
}

const buildConfigWithSQLite = async () => {
  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'posts',
        fields: [
          {
            name: 'title',
            type: 'text',
          },
          {
            name: 'slug',
            type: 'text',
          },
        ],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
      TestProducts,
      TestCategories,
      TestPages,
    ],
    db: sqliteAdapter({
      client: {
        url: resolveSQLiteURL(),
      },
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      payloadGa4AnalyticsPlugin({
        access: ({ user }) => Boolean(user),
        admin: {
          mode: 'route',
          navLabel: 'Analytics',
          route: '/analytics',
        },
        events: {
          reportLimit: 10,
          trackedEventNames: [
            'phone_call',
            'purchase',
            'product_inquiry',
            'add_to_cart',
            'begin_checkout_process',
            'submit_order',
          ],
        },
        collections: [
          {
            getPathname: (doc) => `/products/${doc.slug}`,
            slug: 'test-products',
          },
          {
            pathnameField: 'url',
            slug: 'test-categories',
          },
          {
            getPathname: (doc) => `/${doc.slug}`,
            slug: 'test-pages',
          },
        ],
        getCredentials: async () => {
          const credentialsPath = resolveGA4CredentialsPath()

          if (!fs.existsSync(credentialsPath)) {
            throw new Error(
              `GA4 credentials file not found at ${credentialsPath}. Set GA4_CREDENTIALS_PATH in dev/.env.`,
            )
          }

          return {
            path: credentialsPath,
            type: 'keyFilename',
          }
        },
        propertyId: process.env.GA4_PROPERTY_ID ?? '123456789',
        source: {
          dimension: 'sessionSource',
        },
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithSQLite()
