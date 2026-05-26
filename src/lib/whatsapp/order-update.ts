import { getRecentOrders } from '@/lib/shopify/recent-orders'
import { enqueueJob, normalizeIlPhone } from './flow'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULTS: Record<number, string> = {
  1:
    'תודה {name}! קיבלנו את ההזמנה שלך {order} 🎉\n' +
    'אנחנו כבר מכינים אותה ונעדכן אותך ברגע שהיא יוצאת אלייך.\n' +
    'לצפייה בהזמנה: {link}',
  2:
    'ההזמנה שלך {order} יצאה לדרך! 🚚\n' +
    'מספר מעקב: {tracking}\n' +
    'טיפ קטן: המצעים שלנו לא צריכים גיהוץ — ישר מהמייבש למיטה 😴',
}

function firstName(s: string | null): string {
  return (s || '').trim().split(' ')[0] || ''
}

function render(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
  return out.replace(/ {2,}/g, ' ').trim()
}

async function loadTemplates(): Promise<Record<number, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('whatsapp_flow_templates')
    .select('step, content')
    .eq('flow', 'order_update')
  const map: Record<number, string> = { ...DEFAULTS }
  for (const row of data || []) map[row.step] = row.content
  return map
}

/**
 * Scan recent orders and enqueue transactional WhatsApp updates:
 *  - confirmation when an order is created
 *  - shipped notice when an order gets a fulfillment (with tracking)
 * Dedup keys ensure each order gets each message at most once.
 */
export async function scanAndEnqueueOrderUpdates(): Promise<{ scanned: number; enqueued: number }> {
  // Use the default 24h lookback so cron gaps never lose an order; dedup keys
  // make a wide window idempotent.
  const orders = await getRecentOrders()
  const tmpl = await loadTemplates()
  const now = new Date()
  let enqueued = 0

  for (const o of orders) {
    const phone = normalizeIlPhone(o.phone)
    if (!phone) continue
    const name = firstName(o.firstName)

    // Confirmation (English + Hebrew token aliases)
    const confirm = render(tmpl[1] || DEFAULTS[1], {
      name,
      'שם': name,
      order: o.number,
      'הזמנה': o.number,
      link: o.statusUrl || '',
      'קישור': o.statusUrl || '',
    })
    if (
      await enqueueJob({
        flow: 'order_update',
        step: 1,
        phone,
        content: confirm,
        scheduledAt: now,
        refType: 'order',
        refId: o.id,
        dedupKey: `ou:confirm:${o.id}`,
      })
    )
      enqueued++

    // Shipped (only if there is a fulfillment)
    if (o.fulfilledAt) {
      const shipped = render(tmpl[2] || DEFAULTS[2], {
        name,
        'שם': name,
        order: o.number,
        'הזמנה': o.number,
        tracking: o.trackingNumber || 'יעודכן בהמשך',
        'מעקב': o.trackingNumber || 'יעודכן בהמשך',
      })
      if (
        await enqueueJob({
          flow: 'order_update',
          step: 2,
          phone,
          content: shipped,
          scheduledAt: now,
          refType: 'order',
          refId: o.id,
          dedupKey: `ou:ship:${o.id}`,
        })
      )
        enqueued++
    }
  }

  return { scanned: orders.length, enqueued }
}
