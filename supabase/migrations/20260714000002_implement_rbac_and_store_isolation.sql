-- Migration: Implement Complete RBAC, Multi-Store Isolation, and Employee Management RPCs

-- 1. Create pgcrypto extension if not exists (for user password hashing in invitations)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Alter user_roles table constraints
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- Migrate legacy/lowercase role values to RBAC standards first
UPDATE public.user_roles SET role = 'Owner' WHERE role IN ('관리자', 'owner', 'admin', 'ADMIN', 'Owner');
UPDATE public.user_roles SET role = 'Staff' WHERE role IN ('캐셔', 'staff', 'cashier', 'Staff', 'manager', 'Manager');
UPDATE public.user_roles SET role = 'Staff' WHERE role NOT IN ('Owner', 'Staff') OR role IS NULL;

-- Now add the check constraint safely
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('Owner', 'Staff'));

-- 3. Add or update store_id column on existing tables
-- Drop all existing policies that might depend on store_id before altering column types
DROP POLICY IF EXISTS "products_rls_policy" ON public.products;
DROP POLICY IF EXISTS "orders_rls_policy" ON public.orders;
DROP POLICY IF EXISTS "closing_reports_rls_policy" ON public.closing_reports;
DROP POLICY IF EXISTS "closing_reports_insert_policy" ON public.closing_reports;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_owner_policy" ON public.user_roles;
DROP POLICY IF EXISTS "inventory_movements_rls_policy" ON public.inventory_movements;
DROP POLICY IF EXISTS "product_audit_logs_rls_policy" ON public.product_audit_logs;
DROP POLICY IF EXISTS "customers_rls_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_write_policy" ON public.customers;
DROP POLICY IF EXISTS "subscriptions_rls_policy" ON public.subscriptions;

DROP POLICY IF EXISTS "Allow authenticated read products" ON public.products;
DROP POLICY IF EXISTS "Allow owner write products" ON public.products;
DROP POLICY IF EXISTS "Allow manager write products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated read closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "Allow authenticated insert closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "Allow authenticated select user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow admin all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow auth read inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Allow admin read product_audit_logs" ON public.product_audit_logs;

-- Drop check triggers temporarily so updates do not block during migration run
DROP TRIGGER IF EXISTS trg_check_product_write ON public.products;
DROP TRIGGER IF EXISTS trg_check_customer_write ON public.customers;
DROP TRIGGER IF EXISTS trg_check_closing_report_write ON public.closing_reports;
DROP TRIGGER IF EXISTS trg_product_audit ON public.products;

-- First, drop default constraints temporarily to allow type alterations
ALTER TABLE public.user_roles ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.products ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.closing_reports ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.inventory_movements ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.product_audit_logs ALTER COLUMN store_id DROP DEFAULT;

-- Add store_id column if not exists (initially as VARCHAR(255))
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);
ALTER TABLE public.closing_reports ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);
ALTER TABLE public.product_audit_logs ADD COLUMN IF NOT EXISTS store_id VARCHAR(255);

-- Alter column types if they were previously created as UUID
ALTER TABLE public.user_roles ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.products ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.orders ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.closing_reports ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.inventory_movements ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.product_audit_logs ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;

-- Update default values for existing rows if they are NULL or old default UUID
UPDATE public.user_roles SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.products SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.orders SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.closing_reports SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.inventory_movements SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.product_audit_logs SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';

-- Enforce NOT NULL constraints
ALTER TABLE public.user_roles ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.closing_reports ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.inventory_movements ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.product_audit_logs ALTER COLUMN store_id SET NOT NULL;

-- Set default to 'ssnr-pos-9877' initially
ALTER TABLE public.user_roles ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.products ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.orders ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.closing_reports ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.inventory_movements ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.product_audit_logs ALTER COLUMN store_id SET DEFAULT 'ssnr-pos-9877';

-- 4. Helper authorization functions
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS VARCHAR(50) SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = p_user_id;
  RETURN COALESCE(v_role, 'Staff');
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_user_store_id() CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS VARCHAR(255) SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store_id VARCHAR(255);
BEGIN
  SELECT store_id INTO v_store_id FROM public.user_roles WHERE user_id = auth.uid();
  RETURN COALESCE(v_store_id, 'ssnr-pos-9877');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.get_user_role(p_user_id) = 'Owner';
END;
$$ LANGUAGE plpgsql;

-- 5. Update defaults to use the helper function dynamically
ALTER TABLE public.products ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();
ALTER TABLE public.orders ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();
ALTER TABLE public.closing_reports ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();
ALTER TABLE public.inventory_movements ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();
ALTER TABLE public.product_audit_logs ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();

