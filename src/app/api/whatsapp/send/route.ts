import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { phone, message, orderId, templateName } = await request.json()

    if (!phone || !message) {
      return NextResponse.json({ error: 'Phone and message required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Log the message
    const { data: msgLog } = await supabase.from('whatsapp_messages').insert({
      direction: 'outbound',
      phone_number: phone,
      message_type: templateName ? 'template' : 'manual',
      content: message,
      template_name: templateName || null,
      status: 'sending',
      order_id: orderId || null,
    }).select().single()

    try {
      const result = await sendWhatsAppMessage(phone, message)

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

      return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
