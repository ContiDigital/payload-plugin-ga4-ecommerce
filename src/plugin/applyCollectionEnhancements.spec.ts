import type { Config, Field, TabsField } from 'payload'

import { describe, expect, test } from 'vitest'

import type { NormalizedPluginOptions } from '../types/index.js'

import {
  AnalyticsUIPlaceholder,
  applyCollectionEnhancements,
  getAnalyticsField,
  getAnalyticsTab,
} from './applyCollectionEnhancements.js'

const ANALYTICS_FIELD_NAME = 'ga4RecordAnalytics'

const createOptions = (overrides?: Partial<NormalizedPluginOptions>): NormalizedPluginOptions => ({
  access: undefined,
  admin: {
    mode: 'route',
    navLabel: 'Analytics',
    route: '/analytics',
  },
  api: {
    basePath: '/analytics/ga4',
  },
  autoInjectUI: true,
  cache: {
    aggregateTtlMs: 30_000,
    collectionSlug: 'ga4-cache',
    enabled: true,
    maxEntries: 100,
    strategy: 'payloadCollection',
    timeseriesTtlMs: 30_000,
  },
  collections: [
    {
      slug: 'posts',
      pathnameField: 'slug',
    },
  ],
  disabled: false,
  events: {
    reportLimit: 10,
    trackedEventNames: [],
  },
  getCredentials: () => Promise.resolve({
    type: 'keyFilename',
    path: './dev/.google-credentials.json',
  }),
  propertyId: '123',
  rateLimit: {
    baseRetryDelayMs: 250,
    enabled: true,
    includePropertyQuota: true,
    jitterFactor: 0.2,
    maxConcurrency: 2,
    maxQueueSize: 100,
    maxRequestsPerMinute: 120,
    maxRetries: 2,
    maxRetryDelayMs: 4_000,
    requestTimeoutMs: 10_000,
  },
  source: {
    dimension: 'sessionSource',
  },
  ...overrides,
})

const createCollectionConfig = (fields: Field[]): Config =>
  ({
    collections: [
      {
        slug: 'posts',
        fields,
      },
    ],
    routes: {
      admin: '/admin',
      api: '/cms-api',
    },
  }) as unknown as Config

const findAnalyticsField = (fields: Field[]): Field | undefined =>
  fields.find(
    (field) => 'name' in field && field.name === ANALYTICS_FIELD_NAME,
  )

const assertHydratedField = (field: Field | undefined): void => {
  expect(field).toBeDefined()
  expect(field?.admin).toMatchObject({
    components: {
      Field: 'payload-plugin-ga4-ecommerce/rsc#RecordAnalyticsField',
    },
  })
  expect(field?.custom).toMatchObject({
    ga4: {
      apiBasePath: '/analytics/ga4',
      apiRoute: '/cms-api',
      collectionSlug: 'posts',
    },
  })
}

