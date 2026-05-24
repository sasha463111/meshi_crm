import { createAdminClient } from '@/lib/supabase/admin'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

export type FlowType = 'abandoned_cart' | 'order_update' | 'winback'

export interface EnqueueInput {
  flow: FlowType
  step?: number
  phone: string
  content: string
  scheduledAt: Date
  refType?: 'checkout' | 'order' | 'customer'
  refId?: string
  dedupKey?: string
}

/** Normalise an Israeli phone to E.164 digits (e.g. 972526059554). Returns null if invalid. */
export function normalizeIlPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/[^\d+]/g, '')
  d = d.replace(/^\+/, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '972' + d.slice(1)
  // bare 9-digit mobile without country/leading 0 → assume IL mobile
  if (d.length === 9 && d.startsWith('5')) d = '972' + d
  // common data-entry error: "+972 0 5x..." → drop the stray 0 after 972
  if (d.startsWith('9720')) d = '972' + d.slice(4)
  if (!d.startsWith('972') || d.length < 11 || d.length > 13) return null
  return d
}

async function getSetting(key: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single()
  return data?.value ?? null
}

/** Add a job to the queue. Idempotent on dedupKey (re-enqueue is a no-op). */
export async function enqueueJob(input: EnqueueInput): Promise<boolean> {
  const phone = normalizeIlPhone(input.phone)
  if (!phone) return false
  const supabase = createAdminClient()
  const { error } = await supabase.from('whatsapp_flow_jobs').insert({
    flow: input.flow,
    step: input.step ?? 1,
    phone,
    content: input.content,
    scheduled_at: input.scheduledAt.toISOString(),
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
    dedup_key: input.dedupKey ?? null,
  })
  // Unique violation on dedup_key = already enqueued → treat as success (no-op)
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    console.error('enqueueJob error:', error.message)
    return false
  }
  return true
}

/** Cancel pending jobs for a phone (e.g. the customer completed the purchase). */
export async function cancelPendingForPhone(phone: string, flow?: FlowType): Promise<number> {
  const normalized = normalizeIlPhone(phone)
  if (!normalized) return 0
  const supabase = createAdminClient()
  let q = supabase
    .from('whatsapp_flow_jobs')
    .update({ status: 'cancelled' })
    .eq('phone', normalized)
    .eq('status', 'pending')
  if (flow) q = q.eq('flow', flow)
  const { data } = await q.select('id')
  return data?.length ?? 0
}

/** Cancel ALL pending jobs (e.g. on reconnect, to flush a stale queue). */
export async function cancelAllPending(reason = 'flushed'): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('whatsapp_flow_jobs')
    .update({ status: 'cancelled', error: reason })
    .eq('status', 'pending')
    .select('id')
  return data?.length ?? 0
}

async function sendVia(phone: string, text: string): Promise<string | null> {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number: phone, text, delay: 1000, linkPreview: true }),
  })
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data?.key?.id ?? null
}

export interface ProcessResult {
  enabled: boolean
  testPhone: string | null
  due: number
  sent: number
  failed: number
}

/**
 * Send all jobs whose time has come. Gated by the master switch; if a test phone
 * is set, every message is redirected there (nothing reaches real customers).
 */
export async function processDueJobs(limit = 50): Promise<ProcessResult> {
  const supabase = createAdminClient()
  const enabled = (await getSetting('whatsapp_flow_enabled')) === 'true'
  const testPhone = normalizeIlPhone(await getSetting('whatsapp_flow_test_phone'))

  const { data: due } = await supabase
    .from('whatsapp_flow_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit)

  const jobs = due ?? []
  const result: ProcessResult = { enabled, testPhone, due: jobs.length, sent: 0, failed: 0 }

  // Safety: if the master switch is off, do nothing (leave jobs pending).
  if (!enabled) return result

  for (const job of jobs) {
    const target = testPhone || job.phone
    try {
      const msgId = await sendVia(target, job.content)
      await supabase
        .from('whatsapp_flow_jobs')
        .update({ status: 'sent', sent_at: new Date().toISOString(), evolution_message_id: msgId })
        .eq('id', job.id)
      // Mirror into the messages log for the inbox/history
      await supabase.from('whatsapp_messages').insert({
        direction: 'outbound',
        phone_number: target,
        message_type: 'template',
        content: job.content,
        template_name: job.flow,
        status: 'sent',
        evolution_message_id: msgId,
        sent_at: new Date().toISOString(),
      })
      result.sent++
    } catch (e) {
      await supabase
        .from('whatsapp_flow_jobs')
        .update({ status: 'failed', error: (e as Error).message })
        .eq('id', job.id)
      result.failed++
    }
  }

  return result
}
