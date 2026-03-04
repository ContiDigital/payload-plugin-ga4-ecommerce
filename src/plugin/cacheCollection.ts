import type { CollectionConfig } from 'payload'

export const createCacheCollection = (slug: string): CollectionConfig => {
  return {
    slug,
    access: {
      create: () => false,
      delete: () => false,
      read: () => false,
      update: () => false,
    },
    admin: {
      hidden: true,
    },
    fields: [
      {
        name: 'key',
        type: 'text',
        index: true,
        required: true,
        unique: true,
      },
      {
        name: 'value',
        type: 'json',
        required: true,
      },
      {
        name: 'expiresAt',
        type: 'date',
        index: true,
        required: true,
      },
      {
        name: 'accessedAt',
        type: 'date',
        index: true,
        required: true,
      },
    ],
  }
}
