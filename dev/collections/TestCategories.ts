import type { CollectionConfig } from 'payload'

const toSlugSegment = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const toRelationshipID = (value: unknown): null | string => {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const relationId = value.id
    if (typeof relationId === 'string' || typeof relationId === 'number') {
      return String(relationId)
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return null
}

export const TestCategories: CollectionConfig = {
  slug: 'test-categories',
  admin: {
    defaultColumns: ['title', 'displayName', 'fullTitle', 'url', 'order'],
    useAsTitle: 'fullTitle',
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
          label: 'General Configuration',
          fields: [
            {
              name: 'title',
              label: 'Category Title',
              required: true,
              type: 'text',
            },
            {
              name: 'displayName',
              label: 'Display Name',
              type: 'text',
            },
            {
              name: 'description',
              label: 'Category Description',
              type: 'textarea',
            },
            {
              name: 'order',
              label: 'Category Order',
              type: 'number',
              defaultValue: 999,
            },
            {
              name: 'parentId',
              label: 'Category Parent',
              relationTo: 'test-categories',
              hasMany: false,
              required: false,
              type: 'relationship',
            },
            {
              name: 'fullTitle',
              label: 'Full Title',
              type: 'text',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'url',
              label: 'URL',
              type: 'text',
              admin: {
                readOnly: true,
              },
            },
          ],
        },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        if (!data) {
          return data
        }

        const title = typeof data.title === 'string' ? data.title.trim() : ''
        const parentRelationship = toRelationshipID(data.parentId)

        let parentFullTitle = ''
        let parentSlug = ''

        if (parentRelationship) {
          try {
            const parent = await req.payload.findByID({
              collection: 'test-categories',
              id: parentRelationship,
              depth: 0,
            })

            parentFullTitle = typeof parent.fullTitle === 'string' ? parent.fullTitle : ''
            parentSlug = typeof parent.slug === 'string' ? parent.slug : ''
          } catch {
            parentFullTitle = ''
            parentSlug = ''
          }
        }

        const ownSlug = toSlugSegment(title)
        const fullTitle = parentFullTitle ? `${parentFullTitle} > ${title}` : title
        const slug = parentSlug ? `${parentSlug}/${ownSlug}` : ownSlug

        data.displayName =
          typeof data.displayName === 'string' && data.displayName.trim().length > 0
            ? data.displayName.trim()
            : title
        data.fullTitle = fullTitle
        data.slug = slug
        data.url = `/products/browse/${slug}`

        return data
      },
    ],
  },
  versions: {
    drafts: true,
  },
}
