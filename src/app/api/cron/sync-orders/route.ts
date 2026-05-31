import { NextResponse } from 'next/server'
import { syncOrders } from '@/lib/shopify/sync-orders'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

function authorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

/**
 * Daily wide sync (called by pg_cron at 05:00 Israel). Pulls the last 24h of
 * orders so the supplier portal always reflects fresh data when the team
 * starts the day — independent of the incremental 30-min Vercel cron below.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = await syncOrders(since)
    return NextResponse.json({ success: true, mode: 'daily-24h', ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
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
