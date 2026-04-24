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

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        variants(first: 10) {
          edges {
            node { id title }
          }
        }
      }
      userErrors {
        field
        message
      }
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
  // Category - Shopify uses category taxonomy, but productType + tags also work.
  // We set productType as the main "category" since existing products use it that way.

  // If variants provided, add productOptions so we can create variants with those option values
  if (input.variants && input.variants.length > 0) {
    product.productOptions = [
      {
        name: 'גודל',
        values: input.variants.map((v) => ({ name: v.title })),
      },
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

  // Handle variants — update the auto-created ones (or create more)
  if (input.variants && input.variants.length > 0) {
    const defaultPrice = input.price ?? 0
    const createdVariants = newProduct.variants.edges.map((e) => e.node)

    // Build variant inputs with prices and inventory-related fields
    const variantInputs = input.variants.map((v, idx) => {
      const existing = createdVariants[idx]
      return {
        id: existing?.id,
        price: String(v.price ?? defaultPrice),
        inventoryItem: v.sku ? { sku: v.sku } : {},
        ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
      }
    }).filter((v) => v.id)

    if (variantInputs.length > 0) {
      await shopifyGraphQL(PRODUCT_VARIANT_UPDATE, {
        productId: newProduct.id,
        variants: variantInputs,
      })
    }

    // If user provided more variants than Shopify auto-created, create the extras
    if (input.variants.length > createdVariants.length) {
      const extras = input.variants.slice(createdVariants.length).map((v) => ({
        optionValues: [{ optionName: 'גודל', name: v.title }],
        price: String(v.price ?? defaultPrice),
        ...(v.sku ? { inventoryItem: { sku: v.sku } } : {}),
        ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
      }))
      await shopifyGraphQL(PRODUCT_VARIANTS_BULK_CREATE, {
        productId: newProduct.id,
        variants: extras,
      })
    }
  } else if (input.price) {
    // No variants — just update the default variant price
    const defaultVariant = newProduct.variants.edges[0]?.node
    if (defaultVariant) {
      await shopifyGraphQL(PRODUCT_VARIANT_UPDATE, {
        productId: newProduct.id,
        variants: [
          {
            id: defaultVariant.id,
            price: String(input.price),
            ...(input.sku ? { inventoryItem: { sku: input.sku } } : {}),
            ...(input.compareAtPrice ? { compareAtPrice: String(input.compareAtPrice) } : {}),
          },
        ],
      })
    }
  }

  return {
    shopifyProductId: extractIdFromGid(newProduct.id),
    handle: newProduct.handle,
    numericId: extractIdFromGid(newProduct.id),
  }
}
