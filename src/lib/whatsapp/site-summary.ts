import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeIlPhone } from './flow'
import { getClarityLiveInsights } from '@/lib/clarity/client'
import { shopifyGraphQL } from '@/lib/shopify/client'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

/** Start of today in Asia/Jerusalem as a JS Date. */
function ilDayStart(): Date {
  const now = new Date()
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now)
  const tzName =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      timeZoneName: 'longOffset',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value || 'GMT+03:00'
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  const sign = m?.[1] || '+'
  const hh = (m?.[2] || '03').padStart(2, '0')
  const mm = (m?.[3] || '00').padStart(2, '0')
  return new Date(`${ymd}T00:00:00${sign}${hh}:${mm}`)
}

function ilHour(): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

function fmtMoney(n: number): string {
  return '₪' + Math.round(n).toLocaleString('he-IL')
}

interface ClarityRow {
  total_sessions: number | null
  rage_clicks: number | null
  dead_clicks: number | null
  bounce_rate: number | null
  quick_backs: number | null
  date: string | null
}

interface ClarityMetric {
  metricName: string
  information: Record<string, unknown>[]
}

/** Pull fresh "yesterday" metrics directly from Clarity (numOfDays:1). */
async function fetchClarityYesterday(): Promise<ClarityRow | null> {
  try {
    const insights = (await getClarityLiveInsights({ numOfDays: 1 })) as ClarityMetric[]
    const find = (n: string) =>
      insights.find((m) => m.metricName === n)?.information?.[0] as Record<string, unknown> | undefined
    const traffic = find('Traffic')
    const dead = find('DeadClickCount')
    const rage = find('RageClickCount')
    const quick = find('QuickbackClick')
    // Compute "yesterday" date in IL
    const y = new Date(Date.now() - 86_400_000)
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(y)
    return {
      date: ymd,
      total_sessions: Number(traffic?.totalSessionCount) || 0,
      dead_clicks: Number(dead?.subTotal) || 0,
      rage_clicks: Number(rage?.subTotal) || 0,
      quick_backs: Number(quick?.subTotal) || 0,
      bounce_rate: Number(quick?.sessionsWithMetricPercentage) || 0,
    }
  } catch {
    return null
  }
}

interface SummaryData {
  orderCount: number
  revenue: number
  yOrderCount: number
  yRevenue: number
  ordersLast3h: number
  revenueLast3h: number
  abandonedToday: number
  abandonedLast3h: number
  recoveries: number
  fulfilledToday: number
  pendingFulfillment: number
  clarity: ClarityRow | null
}

