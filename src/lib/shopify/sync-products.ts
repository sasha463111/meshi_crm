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
          publishedAt
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
                availableForSale
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
  const seenProductIds = new Set<string>()

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
        seenProductIds.add(shopifyProductId)
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

    // Shopify's products query excludes ARCHIVED products. Any product in our DB
    // that wasn't returned (and isn't already archived) has been archived/deleted
    // in Shopify — mark it archived so it stops showing as available.
    let archived = 0
    if (seenProductIds.size > 0) {
      const { data: dbProducts } = await supabase
        .from('products')
        .select('id, shopify_product_id, status')
        .neq('status', 'archived')

      const staleIds = (dbProducts || [])
        .filter((p) => !seenProductIds.has(p.shopify_product_id))
        .map((p) => p.id)

      for (let i = 0; i < staleIds.length; i += 100) {
        const batch = staleIds.slice(i, i + 100)
        await supabase.from('products').update({ status: 'archived' }).in('id', batch)
        archived += batch.length
      }
    }

    await supabase.from('sync_logs').update({
      status: 'completed',
      records_processed: processed,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    return { processed, created, updated, archived }
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
