import { getCampaigns, getCampaignInsights } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

export async function syncCampaigns() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('sync_logs')
    .insert({ source: 'meta_campaigns', status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  let processed = 0
  let created = 0
  let updated = 0

  try {
    const campaignsData = await getCampaigns()

    for (const campaign of campaignsData.data) {
      processed++

      const campaignData = {
        meta_campaign_id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
        lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
        start_date: campaign.start_time?.split('T')[0] || null,
        end_date: campaign.stop_time?.split('T')[0] || null,
        last_synced_at: new Date().toISOString(),
      }

      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('meta_campaign_id', campaign.id)
        .maybeSingle()

      let dbCampaignId: string

      if (existing) {
        await supabase.from('campaigns').update(campaignData).eq('id', existing.id)
        dbCampaignId = existing.id
        updated++
      } else {
        const { data: newCampaign } = await supabase
          .from('campaigns')
          .insert(campaignData)
          .select('id')
          .single()
        dbCampaignId = newCampaign!.id
        created++
      }

      // Sync insights for the last 7 days
      try {
        const insights = await getCampaignInsights(campaign.id, 'last_7d')

        for (const insight of insights.data) {
          const conversions = insight.actions?.find(a => a.action_type === 'purchase')
          const convValue = insight.action_values?.find(a => a.action_type === 'purchase')
          const spend = parseFloat(insight.spend)
          const conversionValue = convValue ? parseFloat(convValue.value) : 0

          const insightData = {
            campaign_id: dbCampaignId,
            date: insight.date_start,
            impressions: parseInt(insight.impressions),
            clicks: parseInt(insight.clicks),
            spend,
            cpc: insight.cpc ? parseFloat(insight.cpc) : null,
            cpm: insight.cpm ? parseFloat(insight.cpm) : null,
            ctr: insight.ctr ? parseFloat(insight.ctr) : null,
            conversions: conversions ? parseInt(conversions.value) : 0,
            conversion_value: conversionValue,
            roas: spend > 0 ? conversionValue / spend : null,
            reach: parseInt(insight.reach),
            frequency: insight.frequency ? parseFloat(insight.frequency) : null,
            cost_per_conversion: conversions && parseInt(conversions.value) > 0
              ? spend / parseInt(conversions.value) : null,
            raw_data: insight,
          }

          await supabase
            .from('campaign_insights')
            .upsert(insightData, { onConflict: 'campaign_id,date' })
        }
      } catch {
        // Individual campaign insights may fail, continue with others
      }
    }

    await supabase.from('sync_logs').update({
      status: 'completed',
      records_processed: processed,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)

    return { processed, created, updated }
  } catch (error) {
    await supabase.from('sync_logs').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', log!.id)
    throw error
  }
}
