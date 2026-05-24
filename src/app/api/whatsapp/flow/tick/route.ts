import { NextResponse } from 'next/server'
import { scanAndEnqueueAbandonedCarts } from '@/lib/whatsapp/abandoned-cart'
import { scanAndEnqueueOrderUpdates } from '@/lib/whatsapp/order-update'
import { processDueJobs } from '@/lib/whatsapp/flow'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The heartbeat of the WhatsApp flow engine. An external scheduler (cron-job.org
 * / GitHub Actions) calls this every few minutes. Protected by CRON_SECRET, sent
 * either as `Authorization: Bearer <secret>` or `?secret=<secret>`.
 *
 * Steps: (1) scan abandoned checkouts → enqueue, (2) send all due jobs.
 * Nothing reaches real customers unless whatsapp_flow_enabled = true.
 */
async function handle(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const ok = authHeader === `Bearer ${process.env.CRON_SECRET}` || secret === process.env.CRON_SECRET
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const scan = await scanAndEnqueueAbandonedCarts().catch((e) => ({ error: (e as Error).message }))
    const orders = await scanAndEnqueueOrderUpdates().catch((e) => ({ error: (e as Error).message }))
    const process = await processDueJobs()
    return NextResponse.json({ ok: true, scan, orders, process })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'tick failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return handle(request)
}
export async function POST(request: Request) {
  return handle(request)
}
