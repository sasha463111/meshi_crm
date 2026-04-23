import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createShopifyProduct } from '@/lib/shopify/create-product'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Get submission
  const { data: submission, error: getErr } = await supabase
    .from('product_submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (getErr || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (submission.status !== 'pending') {
    return NextResponse.json({ error: `Already ${submission.status}` }, { status: 400 })
  }

  try {
    // Create product in Shopify
    const { shopifyProductId } = await createShopifyProduct({
      title: submission.title,
      description: submission.description,
      price: submission.price,
      sku: submission.sku,
      variants: submission.variants,
      imageUrls: submission.image_urls,
    })

    // Also insert product into our DB linked to supplier
    await supabase.from('products').insert({
      shopify_product_id: shopifyProductId,
      title: submission.title,
      description: submission.description,
      price: submission.price,
      cost_price: submission.cost_price,
      sku: submission.sku,
      supplier_id: submission.supplier_id,
      images: (submission.image_urls || []).map((url: string) => ({ url, alt: submission.title })),
      status: 'draft',
    })

    // Mark submission approved
    await supabase
      .from('product_submissions')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        shopify_product_id: shopifyProductId,
      })
      .eq('id', id)

    return NextResponse.json({ success: true, shopifyProductId })
  } catch (error) {
    console.error('Approve submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create product in Shopify' },
      { status: 500 }
    )
  }
}
