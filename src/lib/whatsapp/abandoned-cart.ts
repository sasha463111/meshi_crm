import { getRecentAbandonedCheckouts } from '@/lib/shopify/abandoned-checkouts'
import { enqueueJob, normalizeIlPhone } from './flow'
import { createAdminClient } from '@/lib/supabase/admin'

const STEP1_DELAY_MIN = 30
const STEP2_DELAY_MIN = 4 * 60

// Fallbacks if the templates table is empty (tokens: {name}, {link})
const DEFAULTS: Record<number, string> = {
  1:
    'היי {name} 😊 שמרנו לך את המצעים שבחרת בעגלה 🛏️\n' +
    'המלאי מצומצם והדגמים נחטפים — שריינתי לך אותם לזמן קצר.\n' +
    'להשלמת ההזמנה: {link}',
  2:
    'רק שלא תפספסי 🙏\n' +
    '4 סטים ב-219₪ במקום 356₪, ומשלוח חינם מעל 300₪.\n' +
    'הדגם שאהבת עדיין שמור: {link}',
}

function firstName(s: string | null): string {
  return (s || '').trim().split(' ')[0] || ''
}

function render(template: string, name: string, link: string): string {
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{link\}/g, link)
    .replace(/ {2,}/g, ' ') // collapse the double space left when {name} is empty
    .trim()
}

async function loadTemplates(): Promise<Record<number, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('whatsapp_flow_templates')
    .select('step, content')
    .eq('flow', 'abandoned_cart')
  const map: Record<number, string> = { ...DEFAULTS }
  for (const row of data || []) map[row.step] = row.content
  return map
}

/**
 * Scan recent abandoned checkouts and enqueue the 2-step WhatsApp reminder
 * (30 min + 4 h). Message copy comes from whatsapp_flow_templates (editable in UI).
 */
export async function scanAndEnqueueAbandonedCarts(): Promise<{ scanned: number; enqueued: number }> {
  const checkouts = await getRecentAbandonedCheckouts(STEP2_DELAY_MIN + 60)
  const tmpl = await loadTemplates()
  let enqueued = 0

  for (const c of checkouts) {
    const phone = normalizeIlPhone(c.phone)
    if (!phone || !c.url) continue

    const name = firstName(c.firstName)
    const createdMs = new Date(c.createdAt).getTime()

    const steps: Array<{ step: number; delay: number }> = [
      { step: 1, delay: STEP1_DELAY_MIN },
      { step: 2, delay: STEP2_DELAY_MIN },
    ]
    let any = false
    for (const { step, delay } of steps) {
      const content = render(tmpl[step] || DEFAULTS[step], name, c.url)
      const ok = await enqueueJob({
        flow: 'abandoned_cart',
        step,
        phone,
        content,
        scheduledAt: new Date(createdMs + delay * 60_000),
        refType: 'checkout',
        refId: c.id,
        dedupKey: `ac:${step}:${c.id}`,
      })
      any = any || ok
    }
    if (any) enqueued++
  }

  return { scanned: checkouts.length, enqueued }
}
