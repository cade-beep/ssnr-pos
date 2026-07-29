-- Migration: Staff signup approval gate
--
-- Self-service Staff signup (the "직원 계정 회원가입" form on the login screen) previously
-- created a fully working account the instant someone who knows the store code submitted the
-- form — no owner review. This adds an is_approved gate: self-service signups start
-- unapproved and can't log in until the Owner approves them from [직원]. Owner-invited
-- employees (via invite_employee_rpc, where the Owner already typed the info in) are
-- unaffected — auto-approved, since the Owner already vetted them by creating the account.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Existing rows predate this feature — approve everyone who already has a working account so
-- this migration doesn't lock out the whole existing staff roster.
UPDATE public.user_roles SET is_approved = true WHERE is_approved = false;

-- handle_new_user: distinguish self-service signup (LoginOverlay.tsx's handleSignUp, which
-- calls supabase.auth.signUp directly with no pre_approved flag) from Owner-invited signup
-- (invite_employee_rpc, updated below to set pre_approved=true) and from the hardcoded Owner
-- emails (always approved). Only the self-service path starts unapproved.
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- invite_employee_rpc: tag the auth.users row it creates as pre-approved
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
  SELECT role, store_id INTO v_creator_role, v_creator_store
  FROM public.user_roles WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 등록 권한이 없습니다. 소유자(Owner)만 초대가 가능합니다.';
  END IF;

  IF v_creator_store <> p_store_id THEN
    RAISE EXCEPTION '자신이 소유하지 않은 매장에 직원을 초청할 수 없습니다.';
  END IF;

  IF p_role NOT IN ('Owner', 'Staff') THEN
    RAISE EXCEPTION '지정된 직급이 유효하지 않습니다: %', p_role;
  END IF;

  SELECT id INTO v_new_user_id FROM auth.users WHERE email = p_email;
  IF FOUND THEN
    RAISE EXCEPTION '이미 시스템에 가입되어 있는 이메일 주소입니다: %', p_email;
  END IF;

  v_new_user_id := gen_random_uuid();
  v_encrypted_password := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    p_email,
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'role', p_role, 'store_id', p_store_id, 'pre_approved', true),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  RETURN v_new_user_id;
END;
$$ LANGUAGE plpgsql;

-- get_employees_rpc: expose is_approved so the frontend can split pending vs. approved.
DROP FUNCTION IF EXISTS public.get_employees_rpc();
CREATE OR REPLACE FUNCTION public.get_employees_rpc()
RETURNS TABLE (
  user_id UUID,
  email VARCHAR(255),
  name TEXT,
  role VARCHAR(50),
  store_id VARCHAR(255),
  is_approved BOOLEAN
)
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_store VARCHAR(255);
  v_caller_role VARCHAR(50);
BEGIN
  SELECT ur.store_id, ur.role INTO v_caller_store, v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 목록 조회 권한이 없습니다. 소유자만 조회할 수 있습니다.';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::VARCHAR(255) AS email,
    COALESCE(u.raw_user_meta_data->>'name', u.email, '직원') AS name,
    ur.role::VARCHAR(50) AS role,
    ur.store_id::VARCHAR(255) AS store_id,
    ur.is_approved
  FROM public.user_roles ur
  JOIN auth.users u ON ur.user_id = u.id
  WHERE ur.store_id = v_caller_store;
END;
$$ LANGUAGE plpgsql;

-- Approve a pending self-service signup
CREATE OR REPLACE FUNCTION public.approve_employee_rpc(
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
  SELECT role, store_id INTO v_creator_role, v_creator_store
  FROM public.user_roles WHERE user_id = v_creator_id;

  IF v_creator_role IS DISTINCT FROM 'Owner' THEN
    RAISE EXCEPTION '직원 승인 권한이 없습니다. 소유자(Owner)만 가능합니다.';
  END IF;

  SELECT store_id INTO v_target_store FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '해당 직원을 시스템에서 찾을 수 없습니다.';
  END IF;

  IF v_creator_store <> v_target_store THEN
    RAISE EXCEPTION '다른 매장 직원을 승인할 수 없습니다.';
  END IF;

  UPDATE public.user_roles SET is_approved = true WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.approve_employee_rpc(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_employee_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_employee_rpc(TEXT, TEXT, TEXT, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employees_rpc() TO authenticated;
