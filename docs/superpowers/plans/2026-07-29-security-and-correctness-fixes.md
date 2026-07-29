# Security & Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six verified bugs found in a security/correctness audit: two RLS store-isolation gaps, a product-write store-hijack bug, a Staff same-day-order-restriction bypass, a missing discount ceiling in `complete_sale`, an unfriendly duplicate-payment error, and — the one with real money impact today — `refund_order_items` over-refunding when the original sale had a cart-wide discount.

**Architecture:** All six fixes are additive/corrective changes to existing Postgres objects (RLS policies, trigger functions, RPCs) plus one new `order_items` column and one `App.tsx` calculation change. No new tables, no new frontend components. Each DB fix is a `DROP POLICY`/`CREATE OR REPLACE` in a new migration file — additive-only pattern, same one that avoided the ordering bug from the July schema-drift fix.

**Tech Stack:** Supabase (Postgres, RLS, PL/pgSQL RPCs), React + TypeScript frontend, manual migration execution via Supabase SQL Editor (no CLI/service-role access from this session).

## Global Constraints

- No automated test runner in this repo — every task's verification is `npm run typecheck` (+ `npm run build` on frontend-touching tasks) plus a manual check. DB migrations are verified with a `SELECT`/behavioral check run by the project owner in the Supabase SQL Editor, since this session has no DB credentials beyond the anon key.
- Migrations must be additive (`DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`) — no `ALTER COLUMN ... TYPE`, to avoid the dependency-ordering failure from the July schema-drift incident.
- Only one store (`ssnr-pos-9877`) exists today, so the store-isolation fixes (Tasks 1–2) have no observable effect on current usage — they close a gap that only matters the moment a second store signs up. Don't let that make them lower quality; write them correctly the first time.
- Korean UI/error copy in the existing short, direct tone (see `RAISE EXCEPTION` message style already in the migrations for reference).

---

### Task 1: Close the store-isolation RLS gaps and the product-write store-hijack

**Files:**
- Create: `supabase/migrations/20260729000000_fix_store_isolation_gaps.sql`

**Interfaces:**
- Produces: redefined `order_items_rls_policy` (now store-scoped), redefined `check_product_write_permissions()` (now checks `OLD.store_id` on UPDATE too), and removal of four overly-permissive compat policies (`orders_compat_select`, `products_compat_select`, `products_compat_owner_write`, `user_roles_compat_select`) that were silently OR'd against the correct, already-existing store-scoped policies.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260729000000_fix_store_isolation_gaps.sql`:

