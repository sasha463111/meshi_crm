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

  // Extract variants/sizes from shopify_data
  const result = (products || []).map((p) => {
    const sd = p.shopify_data as Record<string, unknown> | null
    const productType = (sd?.productType as string) || p.category || null
    const variantsRaw = (sd?.variants as { edges?: Array<{ node: ShopifyVariant }> } | undefined)?.edges || []
    const variants = variantsRaw
      .map((e) => e.node)
      .filter((v) => v.title !== 'Default Title')
      .map((v) => ({
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventoryQuantity ?? 0,
      }))

    const images = (p.images as Array<{ url: string }> | null) || []

    return {
      id: p.id,
      shopify_product_id: p.shopify_product_id,
      title: p.title,
      price: p.price,
      status: p.status,
      image: images[0]?.url || null,
      total_inventory: variants.length
        ? variants.reduce((sum, v) => sum + (v.inventory || 0), 0)
        : p.inventory_quantity || 0,
      variants,
      product_type: productType,
      removal_requested: p.removal_requested || false,
      removal_requested_at: p.removal_requested_at,
    }
  })

  return NextResponse.json({ products: result })
}
