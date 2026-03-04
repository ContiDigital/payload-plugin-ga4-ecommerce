import type { Payload } from 'payload'

import { devUsers } from './helpers/credentials.js'

type CategoryNode = {
  children?: CategoryNode[]
  description: string
  displayName: string
  order: number
  title: string
}

type ProductSeed = {
  categorySlugs: string[]
  description: string
  modelId: string
  onSale?: boolean
  price: number
  promoPrice?: number
  stock: number
  stockStatus: 'finished-production' | 'in-stock' | 'out-of-stock'
  suggestedPrice?: number
  title: string
}

type PageSeed = {
  description: string
  slug: string
  title: string
}

type RelationshipID = number | string

const toSlugSegment = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const getDocId = (doc: unknown): null | RelationshipID => {
  if (typeof doc !== 'object' || doc === null || !('id' in doc)) {
    return null
  }

  const id = doc.id
  if (typeof id === 'string' || typeof id === 'number') {
    return id
  }

  return null
}

const CATEGORY_TREE: CategoryNode[] = [
  {
    title: 'Fireplaces',
    displayName: 'Marble Fireplaces',
    description: 'In-stock luxury marble fireplace surrounds.',
    order: 1,
    children: [
      {
        title: 'Regency',
        displayName: 'Regency Marble Fireplaces',
        description: 'Elegant Regency-style marble mantels and surrounds.',
        order: 1,
      },
      {
        title: 'French',
        displayName: 'French Marble Fireplaces',
        description: 'Hand-carved French fireplace mantels in imported marble.',
        order: 2,
      },
      {
        title: 'Italian',
        displayName: 'Italian Marble Fireplaces',
        description: 'Italian quarried marble fireplaces and custom surrounds.',
        order: 3,
      },
    ],
  },
  {
    title: 'Fountains',
    displayName: 'Marble Fountains',
    description: 'Outdoor marble fountains for residential and commercial installations.',
    order: 2,
    children: [
      {
        title: 'Marble',
        displayName: 'Marble Fountains',
        description: 'Classic and contemporary marble fountain collections.',
        order: 1,
        children: [
          {
            title: 'Tiered',
            displayName: 'Tiered Marble Fountains',
            description: 'Multi-tiered marble fountains with cascading basins.',
            order: 1,
          },
          {
            title: 'Wall',
            displayName: 'Wall Marble Fountains',
            description: 'Wall-mounted marble fountains for compact spaces.',
            order: 2,
          },
        ],
      },
    ],
  },
]

const PRODUCT_SEED: ProductSeed[] = [
  {
    modelId: 'DEMO-1001',
    title: 'Calacatta Marble Mantel',
    description:
      'Hand-carved Calacatta marble mantel with fluted apron and pilasters.',
    categorySlugs: ['fireplaces/regency'],
    price: 14500,
    suggestedPrice: 15900,
    onSale: true,
    promoPrice: 13900,
    stock: 1,
    stockStatus: 'in-stock',
  },
  {
    modelId: 'DEMO-1002',
    title: 'French Style Marble Mantel',
    description: 'Finely carved French style mantel with acanthus detailing.',
    categorySlugs: ['fireplaces/french'],
    price: 17500,
    suggestedPrice: 19800,
    stock: 1,
    stockStatus: 'in-stock',
  },
  {
    modelId: 'DEMO-1003',
    title: 'Statuary Marble Fireplace Mantel',
    description: 'Statuary marble mantel with balanced neoclassical proportions.',
    categorySlugs: ['fireplaces/italian'],
    price: 16800,
    suggestedPrice: 18900,
    stock: 1,
    stockStatus: 'finished-production',
  },
  {
    modelId: 'DEMO-2001',
    title: 'Tiered Marble Fountain',
    description: 'Large-scale tiered marble fountain for outdoor installations.',
    categorySlugs: ['fountains/marble/tiered'],
    price: 22400,
    suggestedPrice: 24900,
    stock: 0,
    stockStatus: 'out-of-stock',
  },
]

const PAGE_SEED: PageSeed[] = [
  {
    title: 'Case Studies',
    slug: 'case-studies',
    description: 'Installation portfolio highlighting completed stonework projects.',
  },
  {
    title: 'Company',
    slug: 'company',
    description: 'Company overview, sourcing process, and installation capabilities.',
  },
  {
    title: 'Contact',
    slug: 'contact',
    description: 'Contact sales and support for in-stock or custom inquiries.',
  },
]

