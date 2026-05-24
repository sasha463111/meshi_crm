import { shopifyGraphQL } from './client'

const PRODUCT_UPDATE_STATUS = `
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status }
      userErrors { field message }
    }
  }
`

// Set a product's status in Shopify (ARCHIVED removes it from the store but keeps history)
export async function setShopifyProductStatus(
  shopifyProductId: string,
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
): Promise<void> {
  const gid = shopifyProductId.startsWith('gid://')
    ? shopifyProductId
    : `gid://shopify/Product/${shopifyProductId}`

  const res = await shopifyGraphQL<{
    productUpdate: {
      product: { id: string; status: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(PRODUCT_UPDATE_STATUS, { product: { id: gid, status } })

  if (res.productUpdate.userErrors?.length) {
    throw new Error(
      'Shopify status update failed: ' +
        res.productUpdate.userErrors.map((e) => e.message).join(', ')
    )
  }
}
