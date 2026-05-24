import { createAdminClient } from '@/lib/supabase/admin'
import sharp from 'sharp'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

// Catalog frame is 4:5 portrait. Normalise every output to exactly 1080x1350
// (fit: cover) so it always fills the frame — no white bars ever.
const FRAME_W = 1080
const FRAME_H = 1350
const FRAME_BG = '#EAE9E6'

export type ImageEditAction = 'clean_text' | 'clean_background' | 'enhance' | 'white_background'

export const IMAGE_EDIT_PROMPTS: Record<ImageEditAction, string> = {
  clean_text:
    'Remove ALL text, words, logos, price tags, brochures, magazines, booklets, lookbooks and printed papers from this image. Remove every object on the floor and the bed that is not the bedding set itself. Keep ONLY the bed with its sheets, duvet and pillows in a clean modern bedroom. Professional ecommerce product photo, no text anywhere. Output the edited image.',
  clean_background:
    'Generate an edited version of this image: keep the bedding product (sheets, pillows, duvet) PIXEL-PERFECT identical — same pattern, print, texture, colors and shape — but place it in a clean, modern, minimalist bedroom interior with soft neutral walls and warm natural lighting, professional ecommerce product photography. Preserve and enhance the fabric detail and sharpness, highest image quality, no blur. Remove any text, watermarks, brochures or foreign objects. Output the edited image.',
  enhance:
    'Edit this product photo: enhance the lighting to be bright and clean, increase sharpness and detail, boost colors naturally, and remove any text, watermarks, brochures or price tags. Keep the bedding product the same. Professional studio-quality ecommerce photo. Output the edited image.',
  white_background:
    'Cut out ONLY the bed with its bedding (duvet, pillows and the upholstered bed base/headboard) from this photo and place it on a plain solid #EAE9E6 (warm light grey-beige) background. COMPLETELY REMOVE the room, walls, window, curtains, lamp, nightstand and floor — replace everything around the bed with the solid #EAE9E6 color. The bed must be large and fill the frame, firmly grounded at the bottom (NOT floating). Keep the bedding pattern, print, texture and colors PIXEL-PERFECT identical. Professional ecommerce catalog photo, crisp high detail. Output the edited image.',
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

  // Call Gemini, retrying up to 3x if it returns a white-bordered/framed image
  let rawBuffer: Buffer | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: IMAGE_EDIT_PROMPTS[action] }, { inline_data: { mime_type: mimeType, data: imgBase64 } }] }],
          generationConfig: { imageConfig: { aspectRatio: '4:5' } },
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
    if (!inlineData?.data) continue // no image this time, retry

    const candidate = Buffer.from(inlineData.data, 'base64')
    // reject white-bordered/framed outputs (corner pixel near pure white)
    try {
      const raw = await sharp(candidate).removeAlpha().raw().toBuffer() as Buffer
      if (raw[0] > 245 && raw[1] > 245 && raw[2] > 245) continue
    } catch { /* ignore, accept */ }
    rawBuffer = candidate
    break
  }

  if (!rawBuffer) {
    // Model declined / kept returning framed images
    return null
  }

  // Normalise to an exact 4:5 frame (1080x1350) so it always fits the catalog card.
  const covered = await sharp(rawBuffer)
    .resize(FRAME_W, FRAME_H, { fit: 'cover', position: 'centre', background: FRAME_BG })
    .toBuffer()

  let editedBuffer: Buffer
  if (action === 'white_background') {
    // For the studio shot, shrink to 88% and centre on a #EAE9E6 canvas so every
    // product sits at a uniform distance with an even margin (no floating, no too-close).
    const inner = await sharp(covered)
      .resize(Math.round(FRAME_W * 0.88), Math.round(FRAME_H * 0.88), { fit: 'cover', position: 'centre' })
      .toBuffer()
    editedBuffer = await sharp({ create: { width: FRAME_W, height: FRAME_H, channels: 3, background: FRAME_BG } })
      .composite([{ input: inner, gravity: 'centre' }])
      .jpeg({ quality: 92 })
      .toBuffer() as Buffer
  } else {
    editedBuffer = await sharp(covered).jpeg({ quality: 92 }).toBuffer() as Buffer
  }

  // Upload edited image
  const supabase = createAdminClient()
  const path = `${supplierId}/edited-${Date.now()}-${action}-${Math.random().toString(36).slice(2, 6)}.jpg`

  const { error: uploadErr } = await supabase.storage
    .from('product-submissions')
    .upload(path, editedBuffer, { contentType: 'image/jpeg', upsert: false })
  if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

  return supabase.storage.from('product-submissions').getPublicUrl(path).data.publicUrl
}
