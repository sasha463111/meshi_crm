import { shopifyGraphQL, extractIdFromGid } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

function toVariantGid(id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`
}
function toProductGid(id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`
}

const DELETE_VARIANTS = `
  mutation productVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      product { id }
      userErrors { field message }
    }
  }
`

const CREATE_VARIANTS = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title }
      userErrors { field message }
    }
  }
`

const PRODUCT_DETAIL = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      status
      tags
      productType
      options { name }
      images(first: 10) { edges { node { url altText } } }
      variants(first: 50) {
        edges { node { id title sku barcode price compareAtPrice inventoryQuantity } }
      }
    }
  }
`

// Delete a single variant (size) from a product in Shopify, then refresh DB row
export async function deleteProductVariant(shopifyProductId: string, variantId: string) {
  const res = await shopifyGraphQL<{
    productVariantsBulkDelete: { userErrors: { field: string[]; message: string }[] }
  }>(DELETE_VARIANTS, {
    productId: toProductGid(shopifyProductId),
    variantsIds: [toVariantGid(variantId)],
  })

  const errs = res.productVariantsBulkDelete.userErrors
  if (errs?.length) {
    throw new Error(errs.map((e) => e.message).join(', '))
  }

  await refreshProductInDb(shopifyProductId)
}

// Add a new variant (size) to a product. Uses the product's first option name.
export async function addProductVariant(
  shopifyProductId: string,
  size: string,
  price: number,
  inventory: number // currently informational; inventory set separately requires location
) {
  // Fetch product to get its option name
  const detail = await shopifyGraphQL<{
    product: {
      options: { name: string }[]
      variants: { edges: { node: { title: string } }[] }
    } | null
  }>(PRODUCT_DETAIL, { id: toProductGid(shopifyProductId) })

  if (!detail.product) throw new Error('Product not found in Shopify')

  const optionName = detail.product.options?.[0]?.name || 'גודל'

  // Prevent duplicate size
  const existingTitles = detail.product.variants.edges.map((e) => e.node.title)
  if (existingTitles.includes(size)) {
    throw new Error(`הגודל "${size}" כבר קיים`)
  }

  const res = await shopifyGraphQL<{
    productVariantsBulkCreate: {
      productVariants: { id: string; title: string }[]
      userErrors: { field: string[]; message: string }[]
    }
  }>(CREATE_VARIANTS, {
    productId: toProductGid(shopifyProductId),
    variants: [
      {
        optionValues: [{ optionName, name: size }],
        price: String(price),
      },
    ],
  })

  const errs = res.productVariantsBulkCreate.userErrors
  if (errs?.length) {
    throw new Error(errs.map((e) => e.message).join(', '))
  }

  await refreshProductInDb(shopifyProductId)
  void inventory
}

// Re-fetch a single product from Shopify and update its DB row (shopify_data, price, inventory)
export async function refreshProductInDb(shopifyProductId: string) {
  const detail = await shopifyGraphQL<{
    product: Record<string, unknown> | null
  }>(PRODUCT_DETAIL, { id: toProductGid(shopifyProductId) })

  if (!detail.product) return

  const product = detail.product
  const variantsEdges = (product.variants as { edges: { node: Record<string, unknown> }[] }).edges || []
  const lastVariant = variantsEdges[variantsEdges.length - 1]?.node
  const images = ((product.images as { edges: { node: Record<string, string> }[] }).edges || []).map((e) => ({
    url: e.node.url,
    alt: e.node.altText || '',
  }))
  const totalInventory = variantsEdges.reduce(
    (sum, e) => sum + ((e.node.inventoryQuantity as number) || 0),
    0
  )

  // Store shopify_data in the same shape the sync uses (variants.edges)
  const shopifyData = {
    id: product.id,
    title: product.title,
    status: product.status,
    tags: product.tags,
    productType: product.productType,
    descriptionHtml: product.descriptionHtml,
    images: product.images,
    variants: { edges: variantsEdges.map((e) => ({ node: e.node })) },
  }

  const supabase = createAdminClient()
  await supabase
    .from('products')
    .update({
      shopify_data: shopifyData,
      price: lastVariant ? parseFloat(lastVariant.price as string) : undefined,
      inventory_quantity: totalInventory,
      images,
      status: (product.status as string)?.toLowerCase() || 'active',
      last_synced_at: new Date().toISOString(),
    })
    .eq('shopify_product_id', extractIdFromGid(product.id as string))
}
