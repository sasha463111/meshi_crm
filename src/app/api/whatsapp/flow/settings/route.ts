import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function getVal(supabase: ReturnType<typeof createAdminClient>, key: string) {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
  return data?.value ?? null
}

export async function GET() {
  const supabase = createAdminClient()
  const enabled = (await getVal(supabase, 'whatsapp_flow_enabled')) === 'true'
  const testPhone = (await getVal(supabase, 'whatsapp_flow_test_phone')) || ''

  // Queue stats
  const counts: Record<string, number> = {}
  for (const status of ['pending', 'sent', 'cancelled', 'failed']) {
    const { count } = await supabase
      .from('whatsapp_flow_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    counts[status] = count ?? 0
  }

  const { data: recent } = await supabase
    .from('whatsapp_flow_jobs')
    .select('flow, step, phone, status, scheduled_at, sent_at, content')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ enabled, testPhone, counts, recent: recent ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json().catch(() => ({}))

  const updates: { key: string; value: string }[] = []
  if (typeof body.enabled === 'boolean') {
    updates.push({ key: 'whatsapp_flow_enabled', value: body.enabled ? 'true' : 'false' })
  }
  if (typeof body.testPhone === 'string') {
    updates.push({ key: 'whatsapp_flow_test_phone', value: body.testPhone.trim() })
  }

  for (const u of updates) {
    await supabase.from('app_settings').upsert({ key: u.key, value: u.value }, { onConflict: 'key' })
  }

  return NextResponse.json({ ok: true })
}
