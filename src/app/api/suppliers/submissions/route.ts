import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Verify supplier token
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

// GET: list this supplier's submissions
export async function GET(request: NextRequest) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('product_submissions')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ submissions: data || [] })
}

// POST: create a new submission. Body is multipart/form-data with fields + image files.
export async function POST(request: NextRequest) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const title = formData.get('title') as string
    const description = (formData.get('description') as string) || null
    const price = formData.get('price') ? Number(formData.get('price')) : null
    const costPrice = formData.get('cost_price') ? Number(formData.get('cost_price')) : null
    const sku = (formData.get('sku') as string) || null
    const notes = (formData.get('notes') as string) || null
    const variantsJson = formData.get('variants') as string | null
    const variants = variantsJson ? JSON.parse(variantsJson) : []

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Upload images to storage
    const imageFiles = formData.getAll('images') as File[]
    const imageUrls: string[] = []

    for (const file of imageFiles) {
      if (!file || typeof file === 'string') continue
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${supplierId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadErr } = await supabase.storage
        .from('product-submissions')
        .upload(path, buffer, { contentType: file.type, upsert: false })
      if (uploadErr) {
        console.error('Upload error:', uploadErr)
        continue
      }
      const { data: urlData } = supabase.storage
        .from('product-submissions')
        .getPublicUrl(path)
      imageUrls.push(urlData.publicUrl)
    }

    // Insert submission
    const { data: submission, error } = await supabase
      .from('product_submissions')
      .insert({
        supplier_id: supplierId,
        title,
        description,
        price,
        cost_price: costPrice,
        sku,
        variants,
        image_urls: imageUrls,
        notes,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Insert submission error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, submission })
  } catch (error) {
    console.error('Submission error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Submission failed' },
      { status: 500 }
    )
  }
}
