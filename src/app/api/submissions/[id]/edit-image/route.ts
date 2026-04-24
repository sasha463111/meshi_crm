import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

type Action = 'clean_text' | 'clean_background' | 'enhance'

const PROMPTS: Record<Action, string> = {
  clean_text:
    'Remove all text, watermarks, logos, price tags, writing, and any graphic overlays from this image. Keep the product (bedding, sheets, pillows, etc.) and the scene exactly as they are — do not change the product, composition, lighting, or colors. Only remove text and overlays.',
  clean_background:
    'Edit this image: keep the bedding product (sheets, pillows, duvet cover) exactly as is, but replace the background with a clean, modern, minimalist bedroom interior — soft neutral walls, warm natural lighting, professional ecommerce product photography style. Remove any text, watermarks, price tags, or foreign objects. The product itself must not change.',
  enhance:
    'Enhance this product photograph for ecommerce: improve lighting to be bright and clean, increase sharpness and detail, boost colors naturally to be vibrant but realistic, remove any text, watermarks, or price tags. Keep the product and composition exactly the same. Professional studio-quality output.',
}

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY not configured' },
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

  // Verify submission
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
    // Download the input image and convert to base64
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch input image' }, { status: 500 })
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    const imgBase64 = imgBuffer.toString('base64')
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'

    // Call Gemini 2.5 Flash Image for editing
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPTS[action] },
                { inline_data: { mime_type: mimeType, data: imgBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE'],
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', errText)
      return NextResponse.json(
        { error: 'Gemini image edit failed', details: errText },
        { status: 500 }
      )
    }

    const geminiData = await geminiRes.json()

    // Extract image data from response
    const parts = geminiData.candidates?.[0]?.content?.parts || []
    const imagePart = parts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
    const inlineData = imagePart?.inline_data || imagePart?.inlineData

    if (!inlineData?.data) {
      console.error('Gemini returned no image:', JSON.stringify(geminiData).slice(0, 500))
      return NextResponse.json(
        { error: 'Gemini did not return an image', response: geminiData },
        { status: 500 }
      )
    }

    // Upload the edited image to Supabase Storage
    const editedBuffer = Buffer.from(inlineData.data, 'base64')
    const outMime = inlineData.mime_type || inlineData.mimeType || 'image/png'
    const ext = outMime.split('/')[1] || 'png'
    const path = `${submission.supplier_id}/edited-${Date.now()}-${action}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('product-submissions')
      .upload(path, editedBuffer, { contentType: outMime, upsert: false })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('product-submissions')
      .getPublicUrl(path)
    const editedUrl = urlData.publicUrl

    // Add to submission's image_urls
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