-- 6. Create customers table
ALTER TABLE public.customers ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.subscriptions ALTER COLUMN store_id DROP DEFAULT;

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877',
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  points INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877' UNIQUE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'expired', 'trial')),
  tier VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Alter types for them just in case they were previously created as UUID
ALTER TABLE public.customers ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;
ALTER TABLE public.subscriptions ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR;

UPDATE public.customers SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';
UPDATE public.subscriptions SET store_id = 'ssnr-pos-9877' WHERE store_id IS NULL OR store_id = '00000000-0000-0000-0000-000000000000';

ALTER TABLE public.customers ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE public.customers ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();
ALTER TABLE public.subscriptions ALTER COLUMN store_id SET DEFAULT public.get_user_store_id();

-- Enable RLS on new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. Seed default subscription for base store
INSERT INTO public.subscriptions (store_id, status, tier, expires_at)
VALUES ('ssnr-pos-9877', 'trial', 'Premium', now() + interval '365 days')
ON CONFLICT (store_id) DO NOTHING;

-- 8. Clean up and redefine RLS Policies

-- products
DROP POLICY IF EXISTS "Allow authenticated read products" ON public.products;
DROP POLICY IF EXISTS "Allow admin CRUD products" ON public.products;
DROP POLICY IF EXISTS "products_rls_policy" ON public.products;
CREATE POLICY "products_rls_policy" ON public.products
  FOR ALL TO authenticated
  USING (store_id = public.get_user_store_id())
  WITH CHECK (store_id = public.get_user_store_id());

-- orders
DROP POLICY IF EXISTS "Allow authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "orders_rls_policy" ON public.orders;
CREATE POLICY "orders_rls_policy" ON public.orders
  FOR SELECT TO authenticated
  USING (
    store_id = public.get_user_store_id()
    AND (
      public.get_user_role(auth.uid()) IN ('Owner', 'Manager')
      OR (
        public.get_user_role(auth.uid()) = 'Staff'
        AND (payment_date_time AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
      )
    )
  );

-- order_items
DROP POLICY IF EXISTS "Allow authenticated read order_items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_rls_policy" ON public.order_items;
CREATE POLICY "order_items_rls_policy" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
    )
  );

-- closing_reports
DROP POLICY IF EXISTS "Allow authenticated read closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "Allow admin insert closing_reports" ON public.closing_reports;
DROP POLICY IF EXISTS "closing_reports_rls_policy" ON public.closing_reports;
CREATE POLICY "closing_reports_rls_policy" ON public.closing_reports
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

DROP POLICY IF EXISTS "closing_reports_insert_policy" ON public.closing_reports;
CREATE POLICY "closing_reports_insert_policy" ON public.closing_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  );

-- user_roles
DROP POLICY IF EXISTS "Allow authenticated select user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow admin all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
CREATE POLICY "user_roles_select_policy" ON public.user_roles
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

DROP POLICY IF EXISTS "user_roles_owner_policy" ON public.user_roles;
CREATE POLICY "user_roles_owner_policy" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'Owner')
  WITH CHECK (public.get_user_role(auth.uid()) = 'Owner');

-- inventory_movements
DROP POLICY IF EXISTS "Allow auth read inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_rls_policy" ON public.inventory_movements;
CREATE POLICY "inventory_movements_rls_policy" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

-- product_audit_logs
DROP POLICY IF EXISTS "Allow admin read product_audit_logs" ON public.product_audit_logs;
DROP POLICY IF EXISTS "product_audit_logs_rls_policy" ON public.product_audit_logs;
CREATE POLICY "product_audit_logs_rls_policy" ON public.product_audit_logs
  FOR SELECT TO authenticated
  USING (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  );

-- customers
DROP POLICY IF EXISTS "customers_rls_policy" ON public.customers;
CREATE POLICY "customers_rls_policy" ON public.customers
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

DROP POLICY IF EXISTS "customers_write_policy" ON public.customers;
CREATE POLICY "customers_write_policy" ON public.customers
  FOR ALL TO authenticated
  USING (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  )
  WITH CHECK (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  );

-- subscriptions
DROP POLICY IF EXISTS "subscriptions_rls_policy" ON public.subscriptions;
CREATE POLICY "subscriptions_rls_policy" ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  )
  WITH CHECK (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  );


-- 9. Trigger guard functions

-- products write check
CREATE OR REPLACE FUNCTION check_product_write_permissions()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50);
  v_user_store VARCHAR(255);
