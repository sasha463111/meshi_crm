import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('whatsapp_flow_templates')
    .select('id, flow, step, label, content')
    .order('flow', { ascending: true })
    .order('step', { ascending: true })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const updates: Array<{ id: string; content: string }> = body.templates || []

  for (const u of updates) {
    if (!u.id || typeof u.content !== 'string') continue
    await supabase
      .from('whatsapp_flow_templates')
      .update({ content: u.content, updated_at: new Date().toISOString() })
      .eq('id', u.id)
  }

  return NextResponse.json({ ok: true })
}
