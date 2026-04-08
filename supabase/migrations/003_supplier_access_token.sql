-- Add access_token to suppliers for link-based auth (no username/password needed)
ALTER TABLE public.suppliers
ADD COLUMN access_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Generate tokens for existing suppliers
UPDATE public.suppliers SET access_token = gen_random_uuid() WHERE access_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.suppliers ALTER COLUMN access_token SET NOT NULL;
