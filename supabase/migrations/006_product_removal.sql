-- Allow suppliers to flag products for removal from the store
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS removal_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS removal_requested_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS removal_requested_by UUID REFERENCES public.suppliers(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS removal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_products_removal_requested ON public.products(removal_requested) WHERE removal_requested = true;
