import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { editProductImage, type ImageEditAction } from '@/lib/gemini/edit-image'

export const maxDuration = 60

async function verifySupplier() {
  // Admin endpoint (no supplier token needed); kept simple.
  return true
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void verifySupplier
  const { id } = await params
  const { imageUrl, action } = (await request.json()) as {
    imageUrl: string
    action: ImageEditAction
  }

  const validActions: ImageEditAction[] = ['clean_text', 'clean_background', 'enhance', 'white_background']
  if (!imageUrl || !validActions.includes(action)) {
    return NextResponse.json({ error: 'imageUrl and valid action required' }, { status: 400 })
  }

  const supabase = createAdminClient()
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
    const editedUrl = await editProductImage(imageUrl, action, submission.supplier_id)
    if (!editedUrl) {
      return NextResponse.json(
        { error: 'המודל לא יצר תמונה. נסה שוב או פעולה אחרת.' },
        { status: 500 }
      )
    }

    const updatedUrls = [...(submission.image_urls || []), editedUrl]
    await supabase.from('product_submissions').update({ image_urls: updatedUrls }).eq('id', id)

    return NextResponse.json({ success: true, editedUrl })
  } catch (error) {
    console.error('Edit image error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    )
  }
}