```sql
-- Migration: Close store-isolation gaps found in security audit
--
-- Root cause of all four DROPs below: 20260723000000_restore_english_schema_compatibility.sql
-- added "_compat_" policies to recover from schema drift, but never dropped the correctly-scoped
-- policies that 20260714000002_implement_rbac_and_store_isolation.sql had already created for the
-- same tables. Postgres OR's all permissive policies together, so the compat policies' looser
-- USING clauses silently overrode the correct ones:
--   - orders_compat_select has no role/date condition, bypassing the Staff same-day restriction
--     that orders_rls_policy enforces.
--   - products_compat_select/products_compat_owner_write duplicate what products_rls_policy
--     (FOR ALL, store-scoped) already covers; products_compat_owner_write's USING has NO store_id
--     check at all, letting any Owner read/write any store's products.
--   - user_roles_compat_select duplicates user_roles_select_policy exactly.
-- The correctly-scoped policies (orders_rls_policy, products_rls_policy, user_roles_select_policy)
-- already fully cover legitimate access, so the fix is simply to drop the redundant compat ones.

DROP POLICY IF EXISTS orders_compat_select ON public.orders;
DROP POLICY IF EXISTS products_compat_select ON public.products;
DROP POLICY IF EXISTS products_compat_owner_write ON public.products;
DROP POLICY IF EXISTS user_roles_compat_select ON public.user_roles;

-- order_items_rls_policy (20260714000002) only checked that the referenced order exists, not
-- that it belongs to the caller's store — any authenticated user from any store could read any
-- other store's line items.
DROP POLICY IF EXISTS "order_items_rls_policy" ON public.order_items;
CREATE POLICY "order_items_rls_policy" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.store_id = public.get_user_store_id()
    )
  );

-- check_product_write_permissions() validated NEW.store_id on UPDATE but never OLD.store_id, so
-- (combined with the products_compat_owner_write gap above) an Owner could UPDATE another store's
-- product row and reassign its store_id to their own store in one statement, stealing it.
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

  IF TG_OP = 'DELETE' THEN
    IF OLD.store_id <> v_user_store THEN
      RAISE EXCEPTION '타 매장 상품을 수정/추가/삭제할 수 없습니다.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.store_id <> v_user_store THEN
    RAISE EXCEPTION '타 매장 상품을 수정/추가/삭제할 수 없습니다.';
  END IF;

  IF NEW.store_id <> v_user_store THEN
    RAISE EXCEPTION '타 매장 상품을 수정/추가/삭제할 수 없습니다.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Hand off to the project owner to run the migration**

Ask the project owner to paste the full file into the Supabase SQL Editor and run it, then run this verification and confirm the result:

```sql
SELECT policyname, qual FROM pg_policies
WHERE tablename IN ('orders', 'products', 'user_roles', 'order_items')
ORDER BY tablename, policyname;
```

Expected: no row named `orders_compat_select`, `products_compat_select`, `products_compat_owner_write`, or `user_roles_compat_select`. The `order_items_rls_policy` row's `qual` column should now mention `store_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260729000000_fix_store_isolation_gaps.sql
git commit -m "fix: close store-isolation RLS gaps and product-write store-hijack"
```

---

### Task 2: Harden `complete_sale` — discount ceiling and duplicate-payment UX

**Files:**
- Create: `supabase/migrations/20260729000001_harden_complete_sale.sql`

**Interfaces:**
- Consumes: none new — same `complete_sale(p_idempotency_key, p_payment_method, p_total_amount, p_total_quantity, p_received_amount, p_change, p_items, p_global_discount, p_subtotal, p_item_discount_amount, p_cart_discount_percent, p_cart_discount_amount, p_total_discount, p_final_total)` signature as today (defined in `20260714000002_implement_rbac_and_store_isolation.sql`, most recently touched by `20260714000003_remove_inventory_and_stock_logic.sql`).
- Produces: same signature and same success/`is_duplicate` JSON shape, now also raising a clear error if the discount exceeds the item subtotal, and returning `is_duplicate: true` instead of a raw constraint-violation error on a racing double-submit.

- [ ] **Step 1: Read the current function body to copy forward unchanged**

Read `supabase/migrations/20260714000003_remove_inventory_and_stock_logic.sql` lines 19–180 (the current `complete_sale` definition) before writing this migration — the `CREATE OR REPLACE FUNCTION` below must be a full copy of that body with only the two changes described in Steps 2–3 applied, not a partial function.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260729000001_harden_complete_sale.sql`. This is `CREATE OR REPLACE FUNCTION public.complete_sale` with two changes from the version in `20260714000003_remove_inventory_and_stock_logic.sql`:

1. Before the line `v_calculated_total_amount := GREATEST(0, v_calculated_total_amount - COALESCE(p_global_discount, 0));`, insert a ceiling check so an over-sized discount is rejected instead of silently floored to a 0-won charge.
2. Wrap the `INSERT INTO public.orders (...) ... RETURNING id INTO v_order_uuid;` statement in a nested exception block so a racing duplicate submission (two rapid clicks past the earlier `SELECT ... IF FOUND` check) returns the same friendly `is_duplicate: true` response instead of a raw unique-violation error reaching the cashier.

```sql
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
```

- [ ] **Step 3: Hand off to the project owner to run the migration**

Ask them to run the file, then do one real test sale that includes a cart-wide discount (should still succeed normally), confirming nothing regressed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260729000001_harden_complete_sale.sql
git commit -m "fix: reject over-sized cart discounts and handle racing duplicate payments cleanly in complete_sale"
```

---

### Task 3: `order_items.line_total` — the actual fix for refund over-payment

**Files:**
- Create: `supabase/migrations/20260729000002_add_order_item_line_total.sql`

**Interfaces:**
- Produces: `public.order_items.line_total NUMERIC NOT NULL DEFAULT 0` — the exact amount actually charged for that line after both its own item-level discount AND its proportional share of any cart-wide discount. Backfilled for all existing rows. `complete_sale` now stores it from a new `line_total` field in each `p_items` element (Task 4 makes the frontend send it). `refund_order_items` now uses it directly instead of recomputing from `product_price`/`quantity`/`discount`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260729000002_add_order_item_line_total.sql`:

```sql
-- Migration: order_items.line_total — fixes refund_order_items over-refunding
--
-- refund_order_items computed its refund amount from product_price * quantity minus the
-- item's own per-item discount only. It never accounted for the order's cart-wide discount
-- (orders.cart_discount_amount), so refunding one item out of a cart that also had a 10%
-- cart-wide discount refunded that item's full pre-cart-discount price — real money lost.
--
-- Fix: store the exact amount actually charged for each line (after both its item discount
-- and its share of the cart discount) at sale time, computed client-side where all the numbers
-- already exist (App.tsx already computes cartDiscountAmount/discountableSubtotalAfterItemDiscounts
-- to render the checkout total), and have refund_order_items just read it back instead of
-- recomputing an incomplete formula.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC DEFAULT 0 NOT NULL;

-- Backfill existing rows. The store_id/exclude-from-cart-discount feature didn't exist before
-- this session, so every historical order's cart discount applied to ALL of its non-DISCOUNT
-- items — this backfill's proportional split is exact for all pre-existing data, not an
-- approximation.
WITH order_totals AS (
  SELECT oi.order_id,
         SUM(oi.product_price * oi.quantity - COALESCE(oi.discount, 0) * COALESCE(oi.discount_qty, 0)) AS discountable_subtotal
  FROM public.order_items oi
  WHERE oi.product_id <> 'DISCOUNT'
  GROUP BY oi.order_id
)
UPDATE public.order_items oi
SET line_total = GREATEST(0,
  (oi.product_price * oi.quantity - COALESCE(oi.discount, 0) * COALESCE(oi.discount_qty, 0))
  - CASE
      WHEN ot.discountable_subtotal > 0
      THEN COALESCE(o.cart_discount_amount, 0) * (oi.product_price * oi.quantity - COALESCE(oi.discount, 0) * COALESCE(oi.discount_qty, 0)) / ot.discountable_subtotal
      ELSE 0
    END
)
FROM public.orders o, order_totals ot
WHERE oi.order_id = o.id AND oi.order_id = ot.order_id AND oi.product_id <> 'DISCOUNT';

UPDATE public.order_items SET line_total = product_price WHERE product_id = 'DISCOUNT';

-- Store line_total on new sales (complete_sale). Only the insert loop changes from the
-- 20260729000001_harden_complete_sale.sql definition — everything else is identical.
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

    v_calculated_total_quantity := v_calculated_total_quantity + (v_item->>'quantity')::INTEGER;
    v_calculated_total_amount := v_calculated_total_amount + v_item_expected_total;
  END LOOP;

  IF COALESCE(p_global_discount, 0) > v_calculated_total_amount THEN
    RAISE EXCEPTION '전체 할인 금액(%)이 상품 합계(%)를 초과할 수 없습니다.', p_global_discount, v_calculated_total_amount;
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

  -- Changed: now also stores line_total, the exact amount charged for this line.
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

GRANT EXECUTE ON FUNCTION public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- Fix refund_order_items: use the stored line_total instead of recomputing an incomplete
-- formula, and add a server-side product_id <> 'DISCOUNT' guard (previously only enforced
-- client-side in HistoryView.tsx).
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 세션입니다.';
  END IF;

  SELECT store_id, role INTO v_store_id, v_role FROM public.user_roles WHERE user_id = v_user_id;

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '품목별 환불 처리 권한이 없습니다. 소유자 권한이 요구됩니다.';
  END IF;

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

  FOR v_item IN
    SELECT id, line_total
    FROM public.order_items
    WHERE order_id = v_order_id AND id = ANY(p_item_ids) AND is_refunded = false AND product_id <> 'DISCOUNT'
    FOR UPDATE
  LOOP
    v_item_net_amount := GREATEST(0, v_item.line_total);

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

  SELECT COUNT(*) INTO v_remaining_unrefunded
  FROM public.order_items
  WHERE order_id = v_order_id AND is_refunded = false AND product_id <> 'DISCOUNT';

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
```

- [ ] **Step 2: Hand off to the project owner to run the migration**

Ask them to run it, then verify the backfill with:

```sql
SELECT product_name, product_price, quantity, discount, discount_qty, line_total
FROM public.order_items
WHERE product_id <> 'DISCOUNT'
ORDER BY created_at DESC
LIMIT 10;
```

