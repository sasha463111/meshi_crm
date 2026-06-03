/**
 * Per-period P&L calculator for Meshi Textile.
 *
 * Cost model (set by ownership, June 2026):
 *   - מצעים (bedding): ₪40 per unit
 *   - מגבות (towels): ₪13 per unit  (sold 3 for ₪100 / 8 for ₪219)
 *   - כריות (pillows): ₪13 per unit (sold at ₪50)
 *   - שטיחים (rugs): ₪90 per unit
 *   - Per order: ₪40 shipping + ₪2 packaging = ₪42
 *
 * Revenue source: shopify orders table (orders.total).
 * Refunds: orders with status='refunded' subtract from revenue.
 * Ad spend: ad_insights table (Meta sync).
 * Payment processing fees: 2.8% + ₪0.5 per order (Shopify Payments Israel).
 */
import { createAdminClient } from '@/lib/supabase/admin'

export const COSTS = {
  bedding: 40,
  towel: 13,
  pillow: 13,
  rug: 90,
  shipping: 40,
  packaging: 2,
  paymentFeePct: 0.028,
  paymentFeeFixed: 0.5,
}

function categoryOf(title: string): 'bedding' | 'towel' | 'pillow' | 'rug' | 'shipping_line' | 'other' {
  const t = (title || '').toLowerCase()
  if (t.includes('משלוח') || t.includes('דמי')) return 'shipping_line'
  if (t.includes('מצע') || t.includes('סדין') || t.includes('ציפה')) return 'bedding'
  if (t.includes('מגבת') || t.includes('מגבות') || t.includes('towel')) return 'towel'
  if (t.includes('כרית') || t.includes('כריות') || t.includes('pillow')) return 'pillow'
  if (t.includes('שטיח') || t.includes('rug') || t.includes('carpet')) return 'rug'
  return 'other'
}

export interface ProfitReport {
  range: { from: string; to: string }
  orderCount: number
  refundedCount: number
  grossRevenue: number
  refunds: number
  netRevenue: number
  units: { bedding: number; towel: number; pillow: number; rug: number; other: number }
  cogs: {
    bedding: number
    towel: number
    pillow: number
    rug: number
    shipping: number
    packaging: number
    total: number
  }
  paymentFees: number
  adSpend: number
  totalCosts: number
  netProfit: number
  margin: number
  aov: number
}

/**
 * Compute the P&L for a date range. `from` inclusive, `to` exclusive (both as
 * ISO date strings; we interpret them as Asia/Jerusalem midnights).
 */
export async function computeProfit(from: string, to: string): Promise<ProfitReport> {
  const sb = createAdminClient()

  // 1. Pull orders + items in the period
  const { data: orders } = await sb
    .from('orders')
    .select('id, total, status, currency')
    .gte('order_date', from)
    .lt('order_date', to)

  const orderIds = (orders || []).map((o) => o.id)
  const grossRevenue = (orders || []).reduce((s, o) => s + Number(o.total || 0), 0)
  const refundedOrders = (orders || []).filter((o) => o.status === 'refunded')
  const refundedCount = refundedOrders.length
  const refunds = refundedOrders.reduce((s, o) => s + Number(o.total || 0), 0)
  const netRevenue = grossRevenue - refunds

  // 2. Categorize items
  const units = { bedding: 0, towel: 0, pillow: 0, rug: 0, other: 0 }
  if (orderIds.length > 0) {
    const { data: items } = await sb
      .from('order_items')
      .select('title, quantity')
      .in('order_id', orderIds)
    for (const it of items || []) {
      const cat = categoryOf(it.title as string)
      if (cat === 'shipping_line') continue
      units[cat] += Number(it.quantity || 0)
    }
  }

  // 3. COGS
  const cogs = {
    bedding: units.bedding * COSTS.bedding,
    towel: units.towel * COSTS.towel,
    pillow: units.pillow * COSTS.pillow,
    rug: units.rug * COSTS.rug,
    shipping: (orders?.length || 0) * COSTS.shipping,
    packaging: (orders?.length || 0) * COSTS.packaging,
    total: 0,
  }
  cogs.total = cogs.bedding + cogs.towel + cogs.pillow + cogs.rug + cogs.shipping + cogs.packaging

  // 4. Payment processing fees (Shopify Payments IL: 2.8% + ₪0.5)
  const paymentFees =
    netRevenue * COSTS.paymentFeePct + (orders?.length || 0) * COSTS.paymentFeeFixed

  // 5. Ad spend (Meta)
  const { data: adRows } = await sb
    .from('ad_insights')
    .select('spend')
    .gte('date', from.slice(0, 10))
    .lt('date', to.slice(0, 10))
  const adSpend = (adRows || []).reduce((s, r) => s + Number(r.spend || 0), 0)

  // 6. Totals
  const totalCosts = cogs.total + paymentFees + adSpend
  const netProfit = netRevenue - totalCosts
  const margin = netRevenue > 0 ? netProfit / netRevenue : 0
  const aov = (orders?.length || 0) > 0 ? grossRevenue / (orders?.length || 1) : 0

  return {
    range: { from, to },
    orderCount: orders?.length || 0,
    refundedCount,
    grossRevenue,
    refunds,
    netRevenue,
    units,
    cogs,
    paymentFees,
    adSpend,
    totalCosts,
    netProfit,
    margin,
    aov,
  }
}

/** Format a number as ILS currency. */
export function fmt(n: number): string {
  return '₪' + Math.round(n).toLocaleString('he-IL')
}
