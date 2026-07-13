-- Migration: Secure RLS, Role Authorization, Check Constraints, and Atomic Transaction RPCs

-- 1. Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('관리자', '캐셔')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing public permissive policies on business tables to prevent unauthorized write access
DROP POLICY IF EXISTS "Allow public select from products" ON public.products;
DROP POLICY IF EXISTS "Allow public all to products" ON public.products;
DROP POLICY IF EXISTS "Allow public select from closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "Allow public insert to closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "Allow public update to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public select from orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public select from order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public insert to order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow auth users read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow admin manage roles" ON public.user_roles;

-- Enable RLS on all key business tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_reports ENABLE ROW LEVEL SECURITY;

-- 2. Helper authorization functions
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS VARCHAR(50) SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id;
  RETURN COALESCE(v_role, '캐셔');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.get_user_role(p_user_id) = '관리자';
END;
$$ LANGUAGE plpgsql;

-- 3. Policies for user_roles
CREATE POLICY "Allow authenticated select user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin all user_roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Trigger to auto-assign roles based on metadata or standard email flags
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50) := '캐셔';
BEGIN
  IF NEW.email = 'rbflrbgh@ssnr-pos.com' OR NEW.email LIKE 'admin%' OR NEW.raw_user_meta_data->>'role' = '관리자' THEN
    v_role := '관리자';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed existing auth users into user_roles table defensively
INSERT INTO public.user_roles (user_id, role)
SELECT 
  id, 
  CASE 
    WHEN email = 'rbflrbgh@ssnr-pos.com' OR email LIKE 'admin%' OR raw_user_meta_data->>'role' = '관리자' THEN '관리자'::varchar 
    ELSE '캐셔'::varchar 
  END
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 4. Explicit minimum permission RLS policies for business tables

-- Products table: Authenticated users can read. Admins can perform CRUD.
CREATE POLICY "Allow authenticated read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin CRUD products" ON public.products
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Orders table: Authenticated cashiers and admins can read orders. Direct inserts are blocked.
CREATE POLICY "Allow authenticated read orders" ON public.orders
  FOR SELECT TO authenticated USING (true);

-- Order Items table: Authenticated users can read order items. Direct inserts are blocked.
CREATE POLICY "Allow authenticated read order_items" ON public.order_items
  FOR SELECT TO authenticated USING (true);

-- Closing Reports table: Authenticated users can read reports. Admin can insert.
CREATE POLICY "Allow authenticated read closing_reports" ON public.closing_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert closing_reports" ON public.closing_reports
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- 5. Database Integrity Constraints (Negative inventory check)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products WHERE stock < 0) THEN
    RAISE EXCEPTION '기존 상품 재고에 음수값이 존재하여 마이그레이션을 진행할 수 없습니다. 수동 데이터 정정을 진행해 주십시오.';
  END IF;
END $$;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_check;
ALTER TABLE public.products ADD CONSTRAINT products_stock_check CHECK (stock >= 0);

