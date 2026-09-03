-- Migration: record where a sale happened, and log bread arrivals / carry-overs.
--
-- Stock is never stored as a running number. It is worked out on the fly:
--   정상 재고 = 입고 합계 − 이월 합계 − 정상가 판매 수량
--   할인 재고 = 이월 합계 − 30% 할인 판매 수량
-- so a refund or a corrected entry fixes the stock by itself and the two numbers
-- can never drift apart the way a stored counter does.

-- 1. Which stand a sale belongs to. The POS device is set once and tags every
--    sale from then on, so the 판매지 workbook knows which sheet to fill.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS location VARCHAR(50) NOT NULL DEFAULT '서산나래';

CREATE INDEX IF NOT EXISTS idx_orders_location_time
  ON public.orders (store_id, location, payment_date_time DESC);

-- 2. Every movement of bread that is not a sale.
--    kind='arrival'   빵이 나옴          → 정상 바구니 +quantity
--    kind='carryover' 3시에 넘김          → 정상 −quantity, 할인 +quantity
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877',
  location VARCHAR(50) NOT NULL DEFAULT '서산나래',
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('arrival', 'carryover')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note VARCHAR(255),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The stock query always filters by store + stand + a time window (15:00 to 15:00)
CREATE INDEX IF NOT EXISTS idx_stock_movements_lookup
  ON public.stock_movements (store_id, location, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements (product_id, occurred_at DESC);

-- 3. Store isolation, same as every other table here.
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (store_id = public.get_user_store_id());

-- Deleting a mistyped entry is the only way to correct one, since quantity is
-- always positive. Still scoped to the caller's own store.
DROP POLICY IF EXISTS "stock_movements_delete" ON public.stock_movements;
CREATE POLICY "stock_movements_delete" ON public.stock_movements
  FOR DELETE TO authenticated
  USING (store_id = public.get_user_store_id());

GRANT SELECT, INSERT, DELETE ON public.stock_movements TO authenticated;