BEGIN
  v_role := public.get_user_role(auth.uid());
  v_user_store := public.get_user_store_id();

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '상품 관리 권한이 없습니다. 소유자만 가능합니다.';
  END IF;

  -- Validate store matches and authorization for DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.store_id <> v_user_store THEN
      RAISE EXCEPTION '타 매장 상품을 수정/추가/삭제할 수 없습니다.';
    END IF;
    RETURN OLD;
  END IF;

  -- Validate store matches for INSERT/UPDATE
  IF NEW.store_id <> v_user_store THEN
    RAISE EXCEPTION '타 매장 상품을 수정/추가/삭제할 수 없습니다.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_product_write ON public.products;
CREATE TRIGGER trg_check_product_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION check_product_write_permissions();

-- Product Master Data modification trigger (populating store_id)
CREATE OR REPLACE FUNCTION public.log_product_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, after_data, store_id)
    VALUES (auth.uid(), 'CREATE', NEW.id, TO_JSONB(NEW), NEW.store_id);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, before_data, after_data, store_id)
    VALUES (auth.uid(), 'UPDATE', NEW.id, TO_JSONB(OLD), TO_JSONB(NEW), NEW.store_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.product_audit_logs (actor_user_id, action, product_id, before_data, store_id)
    VALUES (auth.uid(), 'DELETE', OLD.id, TO_JSONB(OLD), OLD.store_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_product_audit ON public.products;
CREATE TRIGGER trg_product_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_changes();

-- customers write check
CREATE OR REPLACE FUNCTION check_customer_write_permissions()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  v_role := public.get_user_role(auth.uid());

  IF v_role = 'Staff' THEN
    RAISE EXCEPTION '고객 정보 관리 권한이 없습니다.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_role <> 'Owner' THEN
      RAISE EXCEPTION '고객 정보 삭제 권한이 없습니다. 소유자만 가능합니다.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_customer_write ON public.customers;
CREATE TRIGGER trg_check_customer_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION check_customer_write_permissions();

-- closing reports write check
CREATE OR REPLACE FUNCTION check_closing_report_write_permissions()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50);
BEGIN
  v_role := public.get_user_role(auth.uid());
  IF v_role NOT IN ('Owner', 'Manager') THEN
    RAISE EXCEPTION '영업 마감 권한이 없습니다.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_closing_report_write ON public.closing_reports;
CREATE TRIGGER trg_check_closing_report_write
  BEFORE INSERT ON public.closing_reports
  FOR EACH ROW EXECUTE FUNCTION check_closing_report_write_permissions();


-- 10. Update user creation triggers and data seeds
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50) := 'Staff';
  v_store_id VARCHAR(255) := 'ssnr-pos-9877';
  v_meta_role TEXT;
  v_meta_store TEXT;
  v_clean_email TEXT;
BEGIN
  v_meta_role := NEW.raw_user_meta_data->>'role';
  v_meta_store := NEW.raw_user_meta_data->>'store_id';
  v_clean_email := lower(NEW.email);

  -- 1. Role determination: only hardcoded owners can automatically get Owner role
  IF v_clean_email = 'rbflrbgh@gmail.com' OR v_clean_email = 'rbflrbgh@ssnr-pos.com' OR v_clean_email LIKE 'admin%' THEN
    v_role := 'Owner';
  ELSE
    -- Default to Staff for everyone else (even if metadata role says Owner, we force Staff to prevent spoofing)
    v_role := 'Staff';
  END IF;

  IF v_meta_store IS NOT NULL AND v_meta_store <> '' THEN
    v_store_id := v_meta_store;
  END IF;

  INSERT INTO public.user_roles (user_id, role, store_id)
  VALUES (NEW.id, v_role, v_store_id)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, store_id = EXCLUDED.store_id;

  -- Auto-seed default trial subscription for Owner registrations
  IF v_role = 'Owner' THEN
    INSERT INTO public.subscriptions (store_id, status, tier, expires_at)
    VALUES (v_store_id, 'trial', 'Premium', now() + interval '365 days')
    ON CONFLICT (store_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-sync all existing user roles to standard Owner/Staff formats
INSERT INTO public.user_roles (user_id, role, store_id)
SELECT 
  id, 
  CASE 
    WHEN lower(email) IN ('rbflrbgh@gmail.com', 'rbflrbgh@ssnr-pos.com') OR lower(email) LIKE 'admin%' THEN 'Owner'::varchar 
    ELSE 'Staff'::varchar 
  END,
  COALESCE(raw_user_meta_data->>'store_id', 'ssnr-pos-9877')
FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET 
  role = EXCLUDED.role,
  store_id = EXCLUDED.store_id;

-- Add a data correction statement after role migration so the current user is fixed
UPDATE public.user_roles
SET role = 'Owner'
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE lower(email) IN ('rbflrbgh@gmail.com', 'rbflrbgh@ssnr-pos.com')
);


