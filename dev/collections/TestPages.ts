import type { CollectionConfig } from 'payload'

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

export const TestPages: CollectionConfig = {
  slug: 'test-pages',
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
  },
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
    update: () => true,
  },
  fields: [
    {
      name: 'title',
      label: 'Page Title',
      required: true,
      type: 'text',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
    },
    {
      name: 'slug',
      label: 'Slug',
      index: true,
      type: 'text',
      hooks: {
        beforeValidate: [
          ({ data, value }) => {
            if (typeof value === 'string' && value.trim().length > 0) {
              return value
            }

            if (typeof data?.title === 'string' && data.title.trim().length > 0) {
              return toSlug(data.title)
            }

            return value
          },
        ],
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
  versions: {
    drafts: true,
  },
}
