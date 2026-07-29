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
