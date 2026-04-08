import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    // Handle incoming messages from Evolution
    if (body.event === 'messages.upsert') {
      const msg = body.data?.message
      if (!msg) return NextResponse.json({ received: true })

      const phone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || ''
      const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

      if (phone && content) {
        await supabase.from('whatsapp_messages').insert({
          direction: 'inbound',
          phone_number: phone,
          message_type: 'text',
          content,
          status: 'received',
          evolution_message_id: msg.key?.id || null,
        })

        // Simple chatbot: check if they're asking about order status
        if (content.includes('הזמנה') || content.includes('מעקב') || content.includes('סטטוס')) {
          // Try to find their order by phone
          const { data: orders } = await supabase
            .from('orders')
            .select('shopify_order_number, status, tracking_number')
            .eq('customer_phone', phone)
            .order('order_date', { ascending: false })
            .limit(1)

          if (orders?.length) {
            const order = orders[0]
            const statusLabels: Record<string, string> = {
              pending: 'ממתין לטיפול',
              paid: 'שולם - בהכנה',
              fulfilled: 'נשלח',
              refunded: 'הוחזר',
            }
            let reply = `הזמנה ${order.shopify_order_number}: ${statusLabels[order.status] || order.status}`
            if (order.tracking_number) {
              reply += `\nמספר מעקב: ${order.tracking_number}`
            }

            const { sendWhatsAppMessage } = await import('@/lib/whatsapp/client')
            await sendWhatsAppMessage(phone, reply)
          }
        }
      }
    }

    // Handle message status updates
    if (body.event === 'messages.update') {
      const updates = body.data
      if (Array.isArray(updates)) {
        for (const update of updates) {
          const msgId = update.key?.id
          const status = update.update?.status
          if (msgId && status) {
            const statusMap: Record<number, string> = {
              2: 'sent',
              3: 'delivered',
              4: 'read',
            }
            const mappedStatus = statusMap[status]
            if (mappedStatus) {
              await supabase.from('whatsapp_messages')
                .update({
                  status: mappedStatus,
                  ...(mappedStatus === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
                  ...(mappedStatus === 'read' ? { read_at: new Date().toISOString() } : {}),
                })
                .eq('evolution_message_id', msgId)
            }
          }
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ received: true })
  }
}
