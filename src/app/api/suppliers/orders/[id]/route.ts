import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob, normalizeIlPhone } from '@/lib/whatsapp/flow'

// Verify supplier token and return supplier_id
async function verifySupplier(request: NextRequest) {
  const token = request.headers.get('x-supplier-token')
  if (!token) return null

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id')
    .eq('access_token', token)
    .eq('is_active', true)
    .single()

  return data?.id || null
}

// GET: fetch single order with its items for this supplier
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = createAdminClient()

  // Get order
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Get items for this supplier only
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .eq('supplier_id', supplierId)

  // Find OTHER open orders for the same customer that this supplier has items in.
  // "open" = at least one item in a non-final status (pending / packed). Match by
  // phone first (most reliable), then email. Lets the supplier ship together.
  const customerPhone = order.customer_phone as string | null
  const customerEmail = order.customer_email as string | null
  let relatedOpenOrders: Array<{
    id: string
    shopify_order_number: string | null
    order_date: string | null
    items_count: number
    statuses: string[]
  }> = []

  if (customerPhone || customerEmail) {
    let q = supabase
      .from('orders')
      .select('id, shopify_order_number, order_date, customer_phone, customer_email')
      .neq('id', id)
      .order('order_date', { ascending: false })
      .limit(30)
    if (customerPhone) q = q.eq('customer_phone', customerPhone)
    else if (customerEmail) q = q.eq('customer_email', customerEmail)
    const { data: candidates } = await q

    if (candidates && candidates.length > 0) {
      const ids = candidates.map((o) => o.id)
      const { data: openItems } = await supabase
        .from('order_items')
        .select('order_id, internal_status')
        .in('order_id', ids)
        .eq('supplier_id', supplierId)
        .in('internal_status', ['pending', 'packed'])

      const byOrder = new Map<string, string[]>()
      for (const it of openItems || []) {
        const arr = byOrder.get(it.order_id) || []
        arr.push(it.internal_status || 'pending')
        byOrder.set(it.order_id, arr)
      }
      relatedOpenOrders = candidates
        .filter((o) => byOrder.has(o.id))
        .map((o) => ({
          id: o.id,
          shopify_order_number: o.shopify_order_number,
          order_date: o.order_date,
          items_count: byOrder.get(o.id)!.length,
          statuses: [...new Set(byOrder.get(o.id))],
        }))
    }
  }

  return NextResponse.json({ order, items: items || [], relatedOpenOrders })
}

// POST: update internal_status for items in this order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { itemIds, status, cheetahShipNo } = (await request.json()) as {
    itemIds: string[]
    status: string
    cheetahShipNo?: string
  }

  if (!itemIds?.length || !status) {
    return NextResponse.json({ error: 'itemIds and status required' }, { status: 400 })
  }

  // Sanitize ship_no (Cheetah ship numbers are 8 digits, but we accept any
  // numeric string between 5 and 14 digits to be lenient with edge cases).
  const cleanShipNo = cheetahShipNo ? cheetahShipNo.replace(/\D/g, '') : ''
  const validShipNo = cleanShipNo.length >= 5 && cleanShipNo.length <= 14 ? cleanShipNo : null

  const validStatuses = ['pending', 'packed', 'shipped', 'delivered', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify all items belong to this supplier and this order; fetch current status for logs
  const { data: items } = await supabase
    .from('order_items')
    .select('id, order_id, internal_status')
    .in('id', itemIds)
    .eq('supplier_id', supplierId)
    .eq('order_id', id)

  const verifiedItems = items || []
  if (!verifiedItems.length) {
    return NextResponse.json({ error: 'No matching items' }, { status: 404 })
  }

  const verifiedIds = verifiedItems.map((i) => i.id)

  const { error } = await supabase
    .from('order_items')
    .update({ internal_status: status })
    .in('id', verifiedIds)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Log changes
  const logs = verifiedItems
    .filter((i) => (i.internal_status || 'pending') !== status)
    .map((i) => ({
      order_item_id: i.id,
      order_id: i.order_id,
      from_status: i.internal_status || 'pending',
      to_status: status,
      changed_by_supplier_id: supplierId,
      source: 'supplier' as const,
    }))

  if (logs.length > 0) {
    await supabase.from('order_item_status_logs').insert(logs)
  }

  // Persist the Cheetah tracking number on the order when supplied (even if
  // not every item is shipped yet — saves Moshe from re-entering it later).
  if (validShipNo) {
    await supabase
      .from('orders')
      .update({ cheetah_ship_no: validShipNo })
      .eq('id', id)
  }

  // Trigger "order packed" WhatsApp ONLY when the whole order just became shipped.
  let waEnqueued = false
  if (status === 'shipped') {
    const { data: allItems } = await supabase
      .from('order_items')
      .select('internal_status')
      .eq('order_id', id)
    const remaining = (allItems || []).filter(
      (i) => i.internal_status !== 'shipped' && i.internal_status !== 'delivered' && i.internal_status !== 'cancelled'
    )
    if (remaining.length === 0) {
      // Look up order details for the message
      const { data: ord } = await supabase
        .from('orders')
        .select('shopify_order_id, shopify_order_number, customer_name, customer_phone, shipping_address')
        .eq('id', id)
        .single()
      if (ord) {
        const ship = ord.shipping_address as Record<string, string> | null
        const rawPhone = ord.customer_phone || ship?.phone || null
        const phone = normalizeIlPhone(rawPhone)
        if (phone) {
          // Fetch template
          const { data: tmpl } = await supabase
            .from('whatsapp_flow_templates')
            .select('content')
            .eq('flow', 'order_update')
            .eq('step', 2)
            .single()
          const fallback =
            'היי {שם} 😊\nההזמנה שלך {הזמנה} ארוזה ויוצאת לדרך בקרוב 📦\nתודה,\nמשי טקסטיל'
          const template = tmpl?.content || fallback
          const firstName = (ord.customer_name || '').toString().trim().split(' ')[0] || ''
          const orderNum = ord.shopify_order_number || ''
          const content = template
            .replace(/\{שם\}/g, firstName)
            .replace(/\{name\}/g, firstName)
            .replace(/\{הזמנה\}/g, orderNum)
            .replace(/\{order\}/g, orderNum)
            .replace(/ {2,}/g, ' ')
            .trim()

          // Use SAME dedup-key format as the polling-based shipped enqueue so
          // both paths produce at most ONE shipped message per order.
          const dedupKey = `ou:ship:gid://shopify/Order/${ord.shopify_order_id}`
          await enqueueJob({
            flow: 'order_update',
            step: 2,
            phone,
            content,
            scheduledAt: new Date(),
            refType: 'order',
            refId: `gid://shopify/Order/${ord.shopify_order_id}`,
            dedupKey,
          })
          waEnqueued = true
        }
      }
    }
  }

  return NextResponse.json({ success: true, updated: verifiedIds.length, logged: logs.length, whatsappEnqueued: waEnqueued })
}