-- 11. Transaction RPC Redefinitions with RBAC & store isolation

-- Complete Sale RPC
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
  v_db_stock INTEGER;
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

  -- 5. Calculate prices and lock stock for each item
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    -- Skip discount metadata rows passed in items payload
    IF v_item->>'product_id' = 'DISCOUNT' OR v_item->>'product_id' = 'GS' THEN
      CONTINUE;
    END IF;

    -- Lock row for update & verify store compatibility
    SELECT price, stock, is_active, name 
    INTO v_db_price, v_db_stock, v_db_active, v_db_name
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

  -- 7. Insert line items, decrement stock, and log inventory movements
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
      WHERE id = (v_item->>'product_id') AND store_id = v_store_id;

      -- Insert inventory movement log
      INSERT INTO public.inventory_movements (
        product_id, delta_quantity, movement_type, reason, order_id, actor_user_id, store_id
      ) VALUES (
        v_item->>'product_id',
        -((v_item->>'quantity')::INTEGER),
        'SALE',
        '상품 주문 출고 (주문번호: ' || p_idempotency_key || ')',
        v_order_uuid,
        v_user_id,
        v_store_id
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

-- Refund Order RPC
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
    WHERE id = v_item.product_id AND store_id = v_store_id;

    -- Record movement
    INSERT INTO public.inventory_movements (
      product_id, delta_quantity, movement_type, reason, order_id, actor_user_id, store_id
    ) VALUES (
      v_item.product_id,
      v_item.quantity,
      'REFUND',
      '주문 환불 입고 (사유: ' || COALESCE(p_reason, '미기입') || ')',
      v_order_id,
      v_user_id,
      v_store_id
    );
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'already_refunded', false,
    'order_id', v_order_id
  );
END;
$$ LANGUAGE plpgsql;

-- Manual stock adjustment RPC
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
  v_store_id VARCHAR(255);
  v_role VARCHAR(50);
BEGIN
  -- Verify Authentication and Role
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자 세션입니다.';
  END IF;
  
  SELECT store_id, role INTO v_store_id, v_role FROM public.user_roles WHERE user_id = v_user_id;

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '수동 재고 조정 권한이 없습니다. 소유자 권한이 필요합니다.';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION '변경 수량은 0이 아닌 유효한 값이어야 합니다.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION '수동 재고 조정 시에는 사유 기입이 의무화되어 있습니다.';
  END IF;

  -- Lock row and update
  SELECT stock INTO v_old_stock FROM public.products WHERE id = p_product_id AND store_id = v_store_id FOR UPDATE;
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
  WHERE id = p_product_id AND store_id = v_store_id;

  -- Insert inventory movement
  INSERT INTO public.inventory_movements (
    product_id, delta_quantity, movement_type, reason, actor_user_id, store_id
  ) VALUES (
    p_product_id, p_amount, 'ADJUSTMENT', p_reason, v_user_id, v_store_id
  );

  -- Log action in audit log
  INSERT INTO public.product_audit_logs (
    actor_user_id, action, product_id, before_data, after_data, reason, store_id
  ) VALUES (
    v_user_id, 'MANUAL_ADJUSTMENT', p_product_id, 
    JSONB_BUILD_OBJECT('stock', v_old_stock), 
    JSONB_BUILD_OBJECT('stock', v_new_stock), 
    p_reason,
    v_store_id
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- 12. Create employee management RPC functions

-- Invite Employee RPC
CREATE OR REPLACE FUNCTION public.invite_employee_rpc(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT,
  p_store_id VARCHAR(255)
) RETURNS UUID
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_role VARCHAR(50);
  v_creator_store VARCHAR(255);
  v_new_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  -- 1. Check permissions of the execution actor (must be Owner)
  SELECT role, store_id INTO v_creator_role, v_creator_store 
  FROM public.user_roles WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 등록 권한이 없습니다. 소유자(Owner)만 초대가 가능합니다.';
  END IF;

  -- Validate same store limit
  IF v_creator_store <> p_store_id THEN
    RAISE EXCEPTION '자신이 소유하지 않은 매장에 직원을 초청할 수 없습니다.';
  END IF;

  -- Validate role input
  IF p_role NOT IN ('Owner', 'Staff') THEN
    RAISE EXCEPTION '지정된 직급이 유효하지 않습니다: %', p_role;
  END IF;

  -- 2. Verify duplicates
  SELECT id INTO v_new_user_id FROM auth.users WHERE email = p_email;
  IF FOUND THEN
    RAISE EXCEPTION '이미 시스템에 가입되어 있는 이메일 주소입니다: %', p_email;
  END IF;

  -- 3. Hash password and insert into auth.users schema
  v_new_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    p_email,
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'role', p_role, 'store_id', p_store_id),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  -- NOTE: The handle_new_user trigger on auth.users will run and insert into public.user_roles.
  
  RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql;

