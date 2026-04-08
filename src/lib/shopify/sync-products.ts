import { shopifyGraphQL, extractIdFromGid } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const PRODUCTS_QUERY = `
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          descriptionHtml
          status
          tags
          productType
          images(first: 10) { edges { node { url altText } } }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                inventoryQuantity
              }
            }
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`

export async function syncProducts() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('sync_logs')
    .insert({ source: 'shopify_products', status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  let processed = 0
  let created = 0
  let updated = 0
  let after: string | null = null
  let hasNext = true

  try {
    interface ShopifyProductsResponse {
      products: {
        edges: { node: Record<string, unknown>; cursor: string }[]
        pageInfo: { hasNextPage: boolean }
      }
    }

    while (hasNext) {
      const data: ShopifyProductsResponse = await shopifyGraphQL(PRODUCTS_QUERY, { first: 50, after })

      for (const { node: product, cursor } of data.products.edges) {
        after = cursor
        processed++

        const shopifyProductId = extractIdFromGid(product.id as string)
        const variants = ((product.variants as Record<string, { node: Record<string, unknown> }[]>).edges || [])
        const images = ((product.images as Record<string, { node: Record<string, string> }[]>).edges || [])
          .map((e: { node: Record<string, string> }) => ({
            url: e.node.url,
            alt: e.node.altText || '',
          }))

        for (const variantEdge of variants) {
          const variant = variantEdge.node
          const variantId = extractIdFromGid(variant.id as string)

          const productData = {
            shopify_product_id: shopifyProductId,
            shopify_variant_id: variantId,
            title: variants.length > 1
              ? `${product.title} - ${variant.title}`
              : product.title as string,
            description: product.descriptionHtml as string || null,
            sku: variant.sku as string || null,
            barcode: variant.barcode as string || null,
            price: parseFloat(variant.price as string),
            compare_at_price: variant.compareAtPrice
              ? parseFloat(variant.compareAtPrice as string)
              : null,
            category: product.productType as string || null,
            tags: product.tags as string[],
            images,
            inventory_quantity: variant.inventoryQuantity as number || 0,
            weight: null,
            status: (product.status as string).toLowerCase(),
            shopify_data: product,
            last_synced_at: new Date().toISOString(),
          }

          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('shopify_product_id', shopifyProductId)
            .maybeSingle()

          if (existing) {
            await supabase.from('products').update(productData).eq('id', existing.id)
            updated++
          } else {
            await supabase.from('products').insert(productData)
            created++
          }
        }
      }

      hasNext = data.products.pageInfo.hasNextPage
    }

    await supabase.from('sync_logs').update({
      status: 'completed',
      records_processed: processed,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    return { processed, created, updated }
  } catch (error) {
    await supabase.from('sync_logs').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      records_processed: processed,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)
    throw error
  }
}
