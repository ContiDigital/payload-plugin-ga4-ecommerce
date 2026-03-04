import type { Config, Field, TabsField } from 'payload'

import type {
  AnalyticsUIPlacementConfig,
  NormalizedPluginOptions,
} from '../types/index.js'

import { PLUGIN_MODULE_ID } from '../constants.js'
import { createCacheCollection } from './cacheCollection.js'

const ANALYTICS_FIELD_NAME = 'ga4RecordAnalytics'
const ANALYTICS_TAB_LABEL = 'Analytics'

type PlaceholderCustomConfig = {
  ga4?: {
    placeholder?: boolean
  }
}

export const AnalyticsUIPlaceholder: Field = {
  name: ANALYTICS_FIELD_NAME,
  type: 'ui',
  admin: {
    condition: () => false,
  },
  custom: {
    ga4: {
      placeholder: true,
    },
  },
}

const normalizeRoutePrefix = (value: string): string => {
  if (value === '/') {
    return '/'
  }

  if (!value.startsWith('/')) {
    return `/${value.replace(/\/$/, '')}`
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

const normalizeBasePath = (value: string): string => {
  if (!value.startsWith('/')) {
    return `/${value}`
  }

  return value
}

const createAnalyticsField = (
  args: AnalyticsUIPlacementConfig,
): Field => {
  const apiRoute = normalizeRoutePrefix(args.apiRoute ?? '/api')
  const apiBasePath = normalizeBasePath(args.apiBasePath ?? '/analytics/ga4')

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
        apiBasePath,
        apiRoute,
        collectionConfig: args.collectionConfig,
        collectionSlug: args.collectionSlug,
      },
    },
  }
}

const isPlaceholderField = (field: Field): boolean => {
  if (field.type !== 'ui') {
    return false
  }

  if (field.name !== ANALYTICS_FIELD_NAME) {
    return false
  }

  const custom = (field.custom ?? {}) as PlaceholderCustomConfig
  return custom.ga4?.placeholder === true
}

const replacePlaceholderInFields = (args: {
  fields: Field[]
  replacement: Field
}): { fields: Field[]; replaced: boolean } => {
  let replacedAny = false

  const nextFields = args.fields.map((field) => {
    if (isPlaceholderField(field)) {
      replacedAny = true
      return args.replacement
    }

    if (field.type === 'tabs') {
      let tabsReplaced = false

      const nextTabs = field.tabs.map((tab) => {
        const nested = replacePlaceholderInFields({
          fields: tab.fields,
          replacement: args.replacement,
        })

        if (nested.replaced) {
          tabsReplaced = true
        }

        return nested.replaced ? { ...tab, fields: nested.fields } : tab
      })

      if (tabsReplaced) {
        replacedAny = true
        return {
          ...field,
          tabs: nextTabs,
        }
      }

      return field
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      const nested = replacePlaceholderInFields({
        fields: field.fields,
        replacement: args.replacement,
      })

      if (!nested.replaced) {
        return field
      }

      replacedAny = true
      return {
        ...field,
        fields: nested.fields,
      }
    }

    if (field.type === 'blocks') {
      let blockReplaced = false

      const nextBlocks = field.blocks.map((block) => {
        const nested = replacePlaceholderInFields({
          fields: block.fields,
          replacement: args.replacement,
        })

        if (!nested.replaced) {
          return block
        }

        blockReplaced = true
        return {
          ...block,
          fields: nested.fields,
        }
      })

      if (!blockReplaced) {
        return field
      }

      replacedAny = true
      return {
        ...field,
        blocks: nextBlocks,
      }
    }

    return field
  })

  return {
    fields: nextFields,
    replaced: replacedAny,
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
  const tabsFieldIndex = collectionFields.findIndex((field) => field.type === 'tabs')

  if (tabsFieldIndex >= 0) {
    const tabsField = collectionFields[tabsFieldIndex] as TabsField

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

    const nextFields = [...collectionFields]
    nextFields[tabsFieldIndex] = updatedTabsField

    return {
      ...collection,
      fields: nextFields,
    }
  }

  const hasRootAnalyticsField = collectionFields.some(
    (field) => typeof field === 'object' && field !== null && 'name' in field && field.name === ANALYTICS_FIELD_NAME,
  )

  if (hasRootAnalyticsField) {
    return collection
  }

  return {
    ...collection,
    fields: [...collectionFields, analyticsField],
  }
}

/**
 * Creates the analytics UI field for manual placement in collection configs.
 * Use this when `autoInjectUI` is false and you want to control where the
 * analytics panel appears in your collection layout.
 */
export const getAnalyticsField = (
  config: AnalyticsUIPlacementConfig,
): Field => createAnalyticsField(config)

/**
 * Creates an analytics tab for manual placement in a TabsField.
 * Use this when `autoInjectUI` is false and your collection uses tabs.
 */
export const getAnalyticsTab = (
  config: AnalyticsUIPlacementConfig,
): { fields: Field[]; label: string } => ({
  fields: [createAnalyticsField(config)],
  label: ANALYTICS_TAB_LABEL,
})

export const applyCollectionEnhancements = (
  config: Config,
  options: NormalizedPluginOptions,
): Config => {
  if (!config.collections) {
    return config
  }

  const apiRoute = config.routes?.api ?? '/api'
  const enhancedCollections =
    options.collections.length === 0
      ? [...config.collections]
      : config.collections.map((collection) => {
          const match = options.collections.find((entry) => entry.slug === collection.slug)

          if (!match) {
            return collection
          }

          const hydratedField = createAnalyticsField({
            apiBasePath: options.api.basePath,
            apiRoute,
            collectionConfig: match,
            collectionSlug: collection.slug,
          })

          const existingFields = collection.fields ?? []
          const replacementResult = replacePlaceholderInFields({
            fields: existingFields,
            replacement: hydratedField,
          })

          if (replacementResult.replaced) {
            return {
              ...collection,
              fields: replacementResult.fields,
            }
          }

          if (!options.autoInjectUI) {
            return collection
          }

          return injectAnalyticsField(collection, hydratedField)
        })

  if (
    options.cache.strategy === 'payloadCollection' &&
    !enhancedCollections.some((collection) => collection.slug === options.cache.collectionSlug)
  ) {
    enhancedCollections.push(createCacheCollection(options.cache.collectionSlug))
  }

  return {
    ...config,
    collections: enhancedCollections,
  }
}