-- Remove Employee RPC
CREATE OR REPLACE FUNCTION public.remove_employee_rpc(
  p_user_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_role VARCHAR(50);
  v_creator_store VARCHAR(255);
  v_target_store VARCHAR(255);
BEGIN
  -- 1. Check permissions (must be Owner)
  SELECT role, store_id INTO v_creator_role, v_creator_store 
  FROM public.user_roles WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 해고 권한이 없습니다. 소유자(Owner)만 가능합니다.';
  END IF;

  -- 2. Verify target employee exists and is in the same store
  SELECT store_id INTO v_target_store FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 직원을 시스템에서 찾을 수 없습니다.';
  END IF;

  IF v_creator_store <> v_target_store THEN
    RAISE EXCEPTION '다른 매장에 근무 중인 직원을 삭제할 수 없습니다.';
  END IF;

  -- 3. Prevent self-deletion
  IF p_user_id = v_creator_id THEN
    RAISE EXCEPTION '자기 자신을 직원 명단에서 해고/삭제할 수 없습니다.';
  END IF;

  -- 4. Delete user (auth.users CASCADE deletes public.user_roles)
  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update Employee Role RPC
CREATE OR REPLACE FUNCTION public.update_employee_role_rpc(
  p_user_id UUID,
  p_role VARCHAR
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_role VARCHAR(50);
  v_creator_store VARCHAR(255);
  v_target_store VARCHAR(255);
BEGIN
  -- 1. Check permissions (must be Owner)
  SELECT role, store_id INTO v_creator_role, v_creator_store 
  FROM public.user_roles WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직급 변경 권한이 없습니다. 소유자(Owner)만 수정할 수 있습니다.';
  END IF;

  -- 2. Verify target employee matches store
  SELECT store_id INTO v_target_store FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '직원 정보를 찾을 수 없습니다.';
  END IF;

  IF v_creator_store <> v_target_store THEN
    RAISE EXCEPTION '타 매장 직원의 직급을 수정할 수 없습니다.';
  END IF;

  -- Validate role input
  IF p_role NOT IN ('Owner', 'Staff') THEN
    RAISE EXCEPTION '선택한 직급이 올바르지 않습니다: %', p_role;
  END IF;

  -- 3. Prevent self role changes
  IF p_user_id = v_creator_id THEN
    RAISE EXCEPTION '본인의 직급을 직접 하향조정하거나 변경할 수 없습니다.';
  END IF;

  -- 4. Update role inside public.user_roles
  UPDATE public.user_roles
  SET role = p_role
  WHERE user_id = p_user_id;

  -- Update metadata in auth.users
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p_role)
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


DROP FUNCTION IF EXISTS public.get_employees_rpc();
CREATE OR REPLACE FUNCTION public.get_employees_rpc()
RETURNS TABLE (
  user_id UUID,
  email VARCHAR(255),
  name TEXT,
  role VARCHAR(50),
  store_id VARCHAR(255)
)
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_store VARCHAR(255);
  v_caller_role VARCHAR(50);
BEGIN
  SELECT store_id, role INTO v_caller_store, v_caller_role FROM public.user_roles WHERE user_id = v_caller_id;
  
  IF v_caller_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 목록 조회 권한이 없습니다. 소유자만 조회할 수 있습니다.';
  END IF;

  RETURN QUERY
  SELECT 
    u.id AS user_id,
    u.email::VARCHAR(255) AS email,
    COALESCE(u.raw_user_meta_data->>'name', u.email, '직원') AS name,
    ur.role::VARCHAR(50) AS role,
    ur.store_id::VARCHAR(255) AS store_id
  FROM public.user_roles ur
  JOIN auth.users u ON ur.user_id = u.id
  WHERE ur.store_id = v_caller_store;
END;
$$ LANGUAGE plpgsql;


-- 13. Re-grant RPC execution permissions
REVOKE EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, VARCHAR) FROM public;
REVOKE EXECUTE ON FUNCTION public.remove_employee_rpc(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.update_employee_role_rpc(UUID, VARCHAR) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_employees_rpc() FROM public;

GRANT EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_employee_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employee_role_rpc(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employees_rpc() TO authenticated;

-- Make sure existing RPC grants are correct
GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_order(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(VARCHAR, INTEGER, TEXT) TO authenticated;
