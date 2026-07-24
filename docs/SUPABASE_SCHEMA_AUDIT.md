# Supabase schema audit

## Status: Resolved (2026-07-24)

All three migrations below were run manually in the Supabase SQL Editor, in order:
`20260723000000_restore_english_schema_compatibility.sql`, then the corrected
`20260714000002_implement_rbac_and_store_isolation.sql` (see fix note below), then
`20260714000003_remove_inventory_and_stock_logic.sql`. Verified `products`, `orders`,
`user_roles` resolve via `to_regclass`, and `complete_sale`/`refund_order`/`get_employees_rpc`
exist in `pg_proc`.

**Fix applied to `20260714000002`**: its policy-cleanup block (dropping policies that
depend on `store_id` before the column-type `ALTER`s) predated the compatibility
migration and didn't know about the newer `products_compat_select`,
`products_compat_owner_write`, `orders_compat_select`, and `user_roles_compat_select`
policies, so the first run failed with `cannot alter type of a column used in a policy
definition`. Added those four names to the cleanup block.

## Root cause

The configured project `bhnlbfwajdrlxmjjqnio` currently returns `PGRST205` for `products`, `orders`, and `user_roles`, and `PGRST202` for the transaction RPCs. It does return `200` for `order_items`, `customers`, `closing_reports`, `subscriptions`, and `inventory_movements`. No localized table names were found in the project or the live REST API probes.

This is a partially applied or drifted migration state, not a frontend rename. The existing RBAC migration also altered `customers` and `subscriptions` before creating them, so a clean replay could fail before reaching the policy and RPC definitions.

## Canonical names used by the application

| Area | Name |
| --- | --- |
| Product CRUD and sale catalog | `public.products` |
| Sales history and checkout | `public.orders` |
| Line items | `public.order_items` |
| Customer screen | `public.customers` |
| Employee roles | `public.user_roles` |
| Closing reports | `public.closing_reports` |
| Deprecated audit/inventory records | `public.inventory_movements`, `public.product_audit_logs` |
| Subscription metadata | `public.subscriptions` |

RPC references are `complete_sale`, `refund_order`, `adjust_product_stock`, `get_employees_rpc`, `invite_employee_rpc`, `update_employee_role_rpc`, and `remove_employee_rpc`.

## Changes in this branch

- Added `supabase/migrations/20260723000000_restore_english_schema_compatibility.sql`.
- Fixed the ordering bug in `20260714000002_implement_rbac_and_store_isolation.sql` so `customers` and `subscriptions` are created before they are altered.
- The compatibility migration restores missing `orders`, `products`, and `user_roles`, adds required store/discount columns, enables RLS, adds scoped product/order/role policies, and requests a PostgREST schema-cache reload.

## Required manual SQL

The connected Supabase management tools denied schema access and DDL execution, so the remote project could not be changed from this session. In the Supabase SQL Editor, run the new compatibility migration first. Then run the SQL from `20260714000002_implement_rbac_and_store_isolation.sql` and `20260714000003_remove_inventory_and_stock_logic.sql` once, in that order, to restore the missing RPCs and final RLS definitions. Do not rerun the earlier migration that drops and recreates `orders` and `order_items`.

Afterward verify:

```sql
NOTIFY pgrst, 'reload schema';
SELECT to_regclass('public.products'), to_regclass('public.orders'), to_regclass('public.user_roles');
```

Then regenerate Supabase TypeScript types from the project dashboard or CLI and commit the generated file if the project adopts one. No generated database type file exists in the repository currently.
