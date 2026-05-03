-- Audit log for every internal_status change on order_items
CREATE TABLE IF NOT EXISTS public.order_item_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_supplier_id UUID REFERENCES public.suppliers(id),
  changed_by_user_id UUID REFERENCES auth.users(id),
  source TEXT NOT NULL DEFAULT 'supplier', -- 'supplier' | 'admin' | 'system'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_logs_item ON public.order_item_status_logs(order_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_logs_order ON public.order_item_status_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_logs_supplier ON public.order_item_status_logs(changed_by_supplier_id, created_at DESC);

ALTER TABLE public.order_item_status_logs ENABLE ROW LEVEL SECURITY;