const seedUser = async (payload: Payload): Promise<void> => {
  if (!payload.collections.users) {
    return
  }

  for (const user of devUsers) {
    const existingUsers = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      where: {
        email: {
          equals: user.email,
        },
      },
    })

    if (existingUsers.docs.length === 0) {
      await payload.create({
        collection: 'users',
        data: user,
      })

      continue
    }

    const existingUserId = getDocId(existingUsers.docs[0])
    if (!existingUserId) {
      throw new Error(`Unable to resolve user id for seeded account ${user.email}`)
    }

    await payload.update({
      collection: 'users',
      id: existingUserId,
      data: user,
    })
  }
}

const upsertCategoryTree = async (
  payload: Payload,
  nodes: CategoryNode[],
  categoryMap: Map<string, RelationshipID>,
  parentId?: RelationshipID,
  parentSlug?: string,
): Promise<void> => {
  for (const node of nodes) {
    const ownSlug = toSlugSegment(node.title)
    const slug = parentSlug ? `${parentSlug}/${ownSlug}` : ownSlug

    const existingCategory = await payload.find({
      collection: 'test-categories',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 0,
    })

    const baseData = {
      title: node.title,
      displayName: node.displayName,
      description: node.description,
      order: node.order,
      parentId,
      _status: 'published' as const,
    }

    let categoryId: null | RelationshipID = null

    if (existingCategory.docs.length > 0) {
      const existing = existingCategory.docs[0]

      await payload.update({
        collection: 'test-categories',
        id: existing.id,
        data: baseData,
      })

      categoryId = getDocId(existing)
    } else {
      const created = await payload.create({
        collection: 'test-categories',
        data: baseData,
      })

      categoryId = getDocId(created)
    }

    if (!categoryId) {
      throw new Error(`Unable to resolve category id for slug ${slug}`)
    }

    categoryMap.set(slug, categoryId)

    if (node.children?.length) {
      await upsertCategoryTree(payload, node.children, categoryMap, categoryId, slug)
    }
  }
}

const seedProducts = async (
  payload: Payload,
  categoryMap: Map<string, RelationshipID>,
): Promise<void> => {
  for (const product of PRODUCT_SEED) {
    const categoryIds = product.categorySlugs
      .map((slug) => categoryMap.get(slug))
      .filter((value): value is RelationshipID => value !== undefined)

    if (categoryIds.length === 0) {
      throw new Error(`No category ids found for product ${product.modelId}`)
    }

    const existingProduct = await payload.find({
      collection: 'test-products',
      where: {
        modelId: {
          equals: product.modelId,
        },
      },
      limit: 1,
      depth: 0,
    })

    const data = {
      modelId: product.modelId,
      title: product.title,
      description: product.description,
      price: product.price,
      suggestedPrice: product.suggestedPrice,
      promoPrice: product.promoPrice,
      onSale: product.onSale ?? false,
      stock: product.stock,
      stockStatus: product.stockStatus,
      productCategories: categoryIds,
      _status: 'published' as const,
    }

    if (existingProduct.docs.length > 0) {
      await payload.update({
        collection: 'test-products',
        id: existingProduct.docs[0].id,
        data,
      })
    } else {
      await payload.create({
        collection: 'test-products',
        data,
      })
    }
  }
}

const seedPages = async (payload: Payload): Promise<void> => {
  for (const page of PAGE_SEED) {
    const existingPage = await payload.find({
      collection: 'test-pages',
      where: {
        slug: {
          equals: page.slug,
        },
      },
      limit: 1,
      depth: 0,
    })

    const data = {
      title: page.title,
      slug: page.slug,
      description: page.description,
      _status: 'published' as const,
    }

    if (existingPage.docs.length > 0) {
      await payload.update({
        collection: 'test-pages',
        id: existingPage.docs[0].id,
        data,
      })
    } else {
      await payload.create({
        collection: 'test-pages',
        data,
      })
    }
  }
}

export const seed = async (payload: Payload) => {
  await seedUser(payload)

  const categoryMap = new Map<string, RelationshipID>()
  await upsertCategoryTree(payload, CATEGORY_TREE, categoryMap)

  await seedProducts(payload, categoryMap)
  await seedPages(payload)
}
