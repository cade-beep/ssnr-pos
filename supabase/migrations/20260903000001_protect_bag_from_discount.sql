-- Migration: '봉투' is a pass-through charge and is never discounted.
--
-- The client already refuses to discount it, but the client is not trusted with
-- money here: complete_sale re-checks it. Two rules are added to the sale path.
--   1. A 봉투 line carrying an item discount is rejected outright.
--   2. The cart-wide discount may not exceed the total MINUS every 봉투 line, so
--      even a 100% cart discount still leaves the 봉투 charged in full.
--
-- ponytail: the protected product is matched by name. If more products ever need
-- this, add a products.discountable BOOLEAN column and read that instead.

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
  v_protected_total NUMERIC := 0;
  v_discountable_total NUMERIC;
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

  -- All store employees (Owner and Staff) can apply discounts on sales.

  SELECT id INTO v_existing_order_id FROM public.orders WHERE order_number = p_idempotency_key;
  IF FOUND THEN
    RETURN JSONB_BUILD_OBJECT('success', true, 'is_duplicate', true, 'order_id', v_existing_order_id);
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

    -- 봉투: no item discount, and its amount is held back from the cart discount below
    IF trim(v_db_name) = '봉투' THEN
      IF v_discount_sum > 0 THEN
        RAISE EXCEPTION '[%]은(는) 할인 대상 상품이 아닙니다. 할인을 해제한 뒤 다시 결제해 주십시오.', v_db_name;
      END IF;
      v_protected_total := v_protected_total + v_item_expected_total;
    END IF;

    v_calculated_total_quantity := v_calculated_total_quantity + (v_item->>'quantity')::INTEGER;
    v_calculated_total_amount := v_calculated_total_amount + v_item_expected_total;
  END LOOP;

  v_discountable_total := GREATEST(0, v_calculated_total_amount - v_protected_total);

  IF COALESCE(p_global_discount, 0) > v_discountable_total THEN
    RAISE EXCEPTION '전체 할인 금액(%)이 할인 가능 금액(%)을 초과할 수 없습니다. 봉투 값은 할인되지 않습니다.',
      p_global_discount, v_discountable_total;
  END IF;

  v_calculated_total_amount := GREATEST(0, v_calculated_total_amount - COALESCE(p_global_discount, 0));
  IF v_calculated_total_amount <> p_total_amount THEN
    RAISE EXCEPTION '결제 최종 청구 금액 검증 실패: 서버 계산액(%)과 클라이언트 전달액(%)이 일치하지 않습니다.',
      v_calculated_total_amount, p_total_amount;
  END IF;

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
      RETURN JSONB_BUILD_OBJECT('success', true, 'is_duplicate', true, 'order_id', v_existing_order_id);
    ELSE
      RAISE;
    END IF;
  END;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_name, product_price, quantity,
      discount, discount_qty, is_percent, discount_percent, line_total
    ) VALUES (
      v_order_uuid,
      v_item->>'product_id',
      v_item->>'product_name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      COALESCE((v_item->>'discount_qty')::INTEGER, 0),
      COALESCE((v_item->>'is_percent')::BOOLEAN, false),
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      COALESCE((v_item->>'line_total')::NUMERIC, (v_item->>'price')::NUMERIC * (v_item->>'quantity')::INTEGER)
    );
  END LOOP;

  RETURN JSONB_BUILD_OBJECT('success', true, 'is_duplicate', false, 'order_id', v_order_uuid);
END;
$$ LANGUAGE plpgsql;
