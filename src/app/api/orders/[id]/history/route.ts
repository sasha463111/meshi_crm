import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET all status change logs for an order (admin view — sees all suppliers)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from('order_items')
    .select('id, title, variant_title, sku, supplier_id, suppliers:supplier_id(name)')
    .eq('order_id', id)

  const { data: logs } = await supabase
    .from('order_item_status_logs')
    .select('*, suppliers:changed_by_supplier_id(name)')
    .eq('order_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ logs: logs || [], items: items || [] })
}
