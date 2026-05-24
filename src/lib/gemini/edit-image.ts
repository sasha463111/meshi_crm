import { createAdminClient } from '@/lib/supabase/admin'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

export type ImageEditAction = 'clean_text' | 'clean_background' | 'enhance' | 'white_background'

export const IMAGE_EDIT_PROMPTS: Record<ImageEditAction, string> = {
  clean_text:
    'Remove ALL text, words, logos, price tags, brochures, magazines, booklets, lookbooks and printed papers from this image. Remove every object on the floor and the bed that is not the bedding set itself. Keep ONLY the bed with its sheets, duvet and pillows in a clean modern bedroom. Professional ecommerce product photo, no text anywhere. Output the edited image.',
  clean_background:
    'Generate an edited version of this image: keep the bedding product (sheets, pillows, duvet) PIXEL-PERFECT identical — same pattern, print, texture, colors and shape — but place it in a clean, modern, minimalist bedroom interior with soft neutral walls and warm natural lighting, professional ecommerce product photography. Preserve and enhance the fabric detail and sharpness, highest image quality, no blur. Remove any text, watermarks, brochures or foreign objects. Output the edited image.',
  enhance:
    'Edit this product photo: enhance the lighting to be bright and clean, increase sharpness and detail, boost colors naturally, and remove any text, watermarks, brochures or price tags. Keep the bedding product the same. Professional studio-quality ecommerce photo. Output the edited image.',
  white_background:
    'Place this exact bedding set (duvet, sheets and pillows) on a solid background of color #EAE9E6 (soft warm light grey-beige), like a high-end professional ecommerce catalog product photo. Remove the room, furniture, floor, walls and all text. Keep the bedding product PIXEL-PERFECT identical — do not alter its pattern, print, texture, fabric weave, colors or shape in any way. Preserve and enhance the fabric detail and sharpness so it looks crisp and high resolution. Neatly arrange the bedding centered, with soft even studio lighting and a subtle natural shadow. The entire background must be the solid color #EAE9E6. Highest possible image quality, no blur, no artifacts. Output the edited image.',
}

/**
 * Edits a product image with Gemini and uploads the result to Supabase storage.
 * Returns the public URL of the edited image, or null if the model produced no image.
 * Throws on hard failures (no key, API/HTTP error, upload error).
 */
export async function editProductImage(
  imageUrl: string,
  action: ImageEditAction,
  supplierId: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  // Download source image
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error('Failed to fetch input image')
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
  const imgBase64 = imgBuffer.toString('base64')
  const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'

  // Call Gemini
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: IMAGE_EDIT_PROMPTS[action] },
              { inline_data: { mime_type: mimeType, data: imgBase64 } },
            ],
          },
        ],
      }),
    }
  )

  if (!geminiRes.ok) {
    throw new Error(`Gemini error ${geminiRes.status}: ${(await geminiRes.text()).slice(0, 200)}`)
  }

  const geminiData = await geminiRes.json()
  const parts = geminiData.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData)
  const inlineData = imagePart?.inline_data || imagePart?.inlineData

  if (!inlineData?.data) {
    // Model declined to produce an image (e.g. nothing to clean)
    return null
  }

  // Upload edited image
  const supabase = createAdminClient()
  const outMime = inlineData.mime_type || inlineData.mimeType || 'image/png'
  const ext = outMime.split('/')[1] || 'png'
  const path = `${supplierId}/edited-${Date.now()}-${action}-${Math.random().toString(36).slice(2, 6)}.${ext}`
  const editedBuffer = Buffer.from(inlineData.data, 'base64')

  const { error: uploadErr } = await supabase.storage
    .from('product-submissions')
    .upload(path, editedBuffer, { contentType: outMime, upsert: false })
  if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

  return supabase.storage.from('product-submissions').getPublicUrl(path).data.publicUrl
}
