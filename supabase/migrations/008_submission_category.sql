-- Category (Shopify product type) chosen by the supplier on submission
ALTER TABLE public.product_submissions ADD COLUMN IF NOT EXISTS category TEXT;
