import type { Config, Field, TabsField } from 'payload'

import type { CollectionAnalyticsConfig, NormalizedPluginOptions } from '../types/index.js'

import { PLUGIN_MODULE_ID } from '../constants.js'

const ANALYTICS_FIELD_NAME = 'ga4RecordAnalytics'
const ANALYTICS_TAB_LABEL = 'Analytics'

const createAnalyticsField = (
  collectionSlug: string,
  collectionConfig: CollectionAnalyticsConfig,
  options: NormalizedPluginOptions,
): Field => {
  return {
    name: ANALYTICS_FIELD_NAME,
    type: 'ui',
    admin: {
      components: {
        Field: `${PLUGIN_MODULE_ID}/rsc#RecordAnalyticsField`,
      },
    },
    custom: {
      ga4: {
        apiBasePath: options.api.basePath,
        collectionConfig,
        collectionSlug,
      },
    },
  }
}

const hasAnalyticsField = (tabsField: TabsField): boolean => {
  return tabsField.tabs.some((tab) =>
    tab.fields.some(
      (field) =>
        typeof field === 'object' && field !== null && 'name' in field && field.name === ANALYTICS_FIELD_NAME,
    ),
  )
}

const injectAnalyticsField = (
  collection: NonNullable<Config['collections']>[number],
  analyticsField: Field,
): NonNullable<Config['collections']>[number] => {
  const collectionFields = collection.fields ?? []
  const firstField = collectionFields[0]

  if (firstField?.type === 'tabs') {
    const tabsField = firstField

    if (hasAnalyticsField(tabsField)) {
      return collection
    }

    const updatedTabsField: TabsField = {
      ...tabsField,
      tabs: [
        ...tabsField.tabs,
        {
          fields: [analyticsField],
          label: ANALYTICS_TAB_LABEL,
        },
      ],
    }

    return {
      ...collection,
      fields: [updatedTabsField, ...collectionFields.slice(1)],
    }
  }

  const contentLabel = collection.labels?.singular ?? 'Content'

  const wrappedTabsField: TabsField = {
    type: 'tabs',
    tabs: [
      {
        fields: collectionFields,
        label: contentLabel,
      },
      {
        fields: [analyticsField],
        label: ANALYTICS_TAB_LABEL,
      },
    ],
  }

  return {
    ...collection,
    fields: [wrappedTabsField],
  }
}

export const applyCollectionEnhancements = (
  config: Config,
  options: NormalizedPluginOptions,
): Config => {
  if (!config.collections || options.collections.length === 0) {
    return config
  }

  const enhancedCollections = config.collections.map((collection) => {
    const match = options.collections.find((entry) => entry.slug === collection.slug)

    if (!match) {
      return collection
    }

    const analyticsField = createAnalyticsField(collection.slug, match, options)
    return injectAnalyticsField(collection, analyticsField)
  })

  return {
    ...config,
    collections: enhancedCollections,
  }
}
