-- Cheetah / Run ERP tracking columns on orders.
-- ship_no is the 8-digit Cheetah shipment number entered by the supplier when
-- marking items as shipped (or auto-saved when shipping via the Shopify
-- fulfillment dialog with carrier=cheetah). The polling cron reads these.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cheetah_ship_no TEXT,
  ADD COLUMN IF NOT EXISTS cheetah_status_code INT,
  ADD COLUMN IF NOT EXISTS cheetah_status_desc TEXT,
  ADD COLUMN IF NOT EXISTS cheetah_random_id TEXT,
  ADD COLUMN IF NOT EXISTS cheetah_last_polled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_msg_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_msg_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_cheetah_ship_no
  ON orders(cheetah_ship_no) WHERE cheetah_ship_no IS NOT NULL;

-- order_update WhatsApp templates added in DB:
--   step 3 = "tracking sent" (placeholders {שם} {הזמנה} {מעקב})
--   step 4 = "delivered + feedback request"
