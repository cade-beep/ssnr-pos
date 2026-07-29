# Staff Signup Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan was written for a fresh agent with no memory of the conversation that produced it.** Every "current file" snippet below was read directly from the repo at plan-writing time — trust it over any assumption. If a snippet doesn't match what you find in the file, STOP and re-read the actual file before editing; something changed after this plan was written.

**Goal:** Close a real gap: right now, self-service Staff signup (the "직원 계정 회원가입" form on the login screen) creates a fully working, immediately-logged-in-capable account the instant someone who knows the store code submits the form — the Owner has no review step and may not notice a new account exists until they happen to open [직원]. After this plan, self-service signups land in a "pending approval" state that cannot log in until the Owner explicitly approves them from the Employees screen. Owner-invited employees (via the existing "신규 직원 등록 (초대)" flow, where the Owner already typed their info in) are unaffected — they're auto-approved, since the Owner already vetted them by creating the account.

**Architecture:** One new boolean column (`user_roles.is_approved`), set by the existing `handle_new_user()` trigger based on which signup path created the row (self-service vs. Owner-invited, distinguished by a metadata flag). One new RPC (`approve_employee_rpc`). The login flow checks the flag and blocks unapproved accounts. The Employees screen splits into a pending-approval section (new) and the existing approved-employee table, reusing the existing `remove_employee_rpc` as "reject."

