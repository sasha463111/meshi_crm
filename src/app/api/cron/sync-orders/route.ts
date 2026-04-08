import { NextResponse } from 'next/server'
import { syncOrders } from '@/lib/shopify/sync-orders'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const full = url.searchParams.get('full')

    let since: string | undefined

    if (!full) {
      // Check if we have any orders - if not, do a full sync
      const supabase = createAdminClient()
      const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })

      if (count && count > 0) {
        // Incremental sync - last 30 minutes
        since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      }
      // else: full sync (since = undefined)
    }

    const result = await syncOrders(since)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
