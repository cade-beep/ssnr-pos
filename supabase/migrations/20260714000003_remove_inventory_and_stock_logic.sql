-- Migration: Remove Inventory and Stock updates from POS transactions
-- Target: complete_sale, refund_order, and drop inventory-specific triggers/functions

-- 1. Drop manual stock adjustment RPC
DROP FUNCTION IF EXISTS public.adjust_product_stock(VARCHAR, INTEGER, TEXT);

-- 2. Drop product audit triggers and log function
DROP TRIGGER IF EXISTS trg_product_audit ON public.products;
DROP FUNCTION IF EXISTS public.log_product_changes() CASCADE;

-- 3. Drop inventory movements RLS policies and enable default-deny RLS (secures the deprecated table)
DROP POLICY IF EXISTS "inventory_movements_rls_policy" ON public.inventory_movements;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 4. Redefine complete_sale without stock validation or decrement
DROP FUNCTION IF EXISTS public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC);
DROP FUNCTION IF EXISTS public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_idempotency_key VARCHAR,
  p_payment_method VARCHAR,
  p_total_amount NUMERIC,
  p_total_quantity INTEGER,
  p_received_amount NUMERIC,
  p_change NUMERIC,
  p_items JSONB,
  p_global_discount NUMERIC,
  p_subtotal NUMERIC,
  p_item_discount_amount NUMERIC,
  p_cart_discount_percent NUMERIC,
  p_cart_discount_amount NUMERIC,
  p_total_discount NUMERIC,
  p_final_total NUMERIC
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cashier_name VARCHAR(255);
  v_existing_order_id UUID;
  v_order_uuid UUID;
  v_item JSONB;
  v_db_price NUMERIC;
  v_db_active BOOLEAN;
  v_db_name VARCHAR(255);
  v_calculated_total_amount NUMERIC := 0;
  v_calculated_total_quantity INTEGER := 0;
  v_discount_sum NUMERIC;
  v_item_expected_total NUMERIC;
  v_store_id VARCHAR(255);
  v_user_role VARCHAR(50);
