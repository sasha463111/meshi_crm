import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setShopifyProductStatus } from '@/lib/shopify/archive-product'
import { deleteProductVariant, addProductVariant } from '@/lib/shopify/manage-variants'

// POST: admin approves or rejects a change request.
// body: { decision: 'approve' | 'reject', reason? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { decision, reason } = (await request.json()) as {
    decision: 'approve' | 'reject'
    reason?: string
  }

  const supabase = createAdminClient()
  const { data: cr } = await supabase
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (!cr) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (cr.status !== 'pending') {
    return NextResponse.json({ error: `Already ${cr.status}` }, { status: 400 })
  }

  if (decision === 'reject') {
    await supabase
      .from('product_change_requests')
      .update({ status: 'rejected', rejection_reason: reason || null, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ success: true })
  }

  // Approve → execute the real Shopify action
  try {
    const payload = (cr.payload || {}) as { variantId?: string; size?: string; price?: number }

    switch (cr.action) {
      case 'deactivate':
        await setShopifyProductStatus(cr.shopify_product_id, 'DRAFT')
        await supabase.from('products').update({ status: 'archived' }).eq('id', cr.product_id)
        break
      case 'activate':
        await setShopifyProductStatus(cr.shopify_product_id, 'ACTIVE')
        await supabase.from('products').update({ status: 'active' }).eq('id', cr.product_id)
        break
      case 'remove_variant':
        if (!payload.variantId) throw new Error('Missing variantId')
        await deleteProductVariant(cr.shopify_product_id, payload.variantId)
        break
      case 'add_variant':
        if (!payload.size) throw new Error('Missing size')
        await addProductVariant(cr.shopify_product_id, payload.size, payload.price || 0, 0)
        break
      default:
        throw new Error('Unknown action')
    }

    await supabase
      .from('product_change_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Approve change request error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply change' },
      { status: 500 }
    )
  }
}
