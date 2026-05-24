import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteProductVariant, addProductVariant } from '@/lib/shopify/manage-variants'

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

// POST: add or remove a single variant (size)
// body: { action: 'add' | 'delete', variantId?, size?, price?, inventory? }
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
    .select('shopify_product_id')
    .eq('id', id)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  try {
    if (action === 'delete') {
      const { variantId } = body as { variantId: string }
      if (!variantId) return NextResponse.json({ error: 'variantId required' }, { status: 400 })
      await deleteProductVariant(product.shopify_product_id, variantId)
    } else if (action === 'add') {
      const { size, price, inventory } = body as { size: string; price: number; inventory: number }
      if (!size?.trim()) return NextResponse.json({ error: 'size required' }, { status: 400 })
      await addProductVariant(product.shopify_product_id, size.trim(), price || 0, inventory || 0)
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Variant management error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
