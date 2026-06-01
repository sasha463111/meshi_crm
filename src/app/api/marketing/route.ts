import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Marketing dashboard data: KPI totals + per-creative aggregates for the chosen
 * window. Defaults to the last 7 days.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? 7)))
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  // All ads (status info + creative)
  const { data: ads } = await supabase
    .from('ads')
    .select('id, meta_ad_id, name, effective_status, creative_thumbnail, creative_type, campaign_id, campaigns(name)')

  const adsById = new Map((ads || []).map((a) => [a.id, a]))

  // Insights in the window
  const { data: insights } = await supabase
    .from('ad_insights')
    .select('ad_id, date, impressions, clicks, spend, conversions, conversion_value')
    .gte('date', since)

  // Aggregate per ad
  interface Agg {
    impressions: number
    clicks: number
    spend: number
    conversions: number
    revenue: number
    days: number
  }
  const perAd = new Map<string, Agg>()
  for (const ins of insights || []) {
    const a = perAd.get(ins.ad_id) || { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0, days: 0 }
    a.impressions += Number(ins.impressions || 0)
    a.clicks += Number(ins.clicks || 0)
    a.spend += Number(ins.spend || 0)
    a.conversions += Number(ins.conversions || 0)
    a.revenue += Number(ins.conversion_value || 0)
    a.days++
    perAd.set(ins.ad_id, a)
  }

  // Build creative rows
  const creatives = [...perAd.entries()]
    .map(([adId, agg]) => {
      const ad = adsById.get(adId)
      const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0
      const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0
      const cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0
      const roas = agg.spend > 0 ? agg.revenue / agg.spend : 0
      return {
        adId: ad?.meta_ad_id || '',
        name: ad?.name || '(unknown)',
        thumbnail: ad?.creative_thumbnail || null,
        status: ad?.effective_status || null,
        campaignName: (ad as { campaigns?: { name?: string } | null })?.campaigns?.name || null,
        impressions: agg.impressions,
        clicks: agg.clicks,
        spend: Number(agg.spend.toFixed(2)),
        revenue: Number(agg.revenue.toFixed(2)),
        conversions: agg.conversions,
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpa: Number(cpa.toFixed(2)),
        roas: Number(roas.toFixed(2)),
      }
    })
    .filter((c) => c.spend > 0) // hide creatives with no spend in this window
    .sort((a, b) => b.roas - a.roas)

  // Top-level KPIs
  const totals = creatives.reduce(
    (acc, c) => {
      acc.spend += c.spend
      acc.revenue += c.revenue
      acc.conversions += c.conversions
      acc.impressions += c.impressions
      acc.clicks += c.clicks
      return acc
    },
    { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 }
  )
  const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0
  const overallCpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0
  const overallCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0

  return NextResponse.json({
    days,
    kpi: {
      spend: Number(totals.spend.toFixed(2)),
      revenue: Number(totals.revenue.toFixed(2)),
      conversions: totals.conversions,
      roas: Number(overallRoas.toFixed(2)),
      cpa: Number(overallCpa.toFixed(2)),
      ctr: Number(overallCtr.toFixed(2)),
      impressions: totals.impressions,
      clicks: totals.clicks,
    },
    creatives,
  })
}
