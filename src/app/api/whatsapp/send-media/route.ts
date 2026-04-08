import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1)
  }
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }
  return cleaned
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const phone = formData.get('phone') as string
    const file = formData.get('file') as File

    if (!phone || !file) {
      return NextResponse.json({ error: 'Phone and file required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const normalizedPhone = normalizePhone(phone)

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    // Determine media type
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isDocument = !isImage && !isVideo

    let endpoint: string
    let body: Record<string, unknown>

    if (isImage) {
      endpoint = `${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`
      body = {
        number: normalizedPhone,
        mediatype: 'image',
        mimetype: file.type,
        caption: '',
        media: `data:${file.type};base64,${base64}`,
        fileName: file.name,
      }
    } else if (isVideo) {
      endpoint = `${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`
      body = {
        number: normalizedPhone,
        mediatype: 'video',
        mimetype: file.type,
        caption: '',
        media: `data:${file.type};base64,${base64}`,
        fileName: file.name,
      }
    } else {
      endpoint = `${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`
      body = {
        number: normalizedPhone,
        mediatype: 'document',
        mimetype: file.type || 'application/octet-stream',
        media: `data:${file.type || 'application/octet-stream'};base64,${base64}`,
        fileName: file.name,
      }
    }

    // Log the message
    const { data: msgLog } = await supabase.from('whatsapp_messages').insert({
      direction: 'outbound',
      phone_number: normalizedPhone,
      message_type: isImage ? 'image' : isDocument ? 'document' : 'video',
      content: isImage ? `[תמונה] ${file.name}` : isDocument ? `[מסמך] ${file.name}` : `[וידאו] ${file.name}`,
      status: 'sending',
    }).select().single()

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_KEY,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = await res.text()
        throw new Error(`Evolution API error: ${error}`)
      }

      const result = await res.json()

      await supabase.from('whatsapp_messages').update({
        status: 'sent',
        evolution_message_id: result?.key?.id || null,
        sent_at: new Date().toISOString(),
      }).eq('id', msgLog!.id)

      return NextResponse.json({ success: true, messageId: msgLog!.id })
    } catch (error) {
      await supabase.from('whatsapp_messages').update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).eq('id', msgLog!.id)

      return NextResponse.json({ error: 'Failed to send media' }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
