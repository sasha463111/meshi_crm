const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!
const API_VERSION = 'v21.0'

export async function metaApiRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${endpoint}`)
  url.searchParams.set('access_token', META_ACCESS_TOKEN)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())

  if (!res.ok) {
    const error = await res.json()
    throw new Error(`Meta API error: ${JSON.stringify(error)}`)
  }

  return res.json()
}

export async function getCampaigns() {
  return metaApiRequest<{
    data: {
      id: string
      name: string
      status: string
      objective: string
      daily_budget: string
      lifetime_budget: string
      start_time: string
      stop_time: string
    }[]
  }>(`${META_AD_ACCOUNT_ID}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
    limit: '100',
  })
}

export async function getCampaignInsights(campaignId: string, datePreset = 'last_7d') {
  return metaApiRequest<{
    data: {
      date_start: string
      date_stop: string
      impressions: string
      clicks: string
      spend: string
      cpc: string
      cpm: string
      ctr: string
      actions?: { action_type: string; value: string }[]
      action_values?: { action_type: string; value: string }[]
      reach: string
      frequency: string
    }[]
  }>(`${campaignId}/insights`, {
    fields: 'impressions,clicks,spend,cpc,cpm,ctr,actions,action_values,reach,frequency',
    time_increment: '1',
    date_preset: datePreset,
  })
}

export interface MetaAd {
  id: string
  name: string
  status: string
  effective_status: string
  adset_id: string
  campaign_id: string
  creative?: {
    id: string
    thumbnail_url?: string
    object_type?: string
    image_url?: string
  }
}

export interface MetaAdInsight {
  date_start: string
  date_stop: string
  impressions: string
  clicks: string
  spend: string
  cpc?: string
  cpm?: string
  ctr?: string
  reach?: string
  frequency?: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
}

/** All ads in the account (paginated). Includes effective_status so we can filter live ads. */
export async function getAds(): Promise<MetaAd[]> {
  const out: MetaAd[] = []
  let url = new URL(
    `https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/ads`
  )
  url.searchParams.set('access_token', META_ACCESS_TOKEN)
  url.searchParams.set(
    'fields',
    'id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,image_url,object_type}'
  )
  url.searchParams.set('limit', '100')
  let pageUrl: string | null = url.toString()
  while (pageUrl) {
    const res = await fetch(pageUrl)
    if (!res.ok) throw new Error(`getAds error: ${await res.text()}`)
    const json: { data: MetaAd[]; paging?: { next?: string } } = await res.json()
    out.push(...(json.data || []))
    pageUrl = json.paging?.next || null
  }
  return out
}

/** Daily insights for a single ad. */
export async function getAdInsights(adId: string, datePreset = 'last_30d') {
  return metaApiRequest<{ data: MetaAdInsight[] }>(`${adId}/insights`, {
    fields: 'impressions,clicks,spend,cpc,cpm,ctr,actions,action_values,reach,frequency',
    time_increment: '1',
    date_preset: datePreset,
  })
}

export { META_AD_ACCOUNT_ID }
