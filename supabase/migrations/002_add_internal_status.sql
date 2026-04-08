-- Add internal_status to order_items for supplier portal
-- This is independent of Shopify fulfillment_status
ALTER TABLE public.order_items
ADD COLUMN internal_status TEXT DEFAULT 'pending';

-- Create index for filtering by internal_status
CREATE INDEX idx_order_items_internal_status ON public.order_items(internal_status);

-- Possible values: 'pending' (ממתין), 'packed' (נארז), 'shipped' (נשלח), 'delivered' (נמסר)
COMMENT ON COLUMN public.order_items.internal_status IS 'Internal status for supplier portal, independent of Shopify. Values: pending, packed, shipped, delivered';
