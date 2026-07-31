-- Migration: Enable pgcrypto and resolve RPC function overloads
-- 1. Ensure pgcrypto extension exists for gen_salt() and crypt()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 2. Safely DROP ALL obsolete overloads of invite_employee_rpc
DROP FUNCTION IF EXISTS public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, TEXT);

-- 3. Safely DROP ALL obsolete overloads of signup_staff_rpc
DROP FUNCTION IF EXISTS public.signup_staff_rpc(TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.signup_staff_rpc(TEXT, TEXT, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.signup_staff_rpc(TEXT, TEXT, TEXT, TEXT);

-- 4. Re-create single canonical invite_employee_rpc with TEXT parameters
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
  v_clean_email := lower(trim(p_email));
  v_clean_store := lower(trim(p_store_id));
  v_clean_name := trim(p_name);
  v_clean_role := COALESCE(nullif(trim(p_role), ''), 'Staff');

  -- Authorization check if called by authenticated user
  IF v_creator_id IS NOT NULL THEN
    SELECT role, store_id INTO v_creator_role, v_creator_store
    FROM public.user_roles
    WHERE user_id = v_creator_id;

    IF v_creator_role IS NULL OR v_creator_role <> 'Owner' THEN
      RAISE EXCEPTION '직원 초대 권한이 없습니다. 매장 대표(Owner) 계정만 신규 직원을 초대할 수 있습니다.';
    END IF;

    IF lower(v_creator_store) <> v_clean_store THEN
      RAISE EXCEPTION '본인이 소유한 매장의 직원만 초대할 수 있습니다.';
    END IF;
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

GRANT EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;


-- 5. Re-create single canonical signup_staff_rpc with TEXT parameters
CREATE OR REPLACE FUNCTION public.signup_staff_rpc(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_store_id TEXT
) RETURNS UUID
SECURITY DEFINER
SET search_path = auth, public, extensions, pg_catalog
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

  -- Input validation
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

  -- Store ID existence check
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE lower(store_id) = v_clean_store
    UNION
    SELECT 1 FROM public.subscriptions WHERE lower(store_id) = v_clean_store
  ) INTO v_store_exists;

  IF NOT v_store_exists THEN
    RAISE EXCEPTION '존재하지 않는 매장 코드(Store ID)입니다. 매장 소유자(Owner)에게 올바른 코드를 확인해 주세요.';
  END IF;

  -- Duplicate email check
  SELECT id INTO v_new_user_id FROM auth.users WHERE lower(email) = v_clean_email;
  IF FOUND THEN
    RAISE EXCEPTION '이미 등록되어 있는 이메일/아이디입니다.';
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
    jsonb_build_object('name', v_clean_name, 'role', 'Staff', 'store_id', v_clean_store, 'pre_approved', false),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.signup_staff_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
