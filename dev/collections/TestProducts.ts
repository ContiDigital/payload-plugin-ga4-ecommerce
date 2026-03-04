import type { CollectionConfig } from 'payload'

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const toCategoryId = (value: unknown): null | string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const relationId = value.id
    if (typeof relationId === 'string' || typeof relationId === 'number') {
      return String(relationId)
    }
  }

  return null
}

export const TestProducts: CollectionConfig = {
  slug: 'test-products',
  admin: {
    defaultColumns: ['modelId', 'title', 'price', 'effectivePrice', 'stock', 'createdAt'],
    listSearchableFields: ['modelId', 'title'],
    useAsTitle: 'modelId',
  },
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
    update: () => true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Product Details',
          fields: [
            {
              name: 'modelId',
              label: 'Model ID',
              required: true,
              unique: true,
              type: 'text',
            },
            {
              name: 'title',
              label: 'Title',
              required: true,
              type: 'text',
            },
            {
              name: 'description',
              label: 'Description',
              type: 'textarea',
            },
            {
              name: 'price',
              label: 'Price',
              required: true,
              type: 'number',
            },
            {
              name: 'suggestedPrice',
              label: 'Suggested Price',
              type: 'number',
            },
            {
              name: 'promoPrice',
              label: 'Promotional Price',
              type: 'number',
            },
            {
              name: 'onSale',
              label: 'On Sale',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'effectivePrice',
              label: 'Effective Price',
              type: 'number',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'stock',
              label: 'Stock',
              type: 'number',
              defaultValue: 1,
            },
            {
              name: 'stockStatus',
              label: 'Stock Status',
              type: 'select',
              defaultValue: 'in-stock',
              options: [
                {
                  label: 'In Stock',
                  value: 'in-stock',
                },
                {
                  label: 'Out of Stock',
                  value: 'out-of-stock',
                },
                {
                  label: 'Arriving Soon',
                  value: 'finished-production',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'productCategories',
      label: 'Product Categories',
      relationTo: 'test-categories',
      hasMany: true,
      required: false,
      type: 'relationship',
    },
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      hooks: {
        beforeValidate: [
          async ({ data, originalDoc, req }) => {
            const modelId =
              typeof data?.modelId === 'string'
                ? data.modelId
                : typeof originalDoc?.modelId === 'string'
                  ? originalDoc.modelId
                  : ''

            const categoryCandidate =
              (Array.isArray(data?.productCategories) && data.productCategories[0]) ||
              (Array.isArray(originalDoc?.productCategories) && originalDoc.productCategories[0])

            const categoryId = toCategoryId(categoryCandidate)

            let categoryDisplayName = ''

            if (categoryId) {
              try {
                const category = await req.payload.findByID({
                  collection: 'test-categories',
                  id: categoryId,
                  depth: 0,
                })

                categoryDisplayName =
                  typeof category.displayName === 'string' ? category.displayName : ''
              } catch {
                categoryDisplayName = ''
              }
            }

            return toSlug(`${modelId}-${categoryDisplayName}`)
          },
        ],
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data) {
          return data
        }

        const price = typeof data.price === 'number' ? data.price : 0
        const promoPrice = typeof data.promoPrice === 'number' ? data.promoPrice : null
        data.effectivePrice = promoPrice ?? price

        return data
      },
    ],
  },
  versions: {
    drafts: true,
  },
}
