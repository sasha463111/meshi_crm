import { NextResponse } from 'next/server'
import { syncAds } from '@/lib/meta/sync-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Admin-side sync trigger (called by the "סנכרן Meta" button in /marketing).
 * Same work as /api/cron/sync-ads but without the cron bearer — the admin app
 * sits behind the dashboard auth.
 */
export async function POST() {
  try {
    const result = await syncAds()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
