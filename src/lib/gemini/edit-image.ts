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
    'Professional ecommerce catalog photo of this exact bedding set on a solid #EAE9E6 (soft warm light grey-beige) background. CLOSE-UP framing: the bedding (duvet and pillows) must FILL THE FRAME from edge to edge, extending close to all four sides with only a thin even margin. Center it. Do NOT show large empty background space, do NOT show a bed frame or legs, do NOT make it float in the middle. Just the styled bedding filling the frame. Keep the product PIXEL-PERFECT identical — same pattern, print, texture, colors and shape. Crisp high detail, soft even studio lighting. The background must be solid #EAE9E6. Output the edited image.',
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

  if (!inlineData?.data) {
    // Model declined to produce an image (e.g. nothing to clean)
    return null
  }

  // Normalise to an exact 4:5 frame (1080x1350). For the clean studio shot we
  // auto-crop the uniform #EAE9E6 margins first so the product fills the frame
  // (no floating). Then cover-fit so the frame is always completely filled.
  const rawBuffer = Buffer.from(inlineData.data, 'base64')
  let sourceForFrame: Buffer = rawBuffer
  if (action === 'white_background') {
    sourceForFrame = await autoCropBackground(rawBuffer)
  }
  const editedBuffer = await sharp(sourceForFrame)
    .resize(FRAME_W, FRAME_H, { fit: 'cover', position: 'centre', background: FRAME_BG })
    .jpeg({ quality: 92 })
    .toBuffer()

  // Upload edited image
  const supabase = createAdminClient()
  const path = `${supplierId}/edited-${Date.now()}-${action}-${Math.random().toString(36).slice(2, 6)}.jpg`

  const { error: uploadErr } = await supabase.storage
    .from('product-submissions')
    .upload(path, editedBuffer, { contentType: 'image/jpeg', upsert: false })
  if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

  return supabase.storage.from('product-submissions').getPublicUrl(path).data.publicUrl
}

// Crop away the uniform background margins so the product fills the frame.
// Uses the top-left pixel as the background reference colour.
async function autoCropBackground(buffer: Buffer): Promise<Buffer> {
  try {
    const img = sharp(buffer)
    const meta = await img.metadata()
    const width = meta.width || 0
    const height = meta.height || 0
    if (!width || !height) return buffer

    const raw = await sharp(buffer).removeAlpha().raw().toBuffer() as Buffer
    const ch = 3
    const bg = [raw[0], raw[1], raw[2]]
    const thr = 22
    let minX = width, minY = height, maxX = 0, maxY = 0
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * ch
        const d = Math.abs(raw[i] - bg[0]) + Math.abs(raw[i + 1] - bg[1]) + Math.abs(raw[i + 2] - bg[2])
        if (d > thr) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return buffer // nothing detected
    const pad = Math.round(Math.max(width, height) * 0.02)
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(width, maxX + pad)
    maxY = Math.min(height, maxY + pad)
    return await sharp(buffer)
      .extract({ left: minX, top: minY, width: maxX - minX, height: maxY - minY })
      .toBuffer() as Buffer
  } catch {
    return buffer
  }
}
