/**
 * Daily P&L summary — sent every evening (21:30 IL) to the management group.
 *
 * Includes:
 *  - Revenue (gross / refunds / net)
 *  - Orders + AOV
 *  - Units by category
 *  - COGS breakdown
 *  - Payment fees
 *  - Meta ad spend + ROAS for the day
 *  - Net profit / margin
 *  - Progress vs daily target (₪3,333 for the ₪100K June goal)
 */
import { computeProfit, fmt } from '@/lib/finance/profit'
import { createAdminClient } from '@/lib/supabase/admin'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!

const DAILY_TARGET = 3333 // ₪100K / 30 days

/** Start of given day in Asia/Jerusalem, as an ISO string. */
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

function ilDate(d: Date): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' }).format(d)
}

export async function buildDailySummary(): Promise<string> {
  const now = new Date()
  const todayStart = ilDayStart(now)
  const tomorrowStart = ilDayStart(new Date(now.getTime() + 24 * 60 * 60 * 1000))

  // Yesterday (same window 1 day ago) for comparison
  const yStart = ilDayStart(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const [today, yesterday] = await Promise.all([
    computeProfit(todayStart, tomorrowStart),
    computeProfit(yStart, todayStart),
  ])

  // ROAS for today
  const roas = today.adSpend > 0 ? today.grossRevenue / today.adSpend : 0
  const yRoas = yesterday.adSpend > 0 ? yesterday.grossRevenue / yesterday.adSpend : 0

  // Progress to daily target
  const pct = Math.round((today.grossRevenue / DAILY_TARGET) * 100)
  const bar = '█'.repeat(Math.min(20, Math.round(pct / 5))) + '░'.repeat(Math.max(0, 20 - Math.round(pct / 5)))
  const targetEmoji = pct >= 100 ? '🎯' : pct >= 80 ? '🔥' : pct >= 50 ? '⚡' : pct >= 25 ? '🚀' : '⚠️'

  // Profit emoji
  const profitEmoji = today.netProfit >= 0 ? '💚' : '🔴'
  const profitTrend = today.netProfit - yesterday.netProfit
  const trendArrow = profitTrend > 50 ? '↗️' : profitTrend < -50 ? '↘️' : '→'

  const lines: string[] = []
  lines.push(`📊 *סיכום יומי — ${ilDate(now)}*`)
  lines.push('')
  lines.push(`*יעד יומי:* ${fmt(DAILY_TARGET)}`)
  lines.push(`${targetEmoji} ${fmt(today.grossRevenue)} (${pct}%)`)
  lines.push(`${bar}`)
  lines.push('')

  lines.push(`💰 *הכנסות*`)
  lines.push(`• ברוטו: ${fmt(today.grossRevenue)}${today.refunds > 0 ? ` (החזרים ${fmt(today.refunds)})` : ''}`)
  lines.push(`• נטו: ${fmt(today.netRevenue)}`)
  lines.push(`• הזמנות: ${today.orderCount}${today.refundedCount > 0 ? ` (${today.refundedCount} הוחזרו)` : ''}`)
  if (today.orderCount > 0) lines.push(`• AOV: ${fmt(today.aov)}`)
  lines.push('')

  // Units sold
  const u = today.units
  const totalUnits = u.bedding + u.towel + u.pillow + u.rug
  if (totalUnits > 0) {
    lines.push(`📦 *יחידות שיצאו*`)
    if (u.bedding) lines.push(`• מצעים: ${u.bedding}`)
    if (u.towel) lines.push(`• מגבות: ${u.towel}`)
    if (u.pillow) lines.push(`• כריות: ${u.pillow}`)
    if (u.rug) lines.push(`• שטיחים: ${u.rug}`)
    lines.push('')
  }

  // Costs
  lines.push(`💸 *עלויות*`)
  lines.push(`• עלות מוצרים: ${fmt(today.cogs.bedding + today.cogs.towel + today.cogs.pillow + today.cogs.rug)}`)
  lines.push(`• משלוח + אריזה: ${fmt(today.cogs.shipping + today.cogs.packaging)}`)
  lines.push(`• עמלות סליקה (~2.8%): ${fmt(today.paymentFees)}`)
  lines.push(`• פרסום מטא: ${fmt(today.adSpend)}${roas > 0 ? ` (ROAS ${roas.toFixed(2)}x)` : ''}`)
  lines.push(`• סה"כ עלויות: ${fmt(today.totalCosts)}`)
  lines.push('')

  // Bottom line
  lines.push(`${profitEmoji} *רווח נטו: ${fmt(today.netProfit)} ${trendArrow}*`)
  lines.push(`• רווחיות: ${(today.margin * 100).toFixed(1)}%`)
  if (yesterday.orderCount > 0) {
    lines.push(`• אתמול: ${fmt(yesterday.netProfit)} (${yesterday.orderCount} הזמנות)`)
  }
  lines.push('')

  // Smart insight
  if (today.adSpend > 0 && roas < 2) {
    lines.push(`⚠️ ROAS היום נמוך (${roas.toFixed(2)}x) — לבדוק קמפיינים`)
  } else if (roas >= 5) {
    lines.push(`🔥 ROAS מעולה (${roas.toFixed(2)}x) — לשקול להגדיל תקציב`)
  }
  if (today.orderCount === 0) {
    lines.push(`🔴 אין הזמנות היום — לבדוק אם האתר תקין`)
  }

  return lines.join('\n')
}

export async function sendDailySummary(): Promise<{ messageId: string; preview: string }> {
  const sb = createAdminClient()
  const { data: groupRow } = await sb.from('app_settings').select('value').eq('key', 'summary_group_jid').single()
  const groupJid = groupRow?.value
  if (!groupJid) throw new Error('summary_group_jid not configured')

  const text = await buildDailySummary()

  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number: groupJid, text, delay: 1200, linkPreview: false }),
  })
  if (!res.ok) throw new Error(`Evolution send failed: ${await res.text()}`)
  const j = await res.json()
  return { messageId: (j as { key?: { id?: string } }).key?.id || 'unknown', preview: text.slice(0, 200) }
}
