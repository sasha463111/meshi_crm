import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setShopifyProductStatus } from '@/lib/shopify/archive-product'

// POST: admin processes a removal request.
// action: 'archive' = remove from store (archive in Shopify) | 'dismiss' = clear the flag, keep product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action } = (await request.json()) as { action: 'archive' | 'dismiss' }

  const supabase = createAdminClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, shopify_product_id')
    .eq('id', id)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  try {
    if (action === 'archive') {
      // Archive in Shopify — removes from store but keeps record
      await setShopifyProductStatus(product.shopify_product_id, 'ARCHIVED')
      await supabase
        .from('products')
        .update({
          status: 'archived',
          removal_requested: false,
          removal_requested_at: null,
          removal_requested_by: null,
          removal_reason: null,
        })
        .eq('id', id)
    } else {
      // Dismiss the flag, keep product active
      await supabase
        .from('products')
        .update({
          removal_requested: false,
          removal_requested_at: null,
          removal_requested_by: null,
          removal_reason: null,
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Process removal error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
