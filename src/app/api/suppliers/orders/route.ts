import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

// GET: fetch supplier orders with items
export async function GET(request: NextRequest) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all order items for this supplier
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('id, order_id, title, variant_title, sku, quantity, unit_price, total_price, image_url, internal_status, fulfillment_status')
    .eq('supplier_id', supplierId)

  if (!orderItems?.length) {
    return NextResponse.json({ orders: [], orderItems: [] })
  }

  const orderIds = [...new Set(orderItems.map(i => i.order_id))]

  const { data: orders } = await supabase
    .from('orders')
    .select('id, shopify_order_number, order_date, status, fulfillment_status, customer_name, total, shipping_address, tracking_number, carrier')
    .in('id', orderIds)
    .order('order_date', { ascending: false })

  return NextResponse.json({ orders: orders || [], orderItems })
}

// POST: bulk update internal_status for items
export async function POST(request: NextRequest) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemIds, status } = await request.json()
  if (!itemIds?.length || !status) {
    return NextResponse.json({ error: 'itemIds and status required' }, { status: 400 })
  }

  const validStatuses = ['pending', 'packed', 'shipped', 'delivered', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify all items belong to this supplier
  const { data: items } = await supabase
    .from('order_items')
    .select('id')
    .in('id', itemIds)
    .eq('supplier_id', supplierId)

  const verifiedIds = items?.map(i => i.id) || []
  if (!verifiedIds.length) {
    return NextResponse.json({ error: 'No matching items' }, { status: 404 })
  }

  const { error } = await supabase
    .from('order_items')
    .update({ internal_status: status })
    .in('id', verifiedIds)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: verifiedIds.length })
}
