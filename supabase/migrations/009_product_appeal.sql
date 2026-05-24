-- Appeal rating for products: how desirable the design looks vs. proven best-sellers.
-- Used to decide what to feature/promote (NOT pricing — all bed-sheet sets are ₪79).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS appeal_score INTEGER,   -- 1..10 (10 = looks most like a top-seller)
  ADD COLUMN IF NOT EXISTS appeal_reason TEXT;      -- short Hebrew explanation