describe('applyCollectionEnhancements', () => {
  // -----------------------------------------------------------------------
  // Placeholder replacement
  // -----------------------------------------------------------------------

  test('replaces placeholder inside a group field', () => {
    const config = createCollectionConfig([
      { name: 'title', type: 'text' },
      {
        name: 'content',
        type: 'group',
        fields: [AnalyticsUIPlaceholder],
        label: 'Content',
      },
    ])

    const result = applyCollectionEnhancements(config, createOptions({ autoInjectUI: false }))
    const posts = result.collections?.find((c) => c.slug === 'posts')
    const group = posts?.fields?.find((f) => f.type === 'group')

    if (!group || !('fields' in group) || !Array.isArray(group.fields)) {
      throw new Error('Expected group field')
    }

    assertHydratedField(findAnalyticsField(group.fields))
  })

  test('replaces placeholder inside a tabs field', () => {
    const config = createCollectionConfig([
      {
        type: 'tabs',
        tabs: [
          { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
          { label: 'Insights', fields: [AnalyticsUIPlaceholder] },
          { label: 'SEO', fields: [{ name: 'metaTitle', type: 'text' }] },
        ],
      },
    ])

    const result = applyCollectionEnhancements(config, createOptions({ autoInjectUI: false }))
    const posts = result.collections?.find((c) => c.slug === 'posts')
    const tabsField = posts?.fields?.find((f) => f.type === 'tabs') as TabsField | undefined

    expect(tabsField).toBeDefined()
    // Should be 3 tabs — the placeholder is replaced, not appended
    expect(tabsField?.tabs).toHaveLength(3)

    const insightsTab = tabsField?.tabs.find((t) => t.label === 'Insights')
    assertHydratedField(findAnalyticsField(insightsTab?.fields ?? []))
  })

  test('does not inject when autoInjectUI is false and no placeholder exists', () => {
    const config = createCollectionConfig([{ name: 'title', type: 'text' }])

    const result = applyCollectionEnhancements(config, createOptions({ autoInjectUI: false }))
    const posts = result.collections?.find((c) => c.slug === 'posts')

    expect(findAnalyticsField(posts?.fields ?? [])).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Auto-injection
  // -----------------------------------------------------------------------

  test('auto-injects analytics tab into existing tabs field', () => {
    const config = createCollectionConfig([
      {
        type: 'tabs',
        tabs: [
          { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
          { label: 'SEO', fields: [{ name: 'metaTitle', type: 'text' }] },
        ],
      },
    ])

    const result = applyCollectionEnhancements(config, createOptions())
    const posts = result.collections?.find((c) => c.slug === 'posts')
    const tabsField = posts?.fields?.find((f) => f.type === 'tabs') as TabsField | undefined

    // Should now have 3 tabs — Content, SEO, Analytics (appended)
    expect(tabsField?.tabs).toHaveLength(3)

    const analyticsTab = tabsField?.tabs[2]
    expect(analyticsTab?.label).toBe('Analytics')
    assertHydratedField(findAnalyticsField(analyticsTab?.fields ?? []))
  })

  test('auto-injects as root field when collection has no tabs', () => {
    const config = createCollectionConfig([
      { name: 'title', type: 'text' },
      { name: 'body', type: 'textarea' },
    ])

    const result = applyCollectionEnhancements(config, createOptions())
    const posts = result.collections?.find((c) => c.slug === 'posts')

    // Should be 3 fields: title, body, analytics
    expect(posts?.fields).toHaveLength(3)
    assertHydratedField(findAnalyticsField(posts?.fields ?? []))
  })

  test('does not duplicate analytics field on existing tabs', () => {
    // First pass
    const config = createCollectionConfig([
      {
        type: 'tabs',
        tabs: [
          { label: 'Content', fields: [{ name: 'title', type: 'text' }] },
        ],
      },
    ])

    const first = applyCollectionEnhancements(config, createOptions())
    // Run enhancement again on already-enhanced config
    const second = applyCollectionEnhancements(first, createOptions())
    const posts = second.collections?.find((c) => c.slug === 'posts')
    const tabsField = posts?.fields?.find((f) => f.type === 'tabs') as TabsField | undefined

    // Should still be 2 tabs, not 3
    expect(tabsField?.tabs).toHaveLength(2)
  })

  test('does not duplicate analytics field on root fields', () => {
    const config = createCollectionConfig([{ name: 'title', type: 'text' }])

    const first = applyCollectionEnhancements(config, createOptions())
    const second = applyCollectionEnhancements(first, createOptions())
    const posts = second.collections?.find((c) => c.slug === 'posts')

    // Should be 2 fields, not 3
    expect(posts?.fields).toHaveLength(2)
  })

  // -----------------------------------------------------------------------
  // Exported helpers
  // -----------------------------------------------------------------------

  test('getAnalyticsField returns a hydrated ui field', () => {
    const field = getAnalyticsField({
      apiBasePath: '/analytics/ga4',
      apiRoute: '/api',
      collectionConfig: { slug: 'products', pathnameField: 'slug' },
      collectionSlug: 'products',
    })

    expect(field.type).toBe('ui')
    expect(field.name).toBe(ANALYTICS_FIELD_NAME)
    expect(field.admin?.components?.Field).toBe('payload-plugin-ga4-ecommerce/rsc#RecordAnalyticsField')
    expect(field.custom).toMatchObject({
      ga4: {
        apiBasePath: '/analytics/ga4',
        apiRoute: '/api',
        collectionSlug: 'products',
      },
    })
  })

  test('getAnalyticsTab returns a tab with the hydrated field', () => {
    const tab = getAnalyticsTab({
      apiBasePath: '/analytics/ga4',
      apiRoute: '/api',
      collectionConfig: { slug: 'products', pathnameField: 'slug' },
      collectionSlug: 'products',
    })

    expect(tab.label).toBe('Analytics')
    expect(tab.fields).toHaveLength(1)
    expect(tab.fields[0].type).toBe('ui')
    expect(tab.fields[0].name).toBe(ANALYTICS_FIELD_NAME)
  })

  // -----------------------------------------------------------------------
  // Cache collection
  // -----------------------------------------------------------------------

  test('adds cache collection when strategy is payloadCollection', () => {
    const config = createCollectionConfig([{ name: 'title', type: 'text' }])

    const result = applyCollectionEnhancements(config, createOptions())

    const cacheCollection = result.collections?.find((c) => c.slug === 'ga4-cache')
    expect(cacheCollection).toBeDefined()
    expect(cacheCollection?.admin?.hidden).toBe(true)
  })

  test('does not add cache collection when strategy is redis', () => {
    const config = createCollectionConfig([{ name: 'title', type: 'text' }])

    const result = applyCollectionEnhancements(
      config,
      createOptions({
        cache: {
          aggregateTtlMs: 30_000,
          collectionSlug: 'ga4-cache',
          enabled: true,
          maxEntries: 100,
          redis: { url: 'redis://localhost:6379', keyPrefix: 'test' },
          strategy: 'redis',
          timeseriesTtlMs: 30_000,
        },
      }),
    )

    const cacheCollection = result.collections?.find((c) => c.slug === 'ga4-cache')
    expect(cacheCollection).toBeUndefined()
  })
})
