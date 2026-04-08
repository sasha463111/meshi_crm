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

  return NextResponse.json({ order, items: items || [] })
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
  const { itemIds, status } = await request.json()

  if (!itemIds?.length || !status) {
    return NextResponse.json({ error: 'itemIds and status required' }, { status: 400 })
  }

  const validStatuses = ['pending', 'packed', 'shipped', 'delivered', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify all items belong to this supplier and this order
  const { data: items } = await supabase
    .from('order_items')
    .select('id')
    .in('id', itemIds)
    .eq('supplier_id', supplierId)
    .eq('order_id', id)

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
