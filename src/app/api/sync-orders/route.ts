import { NextResponse } from 'next/server'
import { syncOrders } from '@/lib/shopify/sync-orders'
import { createAdminClient } from '@/lib/supabase/admin'

// POST: manual sync trigger from admin UI
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
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Manual sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
