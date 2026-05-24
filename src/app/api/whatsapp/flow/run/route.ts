import { NextResponse } from 'next/server'
import { scanAndEnqueueAbandonedCarts } from '@/lib/whatsapp/abandoned-cart'
import { processDueJobs } from '@/lib/whatsapp/flow'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Admin "run now" — same work as the cron tick (scan + send due), triggered from
 * the automation control panel. Still gated by the master switch, so in test
 * mode it only reaches the test phone.
 */
export async function POST() {
  try {
    const scan = await scanAndEnqueueAbandonedCarts().catch((e) => ({ error: (e as Error).message }))
    const process = await processDueJobs()
    return NextResponse.json({ ok: true, scan, process })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'run failed' },
      { status: 500 }
    )
  }
}
