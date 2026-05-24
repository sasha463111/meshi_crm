import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySupplier(request: NextRequest) {
  const token = request.headers.get('x-supplier-token')
  if (!token) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id')
    .eq('access_token', token)
    .eq('is_active', true)
    .single()
  return data?.id || null
}

interface ShopifyVariant {
  id: string
  title: string
  price: string
  sku: string | null
  inventoryQuantity: number
  compareAtPrice: string | null
  availableForSale?: boolean
}

function variantNumericId(gid: string): string {
  return gid.split('/').pop() || gid
}

// GET: all products available on the store, with their variants/sizes
export async function GET(request: NextRequest) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: products } = await supabase
    .from('products')
    .select('id, shopify_product_id, title, price, status, images, inventory_quantity, shopify_data, removal_requested, removal_requested_at, supplier_id, category')
    .order('title')

  // Pending change requests so the UI can show "ממתין לאישור"
  const { data: pendingReqs } = await supabase
    .from('product_change_requests')
    .select('product_id, action, payload')
    .eq('status', 'pending')

  const pendingByProduct = new Map<string, { action: string; payload: Record<string, unknown> }[]>()
  for (const r of pendingReqs || []) {
    const arr = pendingByProduct.get(r.product_id) || []
    arr.push({ action: r.action, payload: (r.payload || {}) as Record<string, unknown> })
    pendingByProduct.set(r.product_id, arr)
  }

  // Extract variants/sizes from shopify_data
  const result = (products || []).map((p) => {
    const sd = p.shopify_data as Record<string, unknown> | null
    const productType = (sd?.productType as string) || p.category || null
    const publishedAt = (sd?.publishedAt as string) || null
    const variantsRaw = (sd?.variants as { edges?: Array<{ node: ShopifyVariant }> } | undefined)?.edges || []
    const allNodes = variantsRaw.map((e) => e.node)
    const variants = allNodes
      .filter((v) => v.title !== 'Default Title')
      .map((v) => ({
        id: variantNumericId(v.id),
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventoryQuantity ?? 0,
        available_for_sale: v.availableForSale ?? false,
      }))

    // A product is purchasable on the site if any variant is availableForSale
    // (covers "continue selling when out of stock" + untracked inventory)
    const availableForSale = allNodes.some((v) => v.availableForSale)

    const images = (p.images as Array<{ url: string }> | null) || []
    const pending = pendingByProduct.get(p.id) || []
    const pendingActions = pending.map((x) => x.action)
    // variantIds with a pending remove request
    const pendingRemoveVariantIds = pending
      .filter((x) => x.action === 'remove_variant')
      .map((x) => String(x.payload.variantId || ''))
    const pendingAddSizes = pending
      .filter((x) => x.action === 'add_variant')
      .map((x) => String(x.payload.size || ''))

    return {
      id: p.id,
      shopify_product_id: p.shopify_product_id,
      title: p.title,
      price: p.price,
      status: p.status,
      published: !!publishedAt,
      available_for_sale: availableForSale,
      image: images[0]?.url || null,
      total_inventory: variants.length
        ? variants.reduce((sum, v) => sum + (v.inventory || 0), 0)
        : p.inventory_quantity || 0,
      variants,
      product_type: productType,
      removal_requested: p.removal_requested || false,
      removal_requested_at: p.removal_requested_at,
      pending_deactivate: pendingActions.includes('deactivate'),
      pending_activate: pendingActions.includes('activate'),
      pending_remove_variant_ids: pendingRemoveVariantIds,
      pending_add_sizes: pendingAddSizes,
    }
  })

  return NextResponse.json({ products: result })
}