**Tech Stack:** Supabase (Postgres, PL/pgSQL RPCs, trigger functions), React + TypeScript frontend. Manual migration execution via Supabase SQL Editor (this session has no DB credentials beyond the anon key — confirm with whoever runs this plan whether that's still true for them).

## Global Constraints

- No automated test runner in this repo (`package.json` has `dev`/`build`/`typecheck` only). Every frontend task's verification is `npm run typecheck` + `npm run build`. DB tasks are verified with a `SELECT` run by the project owner in the Supabase SQL Editor.
- Migrations must be additive (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) — no `ALTER COLUMN ... TYPE`. This project hit a real outage from a non-additive migration once (see `docs/SUPABASE_SCHEMA_AUDIT.md` and `supabase/migrations/20260714000002_implement_rbac_and_store_isolation.sql`'s policy-cleanup block if you want the history) — don't repeat that.
- Two roles only: `'Owner' | 'Staff'` (a third `'Manager'` role was removed from this codebase — do not reintroduce it or reference it).
- Korean UI/error copy in the existing short, direct tone — see the `RAISE EXCEPTION` messages already in `supabase/migrations/20260714000002_implement_rbac_and_store_isolation.sql` for the reference voice.
- `store_id` is always compared case-sensitively and lowercase (`ssnr-pos-9877`) — don't introduce a new place that compares it case-insensitively or with different casing assumptions than the rest of the codebase.

---

### Task 1: Database — `is_approved` column, trigger, and RPCs

**Files:**
- Create: `supabase/migrations/20260729000003_add_staff_approval_gate.sql`

**Interfaces:**
- Produces: `public.user_roles.is_approved BOOLEAN NOT NULL DEFAULT false`.
- Produces: RPC `public.approve_employee_rpc(p_user_id UUID) RETURNS BOOLEAN` — Owner-only, same-store-only, sets `is_approved = true` for the target row.
- Produces: `public.get_employees_rpc()` now also returns an `is_approved BOOLEAN` column per row (in addition to the existing `user_id, email, name, role, store_id`).
- Modifies: `public.handle_new_user()` (the `AFTER INSERT ON auth.users` trigger function) — now sets `is_approved` based on whether the new row is an Owner, was created via `invite_employee_rpc` (auto-approved), or came from the public self-service signup form (starts unapproved).
- Modifies: `public.invite_employee_rpc(...)` — now tags the `auth.users` row it creates with `'pre_approved': true` in `raw_user_meta_data` so `handle_new_user()` can tell it apart from a self-service signup.
- Consumes: reuses the existing `public.remove_employee_rpc(p_user_id UUID)` unchanged — it's used as the "reject a pending signup" action too (deleting the `auth.users` row cascades to `user_roles`).

- [ ] **Step 1: Read the current definitions before writing this migration**

Read `supabase/migrations/20260714000002_implement_rbac_and_store_isolation.sql` in full at these line ranges to see the exact current bodies you're modifying (already captured below, but confirm nothing has changed since):
- Lines 414–452: `handle_new_user()`.
- Lines 844–919: `invite_employee_rpc(...)`.
- Lines 921–961: `remove_employee_rpc(...)` (reference only — not modified).
- Lines 1020–1054: `get_employees_rpc()`.

**Current `handle_new_user()`** (lines 414–452):

```sql
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
```

**Current `invite_employee_rpc(...)`** (lines 844–919) — the part that matters here is the `INSERT INTO auth.users` call's `raw_user_meta_data` value:

```sql
    jsonb_build_object('name', p_name, 'role', p_role, 'store_id', p_store_id),
```

**Current `get_employees_rpc()`** (lines 1020–1054):

```sql
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
    ur.store_id::VARCHAR(255) AS store_id
  FROM public.user_roles ur
  JOIN auth.users u ON ur.user_id = u.id
  WHERE ur.store_id = v_caller_store;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260729000003_add_staff_approval_gate.sql`:

```sql
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

-- invite_employee_rpc: tag the auth.users row it creates as pre-approved, so handle_new_user
-- (above) auto-approves it instead of leaving it pending.
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

-- New: approve a pending self-service signup. Rejecting reuses the existing
-- remove_employee_rpc(p_user_id) unchanged — deleting the auth.users row is the reject action.
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
```

- [ ] **Step 3: Hand off to the project owner to run the migration**

Ask them to run the file in the Supabase SQL Editor, then verify:

```sql
-- 1. Column exists and every existing row got grandfathered in as approved
SELECT is_approved, COUNT(*) FROM public.user_roles GROUP BY is_approved;
-- Expected: one row, is_approved = true, count = however many employees currently exist.

-- 2. New RPC is callable (will error with "권한이 없습니다" if run as anon/no session, which is fine —
-- this just confirms the function exists and is reachable)
SELECT proname FROM pg_proc WHERE proname = 'approve_employee_rpc';
-- Expected: 1 row.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260729000003_add_staff_approval_gate.sql
git commit -m "feat: gate self-service Staff signup behind owner approval"
```

---

### Task 2: Block login for unapproved accounts

**Files:**
- Modify: `src/components/LoginOverlay.tsx`

**Interfaces:**
- Consumes: `user_roles.is_approved` (Task 1) via the existing `.from('user_roles').select('role, store_id')` query in `handleLogin` — add `is_approved` to the selected columns.

- [ ] **Step 1: Add `is_approved` to the role/store query and block login when false**

In `src/components/LoginOverlay.tsx`, find the normal (non-dev-bypass) login block inside `handleLogin`:

```ts
        if (session?.user.id) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, store_id')
            .eq('user_id', session.user.id)
            .single();

          if (roleData) {
            finalRole = roleData.role as 'Owner' | 'Staff';
            finalStoreId = roleData.store_id;
          } else {
            // admin 이메일이거나 김규호 계정이면 자동으로 관리자로 설정
            const isAdmin = 
              user.user_metadata?.role === '관리자' || 
              user.email?.startsWith('admin') || 
              user.email?.startsWith('rbflrbgh') || 
              displayName === '김규호';
            finalRole = isAdmin ? 'Owner' : 'Staff';
          }
        }

        auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: user.email } });
        onLoginSuccess({
          id: user.id,
          email: user.email || '',
          name: displayName,
          role: finalRole,
          store_id: finalStoreId
        });
```

Replace with (adds the `is_approved` column to the select, and a block-and-sign-out branch before the existing success path):

```ts
        if (session?.user.id) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, store_id, is_approved')
            .eq('user_id', session.user.id)
            .single();

          if (roleData) {
            if (!roleData.is_approved) {
              await supabase.auth.signOut();
              auditLog({ action: 'AUTH_FAILURE', result: 'FAIL', context: { email: user.email, reason: 'pending_approval' } });
              setLoginError('가입 승인 대기 중입니다. 매장 관리자에게 문의해 주세요.');
              setIsLoggingIn(false);
              return;
            }
            finalRole = roleData.role as 'Owner' | 'Staff';
            finalStoreId = roleData.store_id;
          } else {
            // admin 이메일이거나 김규호 계정이면 자동으로 관리자로 설정
            const isAdmin = 
              user.user_metadata?.role === '관리자' || 
              user.email?.startsWith('admin') || 
              user.email?.startsWith('rbflrbgh') || 
              displayName === '김규호';
            finalRole = isAdmin ? 'Owner' : 'Staff';
          }
        }

        auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: user.email } });
        onLoginSuccess({
          id: user.id,
          email: user.email || '',
          name: displayName,
          role: finalRole,
          store_id: finalStoreId
        });
```

Do **not** apply this check to the dev-bypass block above it (the one guarded by `VITE_ENABLE_DEV_LOGIN === 'true' && email.trim() === 'admin'`) — that path always resolves to a hardcoded Owner account for local testing and Owners are always auto-approved (Task 1), so it's unaffected either way; leave that block untouched.

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginOverlay.tsx
git commit -m "fix: block login for accounts pending owner approval"
```

---

### Task 3: Employees screen — pending-approval list

**Files:**
- Modify: `src/components/EmployeesView.tsx`

**Interfaces:**
- Consumes: `is_approved` field now returned by `get_employees_rpc()` (Task 1), and the new `approve_employee_rpc(p_user_id)` RPC (Task 1).
- Consumes: existing `remove_employee_rpc` and its existing wrapper `handleRemoveEmployee` — reused unchanged as the "reject" action for pending rows.

- [ ] **Step 1: Add `is_approved` to the `Employee` type**

Find:

```ts
interface Employee {
  user_id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Staff';
  store_id: string;
}
```

Replace with:

```ts
interface Employee {
  user_id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Staff';
  store_id: string;
  is_approved: boolean;
}
```

- [ ] **Step 2: Add the approve handler**

Find `handleRoleChange` (search for `const handleRoleChange = async`). Add a new handler directly above it:

```ts
  const handleApproveEmployee = async (userId: string, empName: string) => {
    try {
      const { error } = await supabase.rpc('approve_employee_rpc', { p_user_id: userId });
      if (error) throw error;
      showToast(`✅ [${empName}] 직원 가입을 승인했습니다.`);
      fetchEmployees();
    } catch (err: any) {
      console.error(err);
      showAlert(`⚠️ 승인 실패: ${err.message || err}`, { title: '승인 실패' });
    }
  };

```

- [ ] **Step 3: Split the employee list into pending and approved sections**

Find the block that starts with `{/* Employees Table */}` and computes `employees.map(...)` inside the `<tbody>`. Just above that whole `<div className="bo-table-wrap" ...>` block, add a pending-approval section that only renders when there's at least one unapproved row:

```tsx
      {/* Pending Approval */}
      {employees.some(emp => !emp.is_approved) && (
        <div className="bo-card" style={{ marginBottom: '16px', borderColor: 'var(--danger)' }}>
          <div className="bo-card-header" style={{ color: 'var(--danger)' }}>
            ⏳ 승인 대기 중인 가입 요청
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {employees.filter(emp => !emp.is_approved).map(emp => (
              <div key={emp.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                <div>
                  <div className="cell-bold">{emp.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>{emp.email}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="primary" size="sm" onClick={() => handleApproveEmployee(emp.user_id, emp.name)}>
                    승인
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleRemoveEmployee(emp.user_id, emp.name)}>
                    거절
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

```

- [ ] **Step 4: Exclude pending employees from the main (approved) table**

Find:

```tsx
            {loading ? (
              <tr>
                <td colSpan={5} className="cell-empty">불러오는 중...</td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="cell-empty">등록된 직원이 없습니다.</td>
              </tr>
            ) : (
              employees.map((emp) => {
```

Replace with (filters to only approved employees, so a pending row doesn't show up twice — once in the new pending section, again in the role-change table where "권한 변경"/"강제 해고" controls wouldn't make sense for an account that can't even log in yet):

```tsx
            {loading ? (
              <tr>
                <td colSpan={5} className="cell-empty">불러오는 중...</td>
              </tr>
            ) : employees.filter(emp => emp.is_approved).length === 0 ? (
              <tr>
                <td colSpan={5} className="cell-empty">등록된 직원이 없습니다.</td>
              </tr>
            ) : (
              employees.filter(emp => emp.is_approved).map((emp) => {
```

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 6: Hand off for manual verification**

This depends on Task 1's migration already being applied — confirm that first. Then, with the project owner (Owner-role login required): have someone self-service-signup as Staff from the login screen using the store code, confirm they get "아이디 또는 비밀번호가 올바르지 않습니다" replaced by the new "가입 승인 대기 중입니다..." message on login attempt (not a generic credentials error), confirm the Owner sees them in the new "⏳ 승인 대기 중인 가입 요청" card in [직원], click "승인", and confirm the same account can then log in normally and appears in the regular employee table. Separately, confirm inviting someone via "신규 직원 등록 (초대)" still logs them in immediately with no pending state (that path is unaffected — auto-approved).

- [ ] **Step 7: Commit**

```bash
git add src/components/EmployeesView.tsx
git commit -m "feat: add pending-approval section to the Employees screen"
```
