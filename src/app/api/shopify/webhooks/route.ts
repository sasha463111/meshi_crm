import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncOrders } from '@/lib/shopify/sync-orders'
import { cancelPendingForPhone } from '@/lib/whatsapp/flow'
import { sendVipInviteOnce } from '@/lib/whatsapp/vip-invite'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')

  if (!hmac || !topic) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
  }

  // Verify HMAC
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')

  if (hash !== hmac) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const supabase = createAdminClient()

  switch (topic) {
    case 'orders/create':
    case 'orders/updated':
    case 'orders/paid':
    case 'orders/fulfilled':
    case 'orders/cancelled': {
      // Trigger an incremental sync for the last 10 minutes — this will upsert
      // the specific order (and any other recent ones) without losing supplier_id
      // or internal_status. Runs in background so webhook returns fast.
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      syncOrders(since).catch((err) => console.error('Webhook sync error:', err))

      // Customer completed a purchase → cancel any pending abandoned-cart reminders.
      if (topic === 'orders/create' || topic === 'orders/paid') {
        try {
          const order = JSON.parse(body)
          const phone =
            order?.phone ||
            order?.customer?.phone ||
            order?.shipping_address?.phone ||
            order?.billing_address?.phone
          if (phone) {
            cancelPendingForPhone(phone, 'abandoned_cart').catch(() => {})

            // Fire VIP-group invite (de-duplicated per phone, ever).
            // Delay 2 min so the order-confirmation lands first.
            const customerName =
              order?.customer?.first_name ||
              order?.shipping_address?.first_name ||
              order?.billing_address?.first_name ||
              ''
            setTimeout(() => {
              sendVipInviteOnce(phone, customerName).catch((e) =>
                console.error('VIP invite error:', e),
              )
            }, 2 * 60 * 1000)
          }
        } catch {
          /* ignore parse errors */
        }
      }

      await supabase.from('sync_logs').insert({
        source: `shopify_webhook_${topic}`,
        status: 'completed',
        records_processed: 1,
        triggered_by: 'webhook',
      })
      break
    }
    case 'products/update':
    case 'products/create': {
      await supabase.from('sync_logs').insert({
        source: `shopify_webhook_${topic}`,
        status: 'completed',
        records_processed: 1,
        triggered_by: 'webhook',
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
