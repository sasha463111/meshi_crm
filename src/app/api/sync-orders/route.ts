import { NextResponse } from 'next/server'
import { syncOrders } from '@/lib/shopify/sync-orders'
import { createAdminClient } from '@/lib/supabase/admin'

// POST: manual or auto sync trigger
export async function POST() {
  try {
    const supabase = createAdminClient()

    // Check if we have orders - if so, incremental sync (last 2 hours)
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })

    let since: string | undefined
    if (count && count > 0) {
      since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    }

    const result = await syncOrders(since)

    // Auto-assign supplier to any unassigned order_items
    const { data: defaultSupplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .single()

    if (defaultSupplier) {
      await supabase
        .from('order_items')
        .update({ supplier_id: defaultSupplier.id })
        .is('supplier_id', null)
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Manual sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