-- Barcode Uniqueness check (allows empty/NULL fields, checks valid entries)
DO $$
BEGIN
  IF EXISTS (
    SELECT barcode FROM public.products 
    WHERE barcode IS NOT NULL AND barcode <> '' 
    GROUP BY barcode HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '기존 상품 데이터 중 중복된 바코드가 존재하여 마이그레이션을 진행할 수 없습니다.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.products_barcode_unique_idx;
CREATE UNIQUE INDEX products_barcode_unique_idx ON public.products (barcode) WHERE (barcode IS NOT NULL AND barcode <> '');

-- 6. Audit logs and inventory movements tables
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id VARCHAR REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  delta_quantity INTEGER NOT NULL,
  movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('SALE', 'REFUND', 'ADJUSTMENT')),
  reason TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS public.product_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'MANUAL_ADJUSTMENT')),
  product_id VARCHAR NOT NULL,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on audit tables
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for audit tables (Authenticated users read movements, only admin reads change audit logs)
CREATE POLICY "Allow auth read inventory_movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin read product_audit_logs" ON public.product_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Product Master Data modification trigger
CREATE OR REPLACE FUNCTION public.log_product_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, after_data)
    VALUES (auth.uid(), 'CREATE', NEW.id, ROW_TO_JSONB(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, before_data, after_data)
    VALUES (auth.uid(), 'UPDATE', NEW.id, ROW_TO_JSONB(OLD), ROW_TO_JSONB(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, before_data)
    VALUES (auth.uid(), 'DELETE', OLD.id, ROW_TO_JSONB(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_product_audit ON public.products;
CREATE TRIGGER trg_product_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_changes();

-- 7. Complete Sale RPC: Atomic checkout transaction
CREATE OR REPLACE FUNCTION public.complete_sale(
  p_idempotency_key VARCHAR,
  p_payment_method VARCHAR,
  p_total_amount NUMERIC,
  p_total_quantity INTEGER,
  p_received_amount NUMERIC,
  p_change NUMERIC,
  p_items JSONB,
  p_global_discount NUMERIC
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
    total_quantity, received_amount, change, cashier_name
  ) VALUES (
    p_idempotency_key, now(), p_payment_method, p_total_amount, 
    p_total_quantity, p_received_amount, p_change, v_cashier_name
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

-- 8. Refund Order RPC: Atomic refund reversal transaction
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
  v_item RECORD;
BEGIN
  -- 1. Verify Authentication & Admin Role
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 세션입니다.';
  END IF;

  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION '주문 환불 처리 권한이 없습니다. 관리자 권한이 요구됩니다.';
  END IF;

  -- 2. Lock Order row for update
  SELECT id, is_refunded, total_amount 
  INTO v_order_id, v_is_refunded, v_total_amount
  FROM public.orders 
  WHERE order_number = p_order_number FOR UPDATE;

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

  -- 4. Retrieve active admin name
  SELECT COALESCE(raw_user_meta_data->>'name', email, '관리자') INTO v_cashier_name 
  FROM auth.users WHERE id = v_user_id;

  -- 5. Mark Order as Refunded
  UPDATE public.orders
  SET is_refunded = true,
      refunded_at = now(),
      refunded_by = v_cashier_name
  WHERE id = v_order_id;

  -- 6. Loop through order items and restore stock and log movement
  FOR v_item IN 
    SELECT product_id, quantity, product_name 
    FROM public.order_items 
    WHERE order_id = v_order_id
  LOOP
    IF v_item.product_id = 'DISCOUNT' OR v_item.product_id = 'GS' THEN
      CONTINUE;
    END IF;

    -- Increment stock back
    UPDATE public.products
    SET stock = stock + v_item.quantity
    WHERE id = v_item.product_id;

    -- Record movement
    INSERT INTO public.inventory_movements (
      product_id, delta_quantity, movement_type, reason, order_id, actor_user_id
    ) VALUES (
      v_item.product_id,
      v_item.quantity,
      'REFUND',
      '주문 환불 입고 (사유: ' || COALESCE(p_reason, '미기입') || ')',
      v_order_id,
      v_user_id
    );
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'already_refunded', false,
    'order_id', v_order_id
  );
END;
$$ LANGUAGE plpgsql;

-- 9. Manual product stock adjustment RPC
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id VARCHAR,
  p_amount INTEGER,
  p_reason TEXT
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- Verify Authentication and Admin Role
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자 세션입니다.';
  END IF;
  
  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION '수동 재고 조정 권한이 없습니다. 관리자 권한이 필요합니다.';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION '변경 수량은 0이 아닌 유효한 값이어야 합니다.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION '수동 재고 조정 시에는 사유 기입이 의무화되어 있습니다.';
  END IF;

  -- Lock row and update
  SELECT stock INTO v_old_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '상품 정보를 데이터베이스에서 찾을 수 없습니다: %', p_product_id;
  END IF;

  v_new_stock := v_old_stock + p_amount;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION '재고를 음수값으로 변경할 수 없습니다. (현재 재고: %개, 감소량: %개)', v_old_stock, ABS(p_amount);
  END IF;

  -- Update product stock
  UPDATE public.products
  SET stock = v_new_stock
  WHERE id = p_product_id;

  -- Insert inventory movement
  INSERT INTO public.inventory_movements (
    product_id, delta_quantity, movement_type, reason, actor_user_id
  ) VALUES (
    p_product_id, p_amount, 'ADJUSTMENT', p_reason, v_user_id
  );

  -- Log action in audit log
  INSERT INTO public.product_audit_logs (
    actor_user_id, action, product_id, before_data, after_data, reason
  ) VALUES (
    v_user_id, 'MANUAL_ADJUSTMENT', p_product_id, 
    JSONB_BUILD_OBJECT('stock', v_old_stock), 
    JSONB_BUILD_OBJECT('stock', v_new_stock), 
    p_reason
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 10. Restrict execute rights on safe RPCs to authenticated roles only
REVOKE EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC) FROM public;
REVOKE EXECUTE ON FUNCTION public.refund_order(VARCHAR, VARCHAR) FROM public;
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(VARCHAR, INTEGER, TEXT) FROM public;

GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(VARCHAR, INTEGER, TEXT) TO authenticated;
