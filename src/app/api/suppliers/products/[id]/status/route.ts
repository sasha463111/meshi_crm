import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setShopifyProductStatus } from '@/lib/shopify/archive-product'

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

// POST: supplier directly activates/deactivates a product (updates Shopify + DB)
// body: { active: boolean }  active=false => DRAFT (removed from store), active=true => ACTIVE
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { active } = (await request.json()) as { active: boolean }

  const supabase = createAdminClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, shopify_product_id')
    .eq('id', id)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  try {
    const newStatus = active ? 'ACTIVE' : 'DRAFT'
    await setShopifyProductStatus(product.shopify_product_id, newStatus)

    await supabase
      .from('products')
      .update({
        status: active ? 'active' : 'draft',
        // clear any legacy removal flags
        removal_requested: false,
        removal_requested_at: null,
        removal_requested_by: null,
        removal_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, status: active ? 'active' : 'draft' })
  } catch (error) {
    console.error('Status toggle error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update status' },
      { status: 500 }
    )
  }
}
