-- Migration: Harden complete_sale — discount ceiling + duplicate-payment race fix
--
-- 1. v_calculated_total_amount := GREATEST(0, ... - p_global_discount) silently floored an
--    over-sized discount to a 0-won charge with no error. Add an explicit ceiling check.
-- 2. The pre-insert duplicate check (SELECT ... IF FOUND) has a TOCTOU race under concurrent
--    calls; orders.order_number is UNIQUE so a double-click can't double-charge, but the second
--    request surfaced a raw Postgres unique-violation error instead of the friendly is_duplicate
--    response. Wrap the insert so that specific error is caught and normalized.

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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자 세션입니다.';
  END IF;

  SELECT store_id, role INTO v_store_id, v_user_role FROM public.user_roles WHERE user_id = v_user_id;
  IF v_store_id IS NULL THEN
    v_store_id := 'ssnr-pos-9877';
  END IF;

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

  SELECT id INTO v_existing_order_id FROM public.orders WHERE order_number = p_idempotency_key;
  IF FOUND THEN
    RETURN JSONB_BUILD_OBJECT(
      'success', true,
      'is_duplicate', true,
      'order_id', v_existing_order_id
    );
  END IF;

  SELECT COALESCE(raw_user_meta_data->>'name', email, '캐셔') INTO v_cashier_name
  FROM auth.users WHERE id = v_user_id;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    IF v_item->>'product_id' = 'DISCOUNT' OR v_item->>'product_id' = 'GS' THEN
      CONTINUE;
    END IF;

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

    v_discount_sum := COALESCE((v_item->>'discount')::NUMERIC, 0) * COALESCE((v_item->>'discount_qty')::INTEGER, 0);
    v_item_expected_total := (v_db_price * (v_item->>'quantity')::INTEGER) - v_discount_sum;
    IF v_item_expected_total < 0 THEN
      v_item_expected_total := 0;
    END IF;

    v_calculated_total_quantity := v_calculated_total_quantity + (v_item->>'quantity')::INTEGER;
    v_calculated_total_amount := v_calculated_total_amount + v_item_expected_total;
  END LOOP;

  -- New: reject an over-sized cart discount instead of silently flooring it to 0.
  IF COALESCE(p_global_discount, 0) > v_calculated_total_amount THEN
    RAISE EXCEPTION '전체 할인 금액(%)이 상품 합계(%)를 초과할 수 없습니다.', p_global_discount, v_calculated_total_amount;
  END IF;

  v_calculated_total_amount := GREATEST(0, v_calculated_total_amount - COALESCE(p_global_discount, 0));
  IF v_calculated_total_amount <> p_total_amount THEN
    RAISE EXCEPTION '결제 최종 청구 금액 검증 실패: 서버 계산액(%)과 클라이언트 전달액(%)이 일치하지 않습니다.',
      v_calculated_total_amount, p_total_amount;
  END IF;

  -- New: catch a racing duplicate insert (two near-simultaneous submits past the check above)
  -- and normalize it to the same friendly is_duplicate response instead of a raw constraint error.
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_existing_order_id FROM public.orders WHERE order_number = p_idempotency_key;
    IF FOUND THEN
      RETURN JSONB_BUILD_OBJECT(
        'success', true,
        'is_duplicate', true,
        'order_id', v_existing_order_id
      );
    ELSE
      RAISE;
    END IF;
  END;

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

GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