async function gatherData(): Promise<SummaryData> {
  const supabase = createAdminClient()
  const start = ilDayStart()
  const startIso = start.toISOString()
  const now = new Date()
  const elapsedMs = now.getTime() - start.getTime()

  // Orders direct from Shopify — never depends on a sync job.
  const last3hStart = new Date(now.getTime() - 3 * 3600_000)
  const yStart = new Date(start.getTime() - 86_400_000)
  const yEnd = new Date(yStart.getTime() + elapsedMs)
  const ordersResp = await shopifyGraphQL<{
    orders: { edges: Array<{ node: { createdAt: string; totalPriceSet: { shopMoney: { amount: string } }; phone: string | null; customer: { phone: string | null } | null; shippingAddress: { phone: string | null } | null } }> }
  }>(
    `query { orders(first: 100, sortKey: CREATED_AT, reverse: true) {
      edges { node { createdAt totalPriceSet { shopMoney { amount } } phone customer { phone } shippingAddress { phone } } }
    } }`,
    {}
  ).catch(() => ({ orders: { edges: [] } }))
  const allOrders = ordersResp.orders?.edges.map((e) => e.node) || []
  const todayOrders = allOrders.filter((o) => new Date(o.createdAt) >= start)
  const yOrders = allOrders.filter((o) => {
    const t = new Date(o.createdAt).getTime()
    return t >= yStart.getTime() && t < yEnd.getTime()
  })
  const last3hOrders = allOrders.filter((o) => new Date(o.createdAt) >= last3hStart)

  const orderCount = todayOrders.length
  const revenue = todayOrders.reduce((s, o) => s + Number(o.totalPriceSet?.shopMoney?.amount || 0), 0)
  const yOrderCount = yOrders.length
  const yRevenue = yOrders.reduce((s, o) => s + Number(o.totalPriceSet?.shopMoney?.amount || 0), 0)
  const ordersLast3h = last3hOrders.length
  const revenueLast3h = last3hOrders.reduce((s, o) => s + Number(o.totalPriceSet?.shopMoney?.amount || 0), 0)

  // Abandoned carts direct from Shopify (count ALL of them, even ones without
  // phone — gives the real picture, not just the WhatsApp-eligible ones).
  const acResp = await shopifyGraphQL<{
    abandonedCheckouts: { edges: Array<{ node: { createdAt: string } }> }
  }>(
    `query { abandonedCheckouts(first: 100, sortKey: CREATED_AT, reverse: true) { edges { node { createdAt } } } }`,
    {}
  ).catch(() => ({ abandonedCheckouts: { edges: [] } }))
  const allAbandoned = acResp.abandonedCheckouts?.edges.map((e) => e.node) || []
  const abandonedToday = allAbandoned.filter((a) => new Date(a.createdAt) >= start).length
  const abandonedLast3h = allAbandoned.filter((a) => new Date(a.createdAt) >= last3hStart).length

  // Recoveries: today's order phones (any addr field) that appear in
  // abandoned-cart jobs from the last 7 days = "abandoned → recovered".
  let recoveries = 0
  if (todayOrders.length > 0) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: acJobs } = await supabase
      .from('whatsapp_flow_jobs')
      .select('phone')
      .eq('flow', 'abandoned_cart')
      .gte('created_at', since)
    const acPhones = new Set((acJobs || []).map((j) => j.phone))
    for (const o of todayOrders) {
      const raw = o.phone || o.customer?.phone || o.shippingAddress?.phone
      const norm = normalizeIlPhone(raw)
      if (norm && acPhones.has(norm)) recoveries++
    }
  }

  // Mirror the supplier portal's per-ORDER status resolution (not per-item):
  //  - any cancelled item → order = cancelled
  //  - else the order's status = lowest of its items in
  //    [cancelled, pending, packed, shipped, delivered]
  const { data: allItems } = await supabase
    .from('order_items')
    .select('order_id, internal_status')
  const byOrder = new Map<string, Set<string>>()
  for (const it of allItems || []) {
    const s = byOrder.get(it.order_id) || new Set<string>()
    s.add(it.internal_status || 'pending')
    byOrder.set(it.order_id, s)
  }
  const PRIORITY = ['cancelled', 'pending', 'packed', 'shipped', 'delivered']
  const orderResolved = new Map<string, string>()
  let pendingFulfillment = 0
  for (const [orderId, statuses] of byOrder.entries()) {
    let resolved: string
    if (statuses.has('cancelled')) resolved = 'cancelled'
    else {
      let worst = PRIORITY.length
      for (const s of statuses) {
        const idx = PRIORITY.indexOf(s)
        if (idx >= 0 && idx < worst) worst = idx
      }
      resolved = PRIORITY[worst]
    }
    orderResolved.set(orderId, resolved)
    if (resolved === 'pending') pendingFulfillment++
  }

  // "Shipped today" — count distinct ORDERS that had a shipping event today
  // AND whose current resolved status is shipped/delivered (so partials don't
  // count, matching how the portal shows it).
  const { data: fulLogs } = await supabase
    .from('order_item_status_logs')
    .select('order_id, to_status')
    .gte('created_at', startIso)
    .in('to_status', ['shipped', 'fulfilled'])
  const fulfilledToday = new Set(
    (fulLogs || [])
      .map((l) => l.order_id)
      .filter((id) => {
        const r = orderResolved.get(id)
        return r === 'shipped' || r === 'delivered'
      })
  ).size

  // Clarity: fresh "yesterday" pull from the live API (with snapshot fallback).
  let clarity: ClarityRow | null = await fetchClarityYesterday()
  if (!clarity) {
    const { data } = await supabase
      .from('clarity_snapshots')
      .select('date, total_sessions, rage_clicks, dead_clicks, bounce_rate, quick_backs')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    clarity = data
  }

  return {
    orderCount,
    revenue,
    yOrderCount,
    yRevenue,
    ordersLast3h,
    revenueLast3h,
    abandonedToday,
    abandonedLast3h,
    recoveries,
    fulfilledToday,
    pendingFulfillment,
    clarity,
  }
}