Expected: `line_total` is populated (not 0) for existing rows, and for any order with no cart-wide discount, `line_total` equals `product_price * quantity - discount * discount_qty`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260729000002_add_order_item_line_total.sql
git commit -m "fix: store per-line charged amount, fixing refund_order_items over-refunding on discounted carts"
```

---

### Task 4: Frontend — compute and send `line_total` per cart item

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `line_total` column and updated `complete_sale` signature from Task 3 (same call shape, `p_items` array elements now carry an additional `line_total` field).

- [ ] **Step 1: Add the per-item cart-discount-share calculation to the payload builder**

In `src/App.tsx`, find the `cartPayload` construction inside `handleCompletePayment`:

```ts
      // Prepare cart payload for RPC
      const cartPayload = cart.map(item => {
        const info = getItemDiscountInfo(item);
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          discount: info.unitDiscount,
          discount_qty: info.isPercent ? item.quantity : (item.discountQty || 0),
          is_percent: info.isPercent,
          discount_percent: info.discountPercent
        };
      });
```

Replace with (adds a running-remainder allocation so the sum of every item's cart-discount share exactly equals `cartDiscountAmount` — no rounding drift left unaccounted for):

```ts
      // Prepare cart payload for RPC. Each item's line_total is the exact amount actually
      // charged for that line: its post-item-discount value minus its share of the cart-wide
      // discount (0 if the item is excluded from the cart discount). The last discountable item
      // absorbs the rounding remainder so the shares always sum to exactly cartDiscountAmount.
      const discountableItemIds = cart
        .filter(item => !item.excludeFromCartDiscount)
        .map(item => item.product.id);
      const lastDiscountableItemId = discountableItemIds[discountableItemIds.length - 1];
      let remainingCartDiscount = cartDiscountAmount;

      const cartPayload = cart.map(item => {
        const info = getItemDiscountInfo(item);
        const postItemDiscountValue = item.product.price * item.quantity - info.totalDiscount;

        let cartDiscountShare = 0;
        if (!item.excludeFromCartDiscount && discountableSubtotalAfterItemDiscounts > 0) {
          if (item.product.id === lastDiscountableItemId) {
            cartDiscountShare = remainingCartDiscount;
          } else {
            cartDiscountShare = Math.round(cartDiscountAmount * (postItemDiscountValue / discountableSubtotalAfterItemDiscounts));
            remainingCartDiscount -= cartDiscountShare;
          }
        }

        return {
          product_id: item.product.id,
          product_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          discount: info.unitDiscount,
          discount_qty: info.isPercent ? item.quantity : (item.discountQty || 0),
          is_percent: info.isPercent,
          discount_percent: info.discountPercent,
          line_total: postItemDiscountValue - cartDiscountShare
        };
      });
```

- [ ] **Step 2: Add `line_total` to the synthetic DISCOUNT line item too**

Directly below, find:

```ts
      if (cartDiscountAmount > 0) {
        cartPayload.push({
          product_id: 'DISCOUNT',
          product_name: `[할인적용] 전체 할인 (${cartDiscountPercent}%)`,
          price: -cartDiscountAmount,
          quantity: 1,
          discount: 0,
          discount_qty: 0,
          is_percent: false,
          discount_percent: 0
        });
      }
```

Replace with:

```ts
      if (cartDiscountAmount > 0) {
        cartPayload.push({
          product_id: 'DISCOUNT',
          product_name: `[할인적용] 전체 할인 (${cartDiscountPercent}%)`,
          price: -cartDiscountAmount,
          quantity: 1,
          discount: 0,
          discount_qty: 0,
          is_percent: false,
          discount_percent: 0,
          line_total: -cartDiscountAmount
        });
      }
```

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS. (`cartPayload`'s inferred element type gains `line_total: number` uniformly across both push sites — no explicit type annotation exists to update.)

- [ ] **Step 4: Hand off for manual verification**

This step depends on Task 3's migration already being applied (`order_items.line_total` must exist, and the deployed `complete_sale` must accept the new field) — ask the project owner to confirm Task 3 is done first. Then: complete one sale with a cart-wide discount applied to 2+ items, then open that order in 매출내역 and do a 품목별 환불 on just one of the items. Confirm the refunded amount shown is the item's actual discounted price (i.e., less than `product_price * quantity`), not the full pre-discount price.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: send per-line charged amount (line_total) to complete_sale"
```
