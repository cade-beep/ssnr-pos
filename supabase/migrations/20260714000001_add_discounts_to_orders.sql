-- Migration: Add discount columns to orders table and update complete_sale function

-- 1. Add new columns to public.orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_discount_amount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_discount_percent NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_discount_amount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_total NUMERIC DEFAULT 0;

-- 2. Update existing rows in orders table to calculate defaults
UPDATE public.orders
SET subtotal = COALESCE(subtotal, total_amount),
    final_total = COALESCE(final_total, total_amount)
WHERE subtotal IS NULL OR subtotal = 0;

-- 3. Drop existing complete_sale function and recreate with updated columns
DROP FUNCTION IF EXISTS public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_idempotency_key VARCHAR,
  p_payment_method VARCHAR,
  p_total_amount NUMERIC,
  p_total_quantity INTEGER,
  p_received_amount NUMERIC,
  p_change NUMERIC,
  p_items JSONB,
  p_global_discount NUMERIC,
  p_subtotal NUMERIC DEFAULT 0,
  p_item_discount_amount NUMERIC DEFAULT 0,
  p_cart_discount_percent NUMERIC DEFAULT 0,
  p_cart_discount_amount NUMERIC DEFAULT 0,
  p_total_discount NUMERIC DEFAULT 0,
  p_final_total NUMERIC DEFAULT 0
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
  v_db_stock INTEGER;
  v_db_active BOOLEAN;
  v_db_name VARCHAR(255);
  v_calculated_total_amount NUMERIC := 0;
  v_calculated_total_quantity INTEGER := 0;
  v_discount_sum NUMERIC;
  v_item_expected_total NUMERIC;
BEGIN
  -- 1. Validate Authentication session
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자 세션입니다.';
  END IF;

  -- 2. Validate Idempotency (prevent duplicate sale requests)
  SELECT id INTO v_existing_order_id FROM public.orders WHERE order_number = p_idempotency_key;
  IF FOUND THEN
    RETURN JSONB_BUILD_OBJECT(
      'success', true,
      'is_duplicate', true,
      'order_id', v_existing_order_id
    );
  END IF;

  -- 3. Retrieve cashier identification
  SELECT COALESCE(raw_user_meta_data->>'name', email, '캐셔') INTO v_cashier_name 
  FROM auth.users WHERE id = v_user_id;

  -- 4. Calculate prices and lock stock for each item
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    -- Skip discount metadata rows passed in items payload
    IF v_item->>'product_id' = 'DISCOUNT' OR v_item->>'product_id' = 'GS' THEN
      CONTINUE;
    END IF;

    -- Lock row for update
    SELECT price, stock, is_active, name 
    INTO v_db_price, v_db_stock, v_db_active, v_db_name
    FROM public.products 
    WHERE id = (v_item->>'product_id') FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '존재하지 않는 상품 코드가 결제에 포함되었습니다: %', v_item->>'product_id';
    END IF;

    IF NOT v_db_active THEN
      RAISE EXCEPTION '상품 [%]은 현재 활성 판매 상태가 아닙니다.', v_db_name;
    END IF;

    IF (v_item->>'quantity')::INTEGER <= 0 THEN
      RAISE EXCEPTION '상품 [%]의 수량이 유효하지 않습니다.', v_db_name;
    END IF;

    IF v_db_stock < (v_item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION '상품 [%]의 재고가 부족하여 결제할 수 없습니다. (현재 재고: %개, 구매 수량: %개)', 
        v_db_name, v_db_stock, v_item->>'quantity';
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

  -- 5. Insert order record
  INSERT INTO public.orders (
    order_number, payment_date_time, payment_method, total_amount, 
    total_quantity, received_amount, change, cashier_name,
    subtotal, item_discount_amount, cart_discount_percent, cart_discount_amount, total_discount, final_total
  ) VALUES (
    p_idempotency_key, now(), p_payment_method, p_total_amount, 
    p_total_quantity, p_received_amount, p_change, v_cashier_name,
    p_subtotal, p_item_discount_amount, p_cart_discount_percent, p_cart_discount_amount, p_total_discount, p_final_total
  ) RETURNING id INTO v_order_uuid;

  -- 6. Insert line items, decrement stock, and log inventory movements
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

    IF v_item->>'product_id' <> 'DISCOUNT' AND v_item->>'product_id' <> 'GS' THEN
      -- Decrement stock directly inside locked loop
      UPDATE public.products 
      SET stock = stock - (v_item->>'quantity')::INTEGER 
      WHERE id = (v_item->>'product_id');

      -- Insert inventory movement log
      INSERT INTO public.inventory_movements (
        product_id, delta_quantity, movement_type, reason, order_id, actor_user_id
      ) VALUES (
        v_item->>'product_id',
        -((v_item->>'quantity')::INTEGER),
        'SALE',
        '상품 주문 출고 (주문번호: ' || p_idempotency_key || ')',
        v_order_uuid,
        v_user_id
      );
    END IF;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'is_duplicate', false,
    'order_id', v_order_uuid
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Grant execution permissions on the updated function
REVOKE EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