async function aiInsight(d: SummaryData): Promise<string> {
  if (!ANTHROPIC_API_KEY) return ''
  const prompt = `אתה אנליסט עסקי לחנות איקומרס מצעים (משי טקסטיל). נתוני היום עד עכשיו:
- הזמנות: ${d.orderCount} (אתמול באותו זמן: ${d.yOrderCount})
- הכנסות: ${fmtMoney(d.revenue)} (אתמול באותו זמן: ${fmtMoney(d.yRevenue)})
- ב-3 שעות האחרונות: ${d.ordersLast3h} הזמנות (${fmtMoney(d.revenueLast3h)}), ${d.abandonedLast3h} נטישות עגלה
- עגלות נטושות היום (סה"כ): ${d.abandonedToday}
- שחזורי עגלה (לקוחות שנטשו וקנו): ${d.recoveries}
- משלוחים שיצאו היום: ${d.fulfilledToday}
- הזמנות ממתינות בתור הספק: ${d.pendingFulfillment}
- Clarity ליום ${d.clarity?.date}: ${d.clarity?.total_sessions || 0} סשנים | ${d.clarity?.dead_clicks || 0} dead-clicks | ${d.clarity?.rage_clicks || 0} rage-clicks | ${d.clarity?.quick_backs || 0} quick-backs | bounce ${d.clarity?.bounce_rate ?? '-'}

החזר תובנה אחת קצרה בעברית (משפט אחד עד שניים) — אם רואים אנומליה/באג חשוד, צייני אותו. אחרת ציין המלצה ספציפית להעלאת הזמנות לפי הנתונים. תהיה ישיר, בלי כותרות.`
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 220,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return ''
    const j = await res.json()
    return (j?.content?.[0]?.text || '').trim()
  } catch {
    return ''
  }
}

function deltaArrow(today: number, yesterday: number): string {
  if (!yesterday) return today ? ' 🆕' : ''
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  if (pct >= 5) return ` 📈 +${pct}%`
  if (pct <= -5) return ` 📉 ${pct}%`
  return ` ➖ ${pct >= 0 ? '+' : ''}${pct}%`
}

export interface BuiltSummary {
  text: string
  data: SummaryData
}

export async function buildSiteSummary(): Promise<BuiltSummary> {
  const data = await gatherData()
  const insight = await aiInsight(data)

  const text =
    `📊 *סיכום אתר — ${ilHour()}*\n` +
    `\n` +
    `🛒 הזמנות היום: *${data.orderCount}*${deltaArrow(data.orderCount, data.yOrderCount)}\n` +
    `💰 הכנסות: *${fmtMoney(data.revenue)}*${deltaArrow(data.revenue, data.yRevenue)}\n` +
    `\n*ב-3 השעות האחרונות:* ${data.ordersLast3h} הזמנות (${fmtMoney(data.revenueLast3h)}) · ${data.abandonedLast3h} נטישות\n\n` +
    `🛍 נטישות עגלה היום: ${data.abandonedToday}\n` +
    `🎯 שחזורי עגלה: ${data.recoveries}\n` +
    `📦 נשלחו היום: ${data.fulfilledToday}\n` +
    `⏳ ממתינות בתור הספק: ${data.pendingFulfillment}\n` +
    (data.clarity
      ? `👀 Clarity (${data.clarity.date}): ${data.clarity.total_sessions ?? '-'} סשנים · ${
          data.clarity.dead_clicks ?? '-'
        } dead · ${data.clarity.rage_clicks ?? '-'} rage · ${data.clarity.quick_backs ?? '-'} quick-back\n`
      : '') +
    (insight ? `\n💡 ${insight}` : '')

  return { text, data }
}

/** Send the summary to the configured WhatsApp group (or fallback to one in env). */
export async function sendSiteSummaryToGroup(): Promise<{ to: string; messageId: string | null; preview: string }> {
  const supabase = createAdminClient()
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'summary_group_jid')
    .single()
  const groupJid = setting?.value
  if (!groupJid) throw new Error('summary_group_jid not configured')

  const { text } = await buildSiteSummary()
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number: groupJid, text, delay: 800, linkPreview: false }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution send error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return { to: groupJid, messageId: data?.key?.id ?? null, preview: text }
}
