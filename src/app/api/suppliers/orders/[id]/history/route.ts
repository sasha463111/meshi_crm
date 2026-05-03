import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

// GET status change history for all items in this order belonging to this supplier
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supplierId = await verifySupplier(request)
  if (!supplierId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  // Get the supplier's items in this order
  const { data: items } = await supabase
    .from('order_items')
    .select('id, title, variant_title, sku')
    .eq('order_id', id)
    .eq('supplier_id', supplierId)

  if (!items?.length) return NextResponse.json({ logs: [], items: [] })

  const itemIds = items.map((i) => i.id)

  // Fetch all logs for these items, newest first
  const { data: logs } = await supabase
    .from('order_item_status_logs')
    .select('*')
    .in('order_item_id', itemIds)
    .order('created_at', { ascending: false })

  return NextResponse.json({ logs: logs || [], items })
}
