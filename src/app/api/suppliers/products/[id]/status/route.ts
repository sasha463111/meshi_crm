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

// POST: supplier REQUESTS to activate/deactivate a product (pending admin approval)
// body: { active: boolean }
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
    .select('id, shopify_product_id, title, images')
    .eq('id', id)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const image = (product.images as Array<{ url: string }> | null)?.[0]?.url || null

  // Prevent duplicate pending request of same action
  const { data: existing } = await supabase
    .from('product_change_requests')
    .select('id')
    .eq('product_id', id)
    .eq('action', active ? 'activate' : 'deactivate')
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ success: true, alreadyPending: true })
  }

  const { error } = await supabase.from('product_change_requests').insert({
    supplier_id: supplierId,
    product_id: id,
    shopify_product_id: product.shopify_product_id,
    product_title: product.title,
    product_image: image,
    action: active ? 'activate' : 'deactivate',
    payload: {},
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, pending: true })
}
