-- Supplier-initiated product change requests that require admin approval
CREATE TABLE IF NOT EXISTS public.product_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  product_title TEXT,
  product_image TEXT,
  action TEXT NOT NULL, -- deactivate | activate | remove_variant | add_variant
  payload JSONB DEFAULT '{}'::jsonb, -- { variantId, variant_title, size, price }
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_change_requests_status ON public.product_change_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_product ON public.product_change_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_supplier ON public.product_change_requests(supplier_id);

ALTER TABLE public.product_change_requests ENABLE ROW LEVEL SECURITY;
