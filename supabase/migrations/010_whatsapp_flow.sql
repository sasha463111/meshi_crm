-- WhatsApp automation flow engine: a scheduled job queue.
CREATE TABLE IF NOT EXISTS public.whatsapp_flow_jobs (
  id uuid primary key default gen_random_uuid(),
  flow text not null,                  -- 'abandoned_cart' | 'order_update' | 'winback'
  step int not null default 1,
  phone text not null,                 -- normalised E.164 digits (e.g. 972526059554)
  content text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending', -- pending | sent | cancelled | failed
  ref_type text,                       -- 'checkout' | 'order' | 'customer'
  ref_id text,
  dedup_key text unique,               -- prevents enqueuing the same step twice
  evolution_message_id text,
  error text,
  created_at timestamptz default now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wflow_due ON public.whatsapp_flow_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_wflow_phone ON public.whatsapp_flow_jobs (phone, status);
CREATE INDEX IF NOT EXISTS idx_wflow_ref ON public.whatsapp_flow_jobs (ref_type, ref_id);

-- Safety switches (default OFF so nothing sends to real customers until enabled).
INSERT INTO public.app_settings (key, value, description)
VALUES
  ('whatsapp_flow_enabled', 'false', 'Master switch for WhatsApp automation flows'),
  ('whatsapp_flow_test_phone', '', 'If set, ALL flow messages go only to this number (test mode)')
ON CONFLICT (key) DO NOTHING;