BEGIN
  -- 1. Validate Authentication session
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자 세션입니다.';
  END IF;

  -- Fetch user metadata
  SELECT store_id, role INTO v_store_id, v_user_role FROM public.user_roles WHERE user_id = v_user_id;
  IF v_store_id IS NULL THEN
    v_store_id := 'ssnr-pos-9877';
  END IF;

  -- 2. Staff check for discounts
  IF v_user_role = 'Staff' THEN
    IF COALESCE(p_global_discount, 0) > 0 OR COALESCE(p_cart_discount_amount, 0) > 0 THEN
      RAISE EXCEPTION '스태프 권한으로는 전체 할인을 적용하여 결제할 수 없습니다.';
    END IF;

    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
    LOOP
      IF COALESCE((v_item->>'discount')::NUMERIC, 0) > 0 OR COALESCE((v_item->>'discount_percent')::NUMERIC, 0) > 0 THEN
        RAISE EXCEPTION '스태프 권한으로는 개별 상품 할인을 적용하여 결제할 수 없습니다.';
      END IF;
    END LOOP;
  END IF;

  -- 3. Validate Idempotency (prevent duplicate sale requests)
  SELECT id INTO v_existing_order_id FROM public.orders WHERE order_number = p_idempotency_key;
  IF FOUND THEN
    RETURN JSONB_BUILD_OBJECT(
      'success', true,
      'is_duplicate', true,
      'order_id', v_existing_order_id
    );
  END IF;

  -- 4. Retrieve cashier identification
  SELECT COALESCE(raw_user_meta_data->>'name', email, '캐셔') INTO v_cashier_name 
  FROM auth.users WHERE id = v_user_id;

  -- 5. Calculate prices for each item (no stock checks)
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    -- Skip discount metadata rows passed in items payload
    IF v_item->>'product_id' = 'DISCOUNT' OR v_item->>'product_id' = 'GS' THEN
      CONTINUE;
    END IF;

    -- Lock row for update & verify store compatibility
    SELECT price, is_active, name 
    INTO v_db_price, v_db_active, v_db_name
    FROM public.products 
    WHERE id = (v_item->>'product_id') AND store_id = v_store_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '해당 매장에 존재하지 않는 상품 코드가 결제에 포함되었습니다: %', v_item->>'product_id';
    END IF;

    IF NOT v_db_active THEN
      RAISE EXCEPTION '상품 [%]은 현재 활성 판매 상태가 아닙니다.', v_db_name;
    END IF;

    IF (v_item->>'quantity')::INTEGER <= 0 THEN
      RAISE EXCEPTION '상품 [%]의 수량이 유효하지 않습니다.', v_db_name;
    END IF;

    IF (v_item->>'price')::NUMERIC <> v_db_price THEN
      RAISE EXCEPTION '상품 [%]의 가격이 일치하지 않습니다. 최신 가격으로 갱신해 주십시오. (기입가: %, 최신가: %)', 
        v_db_name, v_item->>'price', v_db_price;
    END IF;

    -- Validate discounts
    v_discount_sum := COALESCE((v_item->>'discount')::NUMERIC, 0) * COALESCE((v_item->>'discount_qty')::INTEGER, 0);
    v_item_expected_total := (v_db_price * (v_item->>'quantity')::INTEGER) - v_discount_sum;
    IF v_item_expected_total < 0 THEN
      v_item_expected_total := 0;
    END IF;

    v_calculated_total_quantity := v_calculated_total_quantity + (v_item->>'quantity')::INTEGER;
    v_calculated_total_amount := v_calculated_total_amount + v_item_expected_total;
  END LOOP;

  -- Apply global discount verification
  v_calculated_total_amount := GREATEST(0, v_calculated_total_amount - COALESCE(p_global_discount, 0));
  IF v_calculated_total_amount <> p_total_amount THEN
    RAISE EXCEPTION '결제 최종 청구 금액 검증 실패: 서버 계산액(%)과 클라이언트 전달액(%)이 일치하지 않습니다.', 
      v_calculated_total_amount, p_total_amount;
  END IF;

  -- 6. Insert order record
  INSERT INTO public.orders (
    order_number, payment_date_time, payment_method, total_amount, 
    total_quantity, received_amount, change, cashier_name, store_id,
    subtotal, item_discount_amount, cart_discount_percent, cart_discount_amount,
    total_discount, final_total
  ) VALUES (
    p_idempotency_key, now(), p_payment_method, p_total_amount, 
    p_total_quantity, p_received_amount, p_change, v_cashier_name, v_store_id,
    p_subtotal, p_item_discount_amount, p_cart_discount_percent, p_cart_discount_amount,
    p_total_discount, p_final_total
  ) RETURNING id INTO v_order_uuid;

  -- 7. Insert line items (no stock reduction or inventory movements)
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_name, product_price, quantity,
      discount, discount_qty, is_percent, discount_percent
    ) VALUES (
      v_order_uuid,
      v_item->>'product_id',
      v_item->>'product_name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      COALESCE((v_item->>'discount_qty')::INTEGER, 0),
      COALESCE((v_item->>'is_percent')::BOOLEAN, false),
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0)
    );
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'is_duplicate', false,
    'order_id', v_order_uuid
  );
END;
$$ LANGUAGE plpgsql;

-- 5. Redefine refund_order without stock restore or inventory movements
CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_number VARCHAR,
  p_reason VARCHAR
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order_id UUID;
  v_is_refunded BOOLEAN;
  v_total_amount NUMERIC;
  v_cashier_name VARCHAR(255);
  v_store_id VARCHAR(255);
  v_role VARCHAR(50);
BEGIN
  -- 1. Verify Authentication & Role
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 세션입니다.';
  END IF;

  SELECT store_id, role INTO v_store_id, v_role FROM public.user_roles WHERE user_id = v_user_id;

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '주문 환불 처리 권한이 없습니다. 소유자 권한이 요구됩니다.';
  END IF;

  -- 2. Lock Order row for update & verify store matches
  SELECT id, is_refunded, total_amount 
  INTO v_order_id, v_is_refunded, v_total_amount
  FROM public.orders 
  WHERE order_number = p_order_number AND store_id = v_store_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '환불 처리할 주문 [%]을 데이터베이스에서 찾을 수 없습니다.', p_order_number;
  END IF;

  -- 3. Idempotency Check (prevent double refunds)
  IF v_is_refunded THEN
    RETURN JSONB_BUILD_OBJECT(
      'success', true,
      'already_refunded', true,
      'order_id', v_order_id
    );
  END IF;

  -- 4. Retrieve active user name
  SELECT COALESCE(raw_user_meta_data->>'name', email, '관리자') INTO v_cashier_name 
  FROM auth.users WHERE id = v_user_id;

  -- 5. Mark Order as Refunded (no stock restore or inventory movements)
  UPDATE public.orders
  SET is_refunded = true,
      refunded_at = now(),
      refunded_by = v_cashier_name
  WHERE id = v_order_id;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'already_refunded', false,
    'order_id', v_order_id
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Grant execute permissions to updated functions
GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order(VARCHAR, VARCHAR) TO authenticated;
