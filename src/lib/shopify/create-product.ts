import { shopifyGraphQL, extractIdFromGid } from './client'

export interface CreateProductInput {
  title: string
  description?: string
  price?: number | null
  compareAtPrice?: number | null
  sku?: string | null
  productType?: string | null
  category?: string | null
  vendor?: string | null
  tags?: string[]
  variants?: Array<{ title: string; inventory?: number; price?: number | null; sku?: string | null }>
  imageUrls?: string[]
  status?: 'ACTIVE' | 'DRAFT'
}

// Shopify standard taxonomy category IDs per product type
const CATEGORY_IDS: Record<string, string> = {
  'Bed Sheets': 'gid://shopify/TaxonomyCategory/hg-15-1-2',
  'Curtains': 'gid://shopify/TaxonomyCategory/hg-3-74-1-1',
  'Rugs': 'gid://shopify/TaxonomyCategory/hg-3-57',
  'Towels': 'gid://shopify/TaxonomyCategory/hg-15-4',
  'Chairs': 'gid://shopify/TaxonomyCategory/fr-7',
  'Pillows': 'gid://shopify/TaxonomyCategory/hg-15-1-9',
  'Blankets': 'gid://shopify/TaxonomyCategory/hg-15-1-4',
  'Sofa Covers': 'gid://shopify/TaxonomyCategory/hg-3-57', // fallback (decor)
}

// Publish to all storefront channels. meshitextile.co.il is served by Lovable,
// so the product must be published there (not just the default Online Store).
const PUBLICATION_IDS = [
  'gid://shopify/Publication/319801491529', // Online Store
  'gid://shopify/Publication/319810175049', // Lovable (meshitextile.co.il)
  'gid://shopify/Publication/320433619017', // Facebook & Instagram
]
const LOCATION_ID = 'gid://shopify/Location/112862625865'
const DEFAULT_INVENTORY = 100

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        variants(first: 10) {
          edges { node { id title } }
        }
      }
      userErrors { field message }
    }
  }
`

const PRODUCT_VARIANTS_BULK_CREATE = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      product { id }
      productVariants { id title }
      userErrors { field message }
    }
  }
`

const PRODUCT_VARIANT_UPDATE = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id title price sku }
      userErrors { field message }
    }
  }
`

const PUBLISH_MUTATION = `
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`

export async function createShopifyProduct(input: CreateProductInput): Promise<{
  shopifyProductId: string
  handle: string
  numericId: string
}> {
  const media = (input.imageUrls || []).map((url) => ({
    originalSource: url,
    mediaContentType: 'IMAGE' as const,
  }))

  const product: Record<string, unknown> = {
    title: input.title,
    descriptionHtml: input.description || '',
    status: input.status || 'ACTIVE',
    tags: input.tags || [],
  }
  if (input.productType) product.productType = input.productType
  if (input.vendor) product.vendor = input.vendor

  // Auto-fill the Shopify standard category based on product type
  const categoryId = input.productType ? CATEGORY_IDS[input.productType] : undefined
  if (categoryId) product.category = categoryId

  if (input.variants && input.variants.length > 0) {
    product.productOptions = [
      { name: 'גודל', values: input.variants.map((v) => ({ name: v.title })) },
    ]
  }

  const createRes = await shopifyGraphQL<{
    productCreate: {
      product: {
        id: string
        title: string
        handle: string
        variants: { edges: Array<{ node: { id: string; title: string } }> }
      } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(PRODUCT_CREATE_MUTATION, { product, media: media.length ? media : undefined })

  if (createRes.productCreate.userErrors?.length) {
    throw new Error(
      'Shopify product create failed: ' +
        createRes.productCreate.userErrors.map((e) => `${e.field?.join('.')}: ${e.message}`).join(', ')
    )
  }

  const newProduct = createRes.productCreate.product
  if (!newProduct) throw new Error('Shopify product create returned no product')

  const defaultPrice = input.price ?? 0

  // Helper: inventory config for each variant (tracked + 100 at location)
  const invConfig = (sku?: string | null) => ({
    inventoryItem: { tracked: true, ...(sku ? { sku } : {}) },
    inventoryQuantities: [{ availableQuantity: DEFAULT_INVENTORY, locationId: LOCATION_ID }],
  })

  if (input.variants && input.variants.length > 0) {
    const createdVariants = newProduct.variants.edges.map((e) => e.node)

    // Update the auto-created variants with price + inventory
    const variantInputs = input.variants.slice(0, createdVariants.length).map((v, idx) => ({
      id: createdVariants[idx].id,
      price: String(v.price ?? defaultPrice),
      ...invConfig(v.sku),
      ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
    }))

    if (variantInputs.length > 0) {
      await shopifyGraphQL(PRODUCT_VARIANT_UPDATE, { productId: newProduct.id, variants: variantInputs })
    }

    // Create any extra variants beyond the auto-created one
    if (input.variants.length > createdVariants.length) {
      const extras = input.variants.slice(createdVariants.length).map((v) => ({
        optionValues: [{ optionName: 'גודל', name: v.title }],
        price: String(v.price ?? defaultPrice),
        ...invConfig(v.sku),
        ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
      }))
      await shopifyGraphQL(PRODUCT_VARIANTS_BULK_CREATE, { productId: newProduct.id, variants: extras })
    }
  } else {
    // No sizes — set price + inventory on the default variant
    const defaultVariant = newProduct.variants.edges[0]?.node
    if (defaultVariant) {
      await shopifyGraphQL(PRODUCT_VARIANT_UPDATE, {
        productId: newProduct.id,
        variants: [
          {
            id: defaultVariant.id,
            price: String(input.price ?? defaultPrice),
            ...invConfig(input.sku),
            ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
          },
        ],
      })
    }
  }

  // Publish to all storefront channels (Online Store + Lovable + Facebook)
  if ((input.status || 'ACTIVE') === 'ACTIVE') {
    try {
      await shopifyGraphQL(PUBLISH_MUTATION, {
        id: newProduct.id,
        input: PUBLICATION_IDS.map((publicationId) => ({ publicationId })),
      })
    } catch (err) {
      console.error('Publish to channels failed:', err)
    }
  }

  return {
    shopifyProductId: extractIdFromGid(newProduct.id),
    handle: newProduct.handle,
    numericId: extractIdFromGid(newProduct.id),
  }
}
