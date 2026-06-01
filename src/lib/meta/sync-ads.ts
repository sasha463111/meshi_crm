import { getAds, getAdInsights, type MetaAdInsight } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sync Meta ads (creatives) + their daily insights for the last 30 days into
 * `ads` + `ad_insights`. Limits to ACTIVE / RECENTLY_DELIVERING ads to stay
 * inside Meta's rate limit (account can have thousands of historical ads).
 */
export async function syncAds(): Promise<{ ads: number; insights: number; skipped: number }> {
  const supabase = createAdminClient()
  const allAds = await getAds()
  // Keep ads that delivered recently — drops the long tail of paused/archived ads.
  const live = allAds.filter((a) =>
    ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'].includes(a.effective_status)
  )

  // Build campaign_id → uuid map for FK
  const campaignIds = [...new Set(live.map((a) => a.campaign_id).filter(Boolean))]
  const { data: campaignsRows } = await supabase
    .from('campaigns')
    .select('id, meta_campaign_id')
    .in('meta_campaign_id', campaignIds)
  const campaignMap = new Map<string, string>(
    (campaignsRows || []).map((r) => [r.meta_campaign_id, r.id])
  )

  let adsUpserted = 0
  let insightsUpserted = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const ad of live) {
    const dbCampaignId = campaignMap.get(ad.campaign_id) ?? null
    const adRow = {
      meta_ad_id: ad.id,
      meta_adset_id: ad.adset_id,
      campaign_id: dbCampaignId,
      name: ad.name,
      status: ad.status,
      effective_status: ad.effective_status,
      creative_id: ad.creative?.id ?? null,
      creative_thumbnail: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
      creative_type: ad.creative?.object_type ?? null,
      updated_at: now,
      last_synced_at: now,
    }

    const { data: upserted, error: upsertErr } = await supabase
      .from('ads')
      .upsert(adRow, { onConflict: 'meta_ad_id' })
      .select('id')
      .single()
    if (upsertErr || !upserted) {
      skipped++
      continue
    }
    adsUpserted++

    // Per-ad daily insights (last 30 days)
    try {
      const ins = await getAdInsights(ad.id, 'last_30d')
      for (const row of ins.data) {
        const conv = row.actions?.find((a) => a.action_type === 'purchase')
        const convVal = row.action_values?.find((a) => a.action_type === 'purchase')
        const spend = parseFloat(row.spend || '0')
        const conversionValue = convVal ? parseFloat(convVal.value) : 0
        const conversions = conv ? parseInt(conv.value) : 0
        const insightRow = {
          ad_id: upserted.id,
          date: row.date_start,
          impressions: parseInt(row.impressions || '0'),
          clicks: parseInt(row.clicks || '0'),
          spend,
          cpc: row.cpc ? parseFloat(row.cpc) : null,
          cpm: row.cpm ? parseFloat(row.cpm) : null,
          ctr: row.ctr ? parseFloat(row.ctr) : null,
          conversions,
          conversion_value: conversionValue,
          roas: spend > 0 ? conversionValue / spend : null,
          reach: row.reach ? parseInt(row.reach) : 0,
          frequency: row.frequency ? parseFloat(row.frequency) : null,
          cost_per_conversion: conversions > 0 ? spend / conversions : null,
          raw_data: row as unknown as Record<string, unknown>,
        }
        const { error } = await supabase
          .from('ad_insights')
          .upsert(insightRow, { onConflict: 'ad_id,date' })
        if (!error) insightsUpserted++
      }
    } catch (e) {
      // Don't abort the whole sync if one ad's insights call fails
      console.warn('Ad insights failed for', ad.id, (e as Error).message)
    }
  }

  return { ads: adsUpserted, insights: insightsUpserted, skipped }
}
