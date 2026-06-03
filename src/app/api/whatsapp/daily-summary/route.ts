import { NextResponse } from 'next/server'
import { buildDailySummary, sendDailySummary } from '@/lib/whatsapp/daily-profit-summary'

export const maxDuration = 60

function authorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(request.url)
    if (url.searchParams.get('dry') === '1') {
      const text = await buildDailySummary()
      return NextResponse.json({ dryRun: true, text })
    }
    const result = await sendDailySummary()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export const GET = POST
