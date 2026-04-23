import { shopifyGraphQL, extractIdFromGid } from './client'

interface CreateProductInput {
  title: string
  description?: string
  price?: number
  sku?: string
  variants?: Array<{ title: string; inventory?: number; price?: number; sku?: string }>
  imageUrls?: string[]
  tags?: string[]
}

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
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

export async function createShopifyProduct(input: CreateProductInput): Promise<{
  shopifyProductId: string
  handle: string
}> {
  // Build media (images)
  const media = (input.imageUrls || []).map((url) => ({
    originalSource: url,
    mediaContentType: 'IMAGE' as const,
  }))

  // Create product with first variant's price/sku (Shopify requires at least one variant)
  const firstVariant = input.variants?.[0]
  const product: Record<string, unknown> = {
    title: input.title,
    descriptionHtml: input.description || '',
    status: 'DRAFT', // Start as draft - admin can publish later
    tags: input.tags || [],
  }

  const createRes = await shopifyGraphQL<{
    productCreate: {
      product: { id: string; title: string; handle: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(PRODUCT_CREATE_MUTATION, { product, media: media.length ? media : undefined })

  if (createRes.productCreate.userErrors?.length) {
    throw new Error(
      'Shopify product create failed: ' +
        createRes.productCreate.userErrors.map((e) => e.message).join(', ')
    )
  }

  const newProduct = createRes.productCreate.product
  if (!newProduct) throw new Error('Shopify product create returned no product')

  // Create variants if provided
  if (input.variants && input.variants.length > 0) {
    const defaultPrice = firstVariant?.price ?? input.price ?? 0
    const variantInputs = input.variants.map((v) => ({
      optionValues: [{ optionName: 'גודל', name: v.title }],
      price: String(v.price ?? defaultPrice),
      inventoryItem: { sku: v.sku || input.sku || '' },
    }))

    await shopifyGraphQL(PRODUCT_VARIANTS_BULK_CREATE, {
      productId: newProduct.id,
      variants: variantInputs,
    })
  }

  return {
    shopifyProductId: extractIdFromGid(newProduct.id),
    handle: newProduct.handle,
  }
}
