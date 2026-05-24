import { getRecentAbandonedCheckouts } from '@/lib/shopify/abandoned-checkouts'
import { enqueueJob, normalizeIlPhone } from './flow'

const STEP1_DELAY_MIN = 30
const STEP2_DELAY_MIN = 4 * 60

function firstName(s: string | null): string {
  return (s || '').trim().split(' ')[0] || ''
}

/**
 * Scan recent abandoned checkouts and enqueue the 2-step WhatsApp reminder
 * (30 min + 4 h after the checkout was created). Idempotent via dedup keys.
 */
export async function scanAndEnqueueAbandonedCarts(): Promise<{ scanned: number; enqueued: number }> {
  const checkouts = await getRecentAbandonedCheckouts(STEP2_DELAY_MIN + 60) // a bit beyond step2 window
  let enqueued = 0

  for (const c of checkouts) {
    const phone = normalizeIlPhone(c.phone)
    if (!phone || !c.url) continue

    const name = firstName(c.firstName)
    const greeting = name ? `היי ${name} 😊` : 'היי 😊'
    const step1 =
      `${greeting} שמרנו לך את המצעים שבחרת בעגלה 🛏️\n` +
      `המלאי מצומצם והדגמים נחטפים — שריינתי לך אותם לזמן קצר.\n` +
      `להשלמת ההזמנה: ${c.url}`
    const step2 =
      `רק שלא תפספסי 🙏\n` +
      `4 סטים ב-219₪ במקום 356₪, ומשלוח חינם מעל 300₪.\n` +
      `הדגם שאהבת עדיין שמור: ${c.url}`

    const createdMs = new Date(c.createdAt).getTime()
    const ok1 = await enqueueJob({
      flow: 'abandoned_cart',
      step: 1,
      phone,
      content: step1,
      scheduledAt: new Date(createdMs + STEP1_DELAY_MIN * 60_000),
      refType: 'checkout',
      refId: c.id,
      dedupKey: `ac:1:${c.id}`,
    })
    const ok2 = await enqueueJob({
      flow: 'abandoned_cart',
      step: 2,
      phone,
      content: step2,
      scheduledAt: new Date(createdMs + STEP2_DELAY_MIN * 60_000),
      refType: 'checkout',
      refId: c.id,
      dedupKey: `ac:2:${c.id}`,
    })
    if (ok1 || ok2) enqueued++
  }

  return { scanned: checkouts.length, enqueued }
}
