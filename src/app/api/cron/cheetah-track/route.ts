import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getShipmentStatus, isInTransit, type CheetahShipmentStatus } from '@/lib/cheetah/client'
import { enqueueJob, normalizeIlPhone } from '@/lib/whatsapp/flow'

export const maxDuration = 60

function authorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

/**
 * Polls Cheetah for every order that has a cheetah_ship_no but hasn't yet
 * sent a "delivered + feedback" WhatsApp.
 *
 * For each shipment:
 *  1) Fetch live status via ship_status_xml.
 *  2) Update cached status fields on the order.
 *  3) If we've never sent the "tracking" message and the shipment is in
 *     transit (driver assigned OR stage >= 7) → enqueue order_update step 3
 *     with the random_id / ship_no as the tracking reference.
 *  4) If the shipment is delivered (ship_delivered_yn=y) → enqueue
 *     order_update step 4 (feedback request) and stop polling this order.
 *
 * Dedup keys ensure each customer gets at most one tracking message and one
 * delivered message per order, even if the cron runs many times.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, shopify_order_id, shopify_order_number, customer_name, customer_phone, shipping_address, cheetah_ship_no, cheetah_status_code, tracking_msg_sent_at, delivered_msg_sent_at'
    )
    .not('cheetah_ship_no', 'is', null)
    .is('delivered_msg_sent_at', null)
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fallbackTracking =
    'היי {שם} 🚚\nההזמנה שלך {הזמנה} בדרך אליך!\n\nמספר מעקב צ׳יטה: {מעקב}\n\nנעדכן אותך שוב ברגע שתגיע 💚\n\nמשי טקסטיל'
  const fallbackDelivered =
    'היי {שם} 💚\nראינו שההזמנה שלך {הזמנה} הגיעה אליך 🎉\n\nנשמח לשמוע איך המוצרים — נוחים? נעימים למגע?\nהדעת שלך חשובה לנו ✨\n\nתודה שבחרת בנו,\nמשי טקסטיל'

  const { data: tmpls } = await supabase
    .from('whatsapp_flow_templates')
    .select('step, content')
    .eq('flow', 'order_update')
    .in('step', [3, 4])

  const tmplByStep = new Map<number, string>()
  for (const t of tmpls || []) tmplByStep.set(t.step as number, (t.content as string) || '')

  type SummaryRow = {
    orderNumber: string | null
    shipNo: string | null
    stage?: number
    inTransit?: boolean
    delivered?: boolean
    trackingEnqueued?: boolean
    deliveredEnqueued?: boolean
    error?: string
  }

  const summary: SummaryRow[] = []
  let polled = 0
  let trackingSent = 0
  let deliveredSent = 0

  for (const order of orders || []) {
    const row: SummaryRow = {
      orderNumber: (order.shopify_order_number as string) || null,
      shipNo: (order.cheetah_ship_no as string) || null,
    }

    try {
      const status: CheetahShipmentStatus | null = await getShipmentStatus(order.cheetah_ship_no as string)
      polled++
      if (!status) {
        row.error = 'no_status'
        summary.push(row)
        continue
      }
      row.stage = status.currentStageCode
      row.inTransit = isInTransit(status)
      row.delivered = status.delivered

      // Cache the latest status snapshot
      await supabase
        .from('orders')
        .update({
          cheetah_status_code: status.currentStageCode,
          cheetah_status_desc: status.currentStageDesc,
          cheetah_random_id: status.randomId,
          cheetah_last_polled_at: new Date().toISOString(),
        })
        .eq('id', order.id)

      // Resolve phone (customer_phone first, then shipping_address.phone)
      const shipAddr = order.shipping_address as Record<string, string> | null
      const rawPhone = (order.customer_phone as string) || shipAddr?.phone || null
      const phone = normalizeIlPhone(rawPhone)
      if (!phone) {
        row.error = 'no_phone'
        summary.push(row)
        continue
      }

      const firstName = ((order.customer_name as string) || '').trim().split(' ')[0] || ''
      const orderNum = (order.shopify_order_number as string) || ''
      const trackingRef = status.randomId || status.shipNo
      const gid = `gid://shopify/Order/${order.shopify_order_id}`

      // STEP 3 — tracking message (sent once, when in-transit and no msg sent yet)
      if (!order.tracking_msg_sent_at && isInTransit(status)) {
        const template = tmplByStep.get(3) || fallbackTracking
        const content = template
          .replace(/\{שם\}/g, firstName)
          .replace(/\{name\}/g, firstName)
          .replace(/\{הזמנה\}/g, orderNum)
          .replace(/\{order\}/g, orderNum)
          .replace(/\{מעקב\}/g, trackingRef)
          .replace(/\{tracking\}/g, trackingRef)
          .replace(/ {2,}/g, ' ')
          .trim()
        await enqueueJob({
          flow: 'order_update',
          step: 3,
          phone,
          content,
          scheduledAt: new Date(),
          refType: 'order',
          refId: gid,
          dedupKey: `ou:track:${gid}`,
        })
        await supabase
          .from('orders')
          .update({ tracking_msg_sent_at: new Date().toISOString() })
          .eq('id', order.id)
        trackingSent++
        row.trackingEnqueued = true
      }

      // STEP 4 — delivered + feedback request (final, stops further polling)
      if (status.delivered) {
        const template = tmplByStep.get(4) || fallbackDelivered
        const content = template
          .replace(/\{שם\}/g, firstName)
          .replace(/\{name\}/g, firstName)
          .replace(/\{הזמנה\}/g, orderNum)
          .replace(/\{order\}/g, orderNum)
          .replace(/ {2,}/g, ' ')
          .trim()
        await enqueueJob({
          flow: 'order_update',
          step: 4,
          phone,
          content,
          scheduledAt: new Date(),
          refType: 'order',
          refId: gid,
          dedupKey: `ou:delivered:${gid}`,
        })
        await supabase
          .from('orders')
          .update({ delivered_msg_sent_at: new Date().toISOString() })
          .eq('id', order.id)
        deliveredSent++
        row.deliveredEnqueued = true
      }
    } catch (err) {
      row.error = err instanceof Error ? err.message : 'unknown'
    }
    summary.push(row)
  }

  return NextResponse.json({
    success: true,
    polled,
    trackingSent,
    deliveredSent,
    total: orders?.length || 0,
    summary,
  })
}

export const GET = POST
