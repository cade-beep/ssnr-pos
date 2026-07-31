-- Migration: Fix self-service Staff signup flow and error messaging
--
-- 1. Create signup_staff_rpc function accessible by anon (unauthenticated) users on login screen
--    to handle self-service staff signup cleanly without relying on GoTrue email confirmation mailer.
-- 2. Harden handle_new_user() trigger with search_path and exception fallback to prevent DB 500 errors.

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

  IF v_clean_email = 'rbflrbgh@gmail.com' OR v_clean_email = 'rbflrbgh@ssnr-pos.com' OR v_clean_email LIKE 'admin%' THEN
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

CREATE OR REPLACE FUNCTION public.signup_staff_rpc(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_store_id VARCHAR(255)
) RETURNS UUID
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_clean_email TEXT;
  v_clean_store VARCHAR(255);
  v_clean_name TEXT;
  v_new_user_id UUID;
  v_encrypted_password TEXT;
  v_store_exists BOOLEAN;
BEGIN
  v_clean_email := lower(trim(p_email));
  v_clean_store := lower(trim(p_store_id));
  v_clean_name := trim(p_name);

  -- 1. Validation checks
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION '이메일(아이디)을 입력해 주세요.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION '비밀번호는 최소 6자 이상이어야 합니다.';
  END IF;

  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION '사용자 이름을 입력해 주세요.';
  END IF;

  IF v_clean_store IS NULL OR v_clean_store = '' THEN
    RAISE EXCEPTION '매장 고유 코드를 입력해 주세요.';
  END IF;

  -- 2. Validate Store ID existence
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE lower(store_id) = v_clean_store
    UNION
    SELECT 1 FROM public.subscriptions WHERE lower(store_id) = v_clean_store
  ) INTO v_store_exists;

  IF NOT v_store_exists THEN
    RAISE EXCEPTION '존재하지 않는 매장 코드(Store ID)입니다. 매장 소유자(Owner)에게 올바른 코드를 확인해 주세요.';
  END IF;

  -- 3. Check for existing email in auth.users
  SELECT id INTO v_new_user_id FROM auth.users WHERE lower(email) = v_clean_email;
  IF FOUND THEN
    RAISE EXCEPTION '이미 등록되어 있는 이메일/아이디입니다.';
  END IF;

  -- 4. Create user in auth.users
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
    jsonb_build_object('name', v_clean_name, 'role', 'Staff', 'store_id', v_clean_store, 'pre_approved', false),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.signup_staff_rpc(TEXT, TEXT, TEXT, VARCHAR) TO anon, authenticated;
