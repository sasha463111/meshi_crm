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

// POST: supplier REQUESTS to add or remove a single variant (size) — pending approval
// body: { action: 'add' | 'delete', variantId?, variant_title?, size?, price? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { action } = body as { action: 'add' | 'delete' }

  const supabase = createAdminClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, shopify_product_id, title, images')
    .eq('id', id)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const image = (product.images as Array<{ url: string }> | null)?.[0]?.url || null

  let crAction: string
  let payload: Record<string, unknown>

  if (action === 'delete') {
    const { variantId, variant_title } = body as { variantId: string; variant_title?: string }
    if (!variantId) return NextResponse.json({ error: 'variantId required' }, { status: 400 })
    crAction = 'remove_variant'
    payload = { variantId, variant_title: variant_title || '' }
  } else if (action === 'add') {
    const { size, price } = body as { size: string; price: number }
    if (!size?.trim()) return NextResponse.json({ error: 'size required' }, { status: 400 })
    crAction = 'add_variant'
    payload = { size: size.trim(), price: price || 0 }
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.from('product_change_requests').insert({
    supplier_id: supplierId,
    product_id: id,
    shopify_product_id: product.shopify_product_id,
    product_title: product.title,
    product_image: image,
    action: crAction,
    payload,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, pending: true })
}
