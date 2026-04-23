-- Product Submissions from suppliers (pending admin approval → Shopify)
CREATE TABLE IF NOT EXISTS public.product_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2),
  cost_price NUMERIC(10,2),
  sku TEXT,
  variants JSONB DEFAULT '[]'::jsonb, -- e.g. [{title: "1.80", inventory: 10}, {title: "1.60", inventory: 5}]
  image_urls TEXT[] DEFAULT ARRAY[]::TEXT[], -- Supabase Storage URLs
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  rejection_reason TEXT,
  shopify_product_id TEXT, -- set after Shopify creation
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_product_submissions_status ON public.product_submissions(status);
CREATE INDEX IF NOT EXISTS idx_product_submissions_supplier ON public.product_submissions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_submissions_created ON public.product_submissions(created_at DESC);

-- Enable RLS (we access via service role from API routes)
ALTER TABLE public.product_submissions ENABLE ROW LEVEL SECURITY;

-- Supabase Storage bucket for submission images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-submissions', 'product-submissions', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on submission images (they're not sensitive once uploaded)
CREATE POLICY IF NOT EXISTS "Public read submission images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-submissions');

-- Allow service role to upload (we proxy uploads through our API)
CREATE POLICY IF NOT EXISTS "Service role upload submission images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-submissions');
