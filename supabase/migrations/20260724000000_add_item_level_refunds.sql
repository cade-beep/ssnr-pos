-- Migration: Item-level partial refunds
-- Adds refund tracking to order_items/orders and a new RPC that refunds
-- specific line items instead of only the whole order. Additive only
-- (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION) — no ALTER COLUMN
-- TYPE, so this can't hit the policy-dependency ordering issue that broke
-- 20260714000002 on first run.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;

CREATE OR REPLACE FUNCTION public.refund_order_items(
  p_order_number VARCHAR,
  p_item_ids BIGINT[],
  p_reason VARCHAR
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order_id UUID;
  v_is_refunded BOOLEAN;
  v_cashier_name VARCHAR(255);
  v_store_id VARCHAR(255);
  v_role VARCHAR(50);
  v_item RECORD;
  v_item_net_amount NUMERIC;
  v_newly_refunded_amount NUMERIC := 0;
  v_remaining_unrefunded INTEGER;
BEGIN
  -- 1. Verify Authentication & Role (Owner only, same as full refund_order)
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 세션입니다.';
  END IF;

  SELECT store_id, role INTO v_store_id, v_role FROM public.user_roles WHERE user_id = v_user_id;

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '품목별 환불 처리 권한이 없습니다. 소유자 권한이 요구됩니다.';
  END IF;

  -- 2. Lock the order row & verify store match
  SELECT id, is_refunded INTO v_order_id, v_is_refunded
  FROM public.orders
  WHERE order_number = p_order_number AND store_id = v_store_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '환불 처리할 주문 [%]을 데이터베이스에서 찾을 수 없습니다.', p_order_number;
  END IF;

  IF v_is_refunded THEN
    RAISE EXCEPTION '이미 전체 환불 처리된 주문입니다.';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION '환불할 품목을 하나 이상 선택해 주세요.';
  END IF;

  -- 3. Refund each selected, not-yet-refunded line item (lock rows first)
  FOR v_item IN
    SELECT id, product_price, quantity, discount, discount_qty
    FROM public.order_items
    WHERE order_id = v_order_id AND id = ANY(p_item_ids) AND is_refunded = false
    FOR UPDATE
  LOOP
    v_item_net_amount := GREATEST(0, (v_item.product_price * v_item.quantity) - (COALESCE(v_item.discount, 0) * COALESCE(v_item.discount_qty, 0)));

    UPDATE public.order_items
    SET is_refunded = true,
        refunded_at = now(),
        refunded_amount = v_item_net_amount
    WHERE id = v_item.id;

    v_newly_refunded_amount := v_newly_refunded_amount + v_item_net_amount;
  END LOOP;

  IF v_newly_refunded_amount = 0 THEN
    RAISE EXCEPTION '선택한 품목은 이미 환불되었거나 이 주문에 속하지 않습니다.';
  END IF;

  -- 4. If every line is now refunded, this order is fully refunded
  SELECT COUNT(*) INTO v_remaining_unrefunded
  FROM public.order_items
  WHERE order_id = v_order_id AND is_refunded = false;

  SELECT COALESCE(raw_user_meta_data->>'name', email, '관리자') INTO v_cashier_name
  FROM auth.users WHERE id = v_user_id;

  IF v_remaining_unrefunded = 0 THEN
    UPDATE public.orders
    SET refunded_amount = refunded_amount + v_newly_refunded_amount,
        is_refunded = true,
        refunded_at = now(),
        refunded_by = v_cashier_name
    WHERE id = v_order_id;
  ELSE
    UPDATE public.orders
    SET refunded_amount = refunded_amount + v_newly_refunded_amount
    WHERE id = v_order_id;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'order_id', v_order_id,
    'refunded_amount', v_newly_refunded_amount,
    'fully_refunded', v_remaining_unrefunded = 0
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.refund_order_items(VARCHAR, BIGINT[], VARCHAR) TO authenticated;
