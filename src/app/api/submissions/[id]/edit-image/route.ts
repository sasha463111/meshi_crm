import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN

type Action = 'clean_text' | 'clean_background' | 'enhance'

const PROMPTS: Record<Action, string> = {
  clean_text:
    'Remove all text, watermarks, logos, price tags, and writing from this image. Keep the product and scene exactly as they are, just remove any text or graphic overlays. Preserve the original lighting, colors, and composition.',
  clean_background:
    'Replace the background with a clean, minimalist modern bedroom interior. Keep the bedding product (sheets, pillows, duvet) exactly as shown. Remove any text, watermarks, or foreign objects. Professional product photography style, soft natural lighting.',
  enhance:
    'Enhance this product photograph: improve lighting, increase sharpness, boost colors naturally, remove any text or watermarks. Keep the product and composition exactly the same. Professional ecommerce product photo.',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: 'REPLICATE_API_TOKEN not configured. Add it to Vercel env vars.' },
      { status: 500 }
    )
  }

  const { id } = await params
  const { imageUrl, action } = (await request.json()) as {
    imageUrl: string
    action: Action
  }

  if (!imageUrl || !PROMPTS[action]) {
    return NextResponse.json({ error: 'imageUrl and valid action required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify submission exists and imageUrl belongs to it
  const { data: submission } = await supabase
    .from('product_submissions')
    .select('supplier_id, image_urls')
    .eq('id', id)
    .single()

  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (!submission.image_urls?.includes(imageUrl)) {
    return NextResponse.json({ error: 'Image not part of this submission' }, { status: 400 })
  }

  try {
    // Call Replicate — using flux-kontext-pro (instruction-based image editing)
    const prediction = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60', // Wait up to 60s for completion
      },
      body: JSON.stringify({
        input: {
          prompt: PROMPTS[action],
          input_image: imageUrl,
          output_format: 'jpg',
          safety_tolerance: 2,
        },
      }),
    })

    if (!prediction.ok) {
      const err = await prediction.text()
      console.error('Replicate error:', err)
      return NextResponse.json({ error: 'Image edit failed', details: err }, { status: 500 })
    }

    const result = await prediction.json()

    // If still processing, poll until done
    let finalUrl: string | null = null
    if (result.status === 'succeeded') {
      finalUrl = Array.isArray(result.output) ? result.output[0] : result.output
    } else if (result.status === 'processing' || result.status === 'starting') {
      // Poll up to 60 more seconds
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const pollRes = await fetch(result.urls.get, {
          headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        })
        const pollData = await pollRes.json()
        if (pollData.status === 'succeeded') {
          finalUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output
          break
        }
        if (pollData.status === 'failed') {
          return NextResponse.json({ error: 'Replicate prediction failed', details: pollData.error }, { status: 500 })
        }
      }
    } else if (result.status === 'failed') {
      return NextResponse.json({ error: 'Replicate failed', details: result.error }, { status: 500 })
    }

    if (!finalUrl) {
      return NextResponse.json({ error: 'Image edit timed out' }, { status: 504 })
    }

    // Download the edited image and upload to our storage
    const imgRes = await fetch(finalUrl)
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Failed to download edited image' }, { status: 500 })
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const path = `${submission.supplier_id}/edited-${Date.now()}-${action}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from('product-submissions')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: false })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('product-submissions')
      .getPublicUrl(path)
    const editedUrl = urlData.publicUrl

    // Add edited URL to submission's image_urls
    const updatedUrls = [...(submission.image_urls || []), editedUrl]
    await supabase
      .from('product_submissions')
      .update({ image_urls: updatedUrls })
      .eq('id', id)

    return NextResponse.json({ success: true, editedUrl })
  } catch (error) {
    console.error('Edit image error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    )
  }
}
