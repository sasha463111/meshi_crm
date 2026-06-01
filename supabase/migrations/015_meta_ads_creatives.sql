-- Per-ad (creative) data from Meta + daily insights for the marketing dashboard.
CREATE TABLE IF NOT EXISTS public.ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_id TEXT UNIQUE NOT NULL,
  meta_adset_id TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT,
  effective_status TEXT,
  creative_id TEXT,
  creative_thumbnail TEXT,
  creative_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ads_campaign ON public.ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON public.ads(effective_status);

CREATE TABLE IF NOT EXISTS public.ad_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend NUMERIC(10,2) DEFAULT 0,
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  ctr NUMERIC(10,4),
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(10,2) DEFAULT 0,
  roas NUMERIC(10,4),
  reach INTEGER DEFAULT 0,
  frequency NUMERIC(10,4),
  cost_per_conversion NUMERIC(10,4),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_insights_date ON public.ad_insights(date);
CREATE INDEX IF NOT EXISTS idx_ad_insights_ad ON public.ad_insights(ad_id);
