import { NextResponse } from 'next/server'
import { sendSiteSummaryToGroup, buildSiteSummary } from '@/lib/whatsapp/site-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Build and send the site-status summary to the configured WhatsApp group.
 * - GET  → just build and return the text (preview, no send).
 * - POST → build and send to the group.
 * Both gated by CRON_SECRET so the pg_cron scheduler can call it.
 */
async function authorize(request: Request): Promise<boolean> {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secret === process.env.CRON_SECRET
  )
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { text, data } = await buildSiteSummary()
    return NextResponse.json({ ok: true, preview: text, data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'preview failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await sendSiteSummaryToGroup()
    return NextResponse.json({ ok: true, ...r })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'send failed' },
      { status: 500 }
    )
  }
}
