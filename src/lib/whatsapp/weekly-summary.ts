/**
 * Weekly deep summary — sent every Sunday 09:00 IL.
 *
 * Includes:
 *  - Full P&L for the past 7 days
 *  - Comparison to previous 7 days
 *  - Meta ads detailed breakdown (top 5 ads by spend/revenue)
 *  - Top 5 products by units
 *  - Top 5 cities
 *  - Repeat customer activity
 *  - Progress toward monthly ₪100K target
 */
import { computeProfit, fmt } from '@/lib/finance/profit'
import { createAdminClient } from '@/lib/supabase/admin'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

const MONTHLY_TARGET = 100000
const WEEKLY_TARGET = MONTHLY_TARGET / 4.3 // ≈ ₪23,256

function ilDayStart(d: Date): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d)
  const off = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'longOffset',
  })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+03:00'
  const m = off.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  return `${ymd}T00:00:00${m?.[1] || '+'}${(m?.[2] || '03').padStart(2, '0')}:${(m?.[3] || '00').padStart(2, '0')}`
}

function fmtRange(from: Date, to: Date): string {
  const f = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' })
  return `${f.format(from)} - ${f.format(to)}`
}

function pctChange(a: number, b: number): string {
  if (b === 0) return a > 0 ? '+∞%' : '0%'
  const p = ((a - b) / b) * 100
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(0)}%`
}

interface TopAd { name: string; spend: number; revenue: number; roas: number; conversions: number }
interface TopProduct { title: string; units: number; revenue: number }
interface TopCity { city: string; orders: number; revenue: number }

async function fetchTopAds(from: string, to: string): Promise<TopAd[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('ad_insights')
    .select('ad_id, spend, conversion_value, conversions, ads:ad_id(name)')
    .gte('date', from.slice(0, 10))
    .lt('date', to.slice(0, 10))
  type AdRow = { ad_id: string; spend: unknown; conversion_value: unknown; conversions: unknown; ads?: { name?: string } | { name?: string }[] | null }
  const byAd = new Map<string, TopAd>()
  for (const r of (data || []) as AdRow[]) {
    const adsField = r.ads
    const name = (Array.isArray(adsField) ? adsField[0]?.name : adsField?.name) || r.ad_id
    const cur = byAd.get(name) || { name, spend: 0, revenue: 0, conversions: 0, roas: 0 }
    cur.spend += Number(r.spend || 0)
    cur.revenue += Number(r.conversion_value || 0)
    cur.conversions += Number(r.conversions || 0)
    byAd.set(name, cur)
  }
  for (const v of byAd.values()) v.roas = v.spend > 0 ? v.revenue / v.spend : 0
  return [...byAd.values()].filter((x) => x.spend > 10).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
}

async function fetchTopProducts(from: string, to: string): Promise<TopProduct[]> {
  const sb = createAdminClient()
  const { data: orderRows } = await sb.from('orders').select('id').gte('order_date', from).lt('order_date', to)
  const ids = (orderRows || []).map((o) => o.id)
  if (!ids.length) return []
  const { data: items } = await sb.from('order_items').select('title, quantity, total_price').in('order_id', ids)
  type ItemRow = { title: unknown; quantity: unknown; total_price: unknown }
  const byTitle = new Map<string, TopProduct>()
  for (const it of (items || []) as ItemRow[]) {
    const title = String(it.title || '')
    if (/משלוח|דמי/i.test(title)) continue
    const cur = byTitle.get(title) || { title, units: 0, revenue: 0 }
    cur.units += Number(it.quantity || 0)
    cur.revenue += Number(it.total_price || 0)
    byTitle.set(title, cur)
  }
  return [...byTitle.values()].sort((a, b) => b.units - a.units).slice(0, 5)
}

async function fetchTopCities(from: string, to: string): Promise<TopCity[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('orders')
    .select('shipping_address, total')
    .gte('order_date', from)
    .lt('order_date', to)
  type OrderRow = { shipping_address: unknown; total: unknown }
  const byCity = new Map<string, TopCity>()
  for (const o of (data || []) as OrderRow[]) {
    const ship = (o.shipping_address as Record<string, unknown> | null) || null
    const city = (ship?.city as string) || ''
    if (!city) continue
    const cur = byCity.get(city) || { city, orders: 0, revenue: 0 }
    cur.orders += 1
    cur.revenue += Number(o.total || 0)
    byCity.set(city, cur)
  }
  return [...byCity.values()].sort((a, b) => b.orders - a.orders).slice(0, 5)
}

async function fetchMonthProgress(): Promise<{ revenue: number; orders: number }> {
  const sb = createAdminClient()
  const now = new Date()
  const monthStart = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).replace(/(\d+)\/(\d+)/, '$2-$1-01')
  )
  const { data } = await sb
    .from('orders')
    .select('total')
    .gte('order_date', monthStart.toISOString())
  return {
    revenue: (data || []).reduce((s, r) => s + Number(r.total || 0), 0),
    orders: (data || []).length,
  }
}

export async function buildWeeklySummary(): Promise<string> {
  const now = new Date()
  const thisStart = ilDayStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const prevStart = ilDayStart(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000))
  const nowIso = ilDayStart(now)
  const thisStartDate = new Date(thisStart)
  const thisEndDate = new Date(nowIso)

  const [thisWeek, prevWeek, topAds, topProducts, topCities, monthProgress] = await Promise.all([
    computeProfit(thisStart, nowIso),
    computeProfit(prevStart, thisStart),
    fetchTopAds(thisStart, nowIso),
    fetchTopProducts(thisStart, nowIso),
    fetchTopCities(thisStart, nowIso),
    fetchMonthProgress(),
  ])

  const roas = thisWeek.adSpend > 0 ? thisWeek.grossRevenue / thisWeek.adSpend : 0
  const monthPct = Math.round((monthProgress.revenue / MONTHLY_TARGET) * 100)
  const weekPct = Math.round((thisWeek.grossRevenue / WEEKLY_TARGET) * 100)

  const lines: string[] = []
  lines.push(`📈 *סיכום שבועי — ${fmtRange(thisStartDate, thisEndDate)}*`)
  lines.push('')

  // Targets
  lines.push(`*🎯 יעדים*`)
  lines.push(`• השבוע: ${fmt(thisWeek.grossRevenue)} / ${fmt(WEEKLY_TARGET)} (${weekPct}%)`)
  lines.push(`• החודש: ${fmt(monthProgress.revenue)} / ${fmt(MONTHLY_TARGET)} (${monthPct}%)`)
  lines.push('')

  // Revenue
  lines.push(`*💰 הכנסות*`)
  lines.push(`• ברוטו: ${fmt(thisWeek.grossRevenue)} (${pctChange(thisWeek.grossRevenue, prevWeek.grossRevenue)} מהשבוע שעבר)`)
  if (thisWeek.refunds > 0) lines.push(`• החזרים: ${fmt(thisWeek.refunds)} (${thisWeek.refundedCount} הזמנות)`)
  lines.push(`• נטו: ${fmt(thisWeek.netRevenue)}`)
  lines.push(`• הזמנות: ${thisWeek.orderCount} (${pctChange(thisWeek.orderCount, prevWeek.orderCount)})`)
  lines.push(`• AOV: ${fmt(thisWeek.aov)} (שבוע שעבר ${fmt(prevWeek.aov)})`)
  lines.push('')

  // Units
  const u = thisWeek.units
  lines.push(`*📦 יחידות*`)
  lines.push(`• מצעים: ${u.bedding} | מגבות: ${u.towel} | כריות: ${u.pillow}${u.rug ? ` | שטיחים: ${u.rug}` : ''}`)
  lines.push('')

  // P&L
  lines.push(`*💸 שורת הרווח*`)
  lines.push(`• עלות מוצרים: ${fmt(thisWeek.cogs.bedding + thisWeek.cogs.towel + thisWeek.cogs.pillow + thisWeek.cogs.rug)}`)
  lines.push(`• משלוח + אריזה: ${fmt(thisWeek.cogs.shipping + thisWeek.cogs.packaging)}`)
  lines.push(`• עמלות סליקה: ${fmt(thisWeek.paymentFees)}`)
  lines.push(`• פרסום מטא: ${fmt(thisWeek.adSpend)}${roas > 0 ? ` (ROAS ${roas.toFixed(2)}x)` : ''}`)
  const profitEmoji = thisWeek.netProfit >= 0 ? '💚' : '🔴'
  lines.push(`${profitEmoji} *רווח נטו: ${fmt(thisWeek.netProfit)} (${(thisWeek.margin * 100).toFixed(1)}%)*`)
  lines.push(`• שבוע שעבר: ${fmt(prevWeek.netProfit)}`)
  lines.push('')

  // Top ads
  if (topAds.length) {
    lines.push(`*📣 קמפיינים מובילים (מטא)*`)
    for (const a of topAds) {
      const roasStr = a.roas > 0 ? `${a.roas.toFixed(1)}x` : '—'
      lines.push(`• ${a.name.slice(0, 35)} — ${fmt(a.revenue)} / ${fmt(a.spend)} = ${roasStr}`)
    }
    lines.push('')
  } else if (thisWeek.adSpend > 0) {
    lines.push(`📣 פרסום: ${fmt(thisWeek.adSpend)} (פירוט מטא לא סונכרן)`)
    lines.push('')
  }

  // Top products
  if (topProducts.length) {
    lines.push(`*🏆 מוצרים מובילים*`)
    for (const p of topProducts) {
      lines.push(`• ${p.title.slice(0, 40)} — ${p.units} יח׳ ${fmt(p.revenue)}`)
    }
    lines.push('')
  }

  // Top cities
  if (topCities.length) {
    lines.push(`*🗺️ ערים מובילות*`)
    for (const c of topCities) {
      lines.push(`• ${c.city} — ${c.orders} הזמ׳ ${fmt(c.revenue)}`)
    }
    lines.push('')
  }

  // Insight footer
  if (monthPct < 25 && new Date().getDate() >= 7) {
    lines.push(`⚠️ *מאחורי היעד החודשי — לבדוק אם להגדיל תקציב פרסום*`)
  } else if (monthPct >= 100) {
    lines.push(`🎉 *עברנו את היעד החודשי!*`)
  } else if (roas >= 5 && thisWeek.adSpend > 0) {
    lines.push(`🔥 *ROAS השבועי מעולה (${roas.toFixed(1)}x) — אפשר לסקלר תקציב*`)
  }

  return lines.join('\n')
}

export async function sendWeeklySummary(): Promise<{ messageId: string; preview: string }> {
  const sb = createAdminClient()
  const { data: groupRow } = await sb.from('app_settings').select('value').eq('key', 'summary_group_jid').single()
  const groupJid = groupRow?.value
  if (!groupJid) throw new Error('summary_group_jid not configured')

  const text = await buildWeeklySummary()
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number: groupJid, text, delay: 1200, linkPreview: false }),
  })
  if (!res.ok) throw new Error(`Evolution send failed: ${await res.text()}`)
  const j = await res.json()
  return { messageId: (j as { key?: { id?: string } }).key?.id || 'unknown', preview: text.slice(0, 200) }
}
