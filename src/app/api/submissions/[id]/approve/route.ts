import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createShopifyProduct, type CreateProductInput } from '@/lib/shopify/create-product'
import { editProductImage } from '@/lib/gemini/edit-image'

// Auto image generation (2 Gemini calls) + Shopify create can take ~30s
export const maxDuration = 60

interface ApprovePayload {
  title?: string
  description?: string
  price?: number | null
  compare_at_price?: number | null
  sku?: string | null
  product_type?: string | null
  category?: string | null
  vendor?: string | null
  tags?: string[]
  variants?: Array<{ title: string; inventory?: number; price?: number | null; sku?: string | null }>
  image_urls?: string[] // Selected images (subset of submission's images)
  status?: 'ACTIVE' | 'DRAFT'
  auto_images?: boolean // default true: auto-generate cream + room bg from first image
}

export async function POST(
  request: NextRequest,
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

  // Parse payload — admin may send full listing data; fall back to submission fields
  let payload: ApprovePayload = {}
  try {
    payload = await request.json()
  } catch {
    // Empty body — use submission fields
  }

  try {
    const selectedImages = payload.image_urls ?? submission.image_urls ?? []

    // Auto-generate cream(#F4F3EF) + room background versions from the first image,
    // and put them first (the cream studio shot becomes the main product image).
    let finalImages = [...selectedImages]
    const autoImages = payload.auto_images !== false
    if (autoImages && selectedImages.length > 0) {
      const sourceImage = selectedImages[0]
      const generated: string[] = []
      try {
        const cream = await editProductImage(sourceImage, 'white_background', submission.supplier_id)
        if (cream) generated.push(cream)
      } catch (e) {
        console.error('Auto cream-bg failed:', e)
      }
      try {
        const room = await editProductImage(sourceImage, 'clean_background', submission.supplier_id)
        if (room) generated.push(room)
      } catch (e) {
        console.error('Auto room-bg failed:', e)
      }
      if (generated.length > 0) {
        // Persist the new images onto the submission too
        await supabase
          .from('product_submissions')
          .update({ image_urls: [...(submission.image_urls || []), ...generated] })
          .eq('id', id)
        finalImages = [...generated, ...selectedImages]
      }
    }

    const input: CreateProductInput = {
      title: payload.title || submission.title,
      description: payload.description || submission.description || '',
      price: payload.price ?? submission.price ?? null,
      compareAtPrice: payload.compare_at_price ?? null,
      sku: payload.sku ?? submission.sku ?? null,
      productType: payload.product_type || null,
      category: payload.category || null,
      vendor: payload.vendor || 'משי טקסטיל',
      tags: payload.tags || [],
      variants: payload.variants ?? submission.variants ?? [],
      imageUrls: finalImages,
      status: payload.status || 'ACTIVE',
    }

    // Create product in Shopify
    const { shopifyProductId } = await createShopifyProduct(input)

    // Insert product into our DB linked to supplier
    await supabase.from('products').insert({
      shopify_product_id: shopifyProductId,
      title: input.title,
      description: input.description,
      price: input.price,
      cost_price: submission.cost_price,
      sku: input.sku,
      supplier_id: submission.supplier_id,
      product_type: input.productType,
      category: input.category,
      tags: input.tags,
      images: (input.imageUrls || []).map((url: string) => ({ url, alt: input.title })),
      status: input.status === 'ACTIVE' ? 'active' : 'draft',
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
