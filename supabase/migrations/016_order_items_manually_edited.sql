-- Flag rows that an admin manually changed in the portal so the daily Shopify
-- sync stops overwriting them. Set by admin tools when editing variant/size,
-- quantity, etc. for a specific order.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manually_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manually_edited_note TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_manually_edited
  ON public.order_items(manually_edited)
  WHERE manually_edited = TRUE;
