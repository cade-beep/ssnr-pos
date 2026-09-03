-- Migration: Harden security on RPCs, triggers, and customer personal data RLS
-- 1. Fix invite_employee_rpc: Block anonymous execution and strictly require authenticated Owner.
CREATE OR REPLACE FUNCTION public.invite_employee_rpc(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT,
  p_store_id TEXT
) RETURNS UUID
SECURITY DEFINER
SET search_path = auth, public, extensions, pg_catalog
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_role VARCHAR(50);
  v_creator_store VARCHAR(255);
  v_clean_email TEXT;
  v_clean_store VARCHAR(255);
  v_clean_name TEXT;
  v_clean_role VARCHAR(50);
  v_new_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  -- Strict authentication check: anon cannot invite employees
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 사용자입니다. 매장 대표(Owner)로 로그인 후 직원을 초대해 주십시오.';
  END IF;

  v_clean_email := lower(trim(p_email));
  v_clean_store := lower(trim(p_store_id));
  v_clean_name := trim(p_name);
  v_clean_role := COALESCE(nullif(trim(p_role), ''), 'Staff');

  -- Authorization check: caller must be Owner of the target store
  SELECT role, store_id INTO v_creator_role, v_creator_store
  FROM public.user_roles
  WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 초대 권한이 없습니다. 매장 대표(Owner) 계정만 신규 직원을 초대할 수 있습니다.';
  END IF;

  IF lower(v_creator_store) <> v_clean_store THEN
    RAISE EXCEPTION '본인이 소유한 매장의 직원만 초대할 수 있습니다.';
  END IF;

  -- Basic input validation
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION '이메일을 입력해 주세요.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION '비밀번호는 최소 6자 이상이어야 합니다.';
  END IF;

  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION '직원 이름을 입력해 주세요.';
  END IF;

  -- Duplicate email check
  SELECT id INTO v_new_user_id FROM auth.users WHERE lower(email) = v_clean_email;
  IF FOUND THEN
    RAISE EXCEPTION '이미 등록되어 있는 이메일 계정입니다.';
  END IF;

  -- Create user record in auth.users
  v_new_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    v_clean_email,
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('name', v_clean_name, 'role', v_clean_role, 'store_id', v_clean_store, 'pre_approved', true),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- 2. Remove insecure admin% prefix matching from handle_new_user() trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(50) := 'Staff';
  v_store_id VARCHAR(255) := 'ssnr-pos-9877';
  v_meta_role TEXT;
  v_meta_store TEXT;
  v_clean_email TEXT;
  v_pre_approved BOOLEAN;
BEGIN
  v_meta_role := NEW.raw_user_meta_data->>'role';
  v_meta_store := NEW.raw_user_meta_data->>'store_id';
  v_clean_email := lower(NEW.email);
  v_pre_approved := COALESCE((NEW.raw_user_meta_data->>'pre_approved')::boolean, false);

  -- Only exact verified owner emails are assigned Owner role automatically on signup.
  -- Insecure LIKE 'admin%' pattern is removed to prevent arbitrary elevation of privilege.
  IF v_clean_email = 'rbflrbgh@gmail.com' OR v_clean_email = 'rbflrbgh@ssnr-pos.com' THEN
    v_role := 'Owner';
  ELSE
    v_role := 'Staff';
  END IF;

  IF v_meta_store IS NOT NULL AND v_meta_store <> '' THEN
    v_store_id := v_meta_store;
  END IF;

  INSERT INTO public.user_roles (user_id, role, store_id, is_approved)
  VALUES (NEW.id, v_role, v_store_id, (v_role = 'Owner' OR v_pre_approved))
  ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    store_id = EXCLUDED.store_id,
    is_approved = EXCLUDED.is_approved;

  IF v_role = 'Owner' THEN
    INSERT INTO public.subscriptions (store_id, status, tier, expires_at)
    VALUES (v_store_id, 'trial', 'Premium', now() + interval '365 days')
    ON CONFLICT (store_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user trigger warning: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public, pg_catalog;


-- 3. Lock down customers table RLS: Only Owners can select customer personal info (phone numbers, etc.)
DROP POLICY IF EXISTS "customers_rls_policy" ON public.customers;
CREATE POLICY "customers_rls_policy" ON public.customers
  FOR SELECT TO authenticated
  USING (
    store_id = public.get_user_store_id()
    AND public.get_user_role(auth.uid()) = 'Owner'
  );
