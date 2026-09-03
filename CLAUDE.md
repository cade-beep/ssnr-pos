# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite (5173) + Electron together
npm run dev:vite   # renderer only — enough for most UI work
npm run typecheck  # tsc --noEmit; the only automated check in the repo
npm run build      # tsc + vite build
```

No test runner, no linter. `tsc` is strict with `noUnusedLocals`/`noUnusedParameters`, so unused imports break the build — run `npm run typecheck` before claiming a change compiles.

`.env` is required at startup: `src/supabase.ts` throws if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing. See `.env.example`.

## Architecture

React 18 + TypeScript renderer (Vite) inside Electron. `electron/main.js` is a hand-written ts-node bootstrap that requires `electron/main.ts` — it is *not* compiled output, don't overwrite it. Styling is one hand-written `src/index.css`; no CSS framework.

Supabase (Postgres + Auth) is the source of truth. Google Sheets is **archive-only**: `src/services/archiveSaleService.ts` fires after a sale is already committed to Supabase, and nothing is ever read back from it. Never route a read through it.

`src/App.tsx` (~1400 lines) is the app shell: it holds cart, products, session, drafts, and toast state, and passes everything down. Tabs (`sales | history | products | customers | employees | settings`) are conditionally rendered components, not routes.

### Money and the checkout path

Sales go through the `complete_sale` Postgres RPC, never a direct `orders` insert. The RPC (`supabase/migrations/20260729000001_harden_complete_sale.sql`) re-validates everything the client sends: product belongs to the store, `is_active`, unit price matches the DB, discount ≤ subtotal, and `p_final_total` equals the server's own recomputation. So any change to client-side discount math must be mirrored in a migration or checkout starts failing with `가격 정보가 일치하지 않습니다` / final-total mismatch.

Discount model lives in `CartItem` (`src/types.ts`): per-item amount or percent discount over a `discountQty`, plus a cart-wide percent that skips items flagged `excludeFromCartDiscount`. `App.tsx` distributes the cart discount across lines into `line_total` and appends a synthetic `product_id: 'DISCOUNT'` line for the receipt and the RPC payload. Staff role is blocked from applying either discount type *in the RPC*, not just in the UI.

Idempotency: the client generates a key per checkout attempt and holds it in `activeIdempotencyKey` so a retry after a timeout reuses it; the RPC returns `is_duplicate` instead of double-charging.

Offline: on a network failure the payload is queued in localStorage (`src/lib/offlineQueue.ts`) and replayed through the same `complete_sale` RPC by `initOfflineQueueSync` in `App.tsx`. The queued shape must stay in sync with the live call's arguments.

### Auth and roles

`Owner | Staff`, read from the `user_roles` table on login (`fetchUserRoleAndStore` in `App.tsx`, also duplicated in `LoginOverlay.tsx`). There is a legacy fallback that grants Owner by email prefix when the row is missing. Every table is store-scoped by `store_id` with RLS; employee management goes through `*_rpc` functions (`get_employees_rpc`, `approve_employee_rpc`, `invite_employee_rpc`, …), refunds through `refund_order` / `refund_order_items`.

Migrations in `supabase/migrations/` are the schema record and are applied through the Supabase dashboard/CLI — add a new dated file rather than editing an existing one.

### Conventions

- User-facing strings are Korean; code, comments, and commit messages are English (Conventional Commits).
- Errors reaching the user go through `getFriendlyErrorMessage` in `App.tsx`, which maps raw Postgres/network messages to Korean guidance — extend that map instead of surfacing raw errors.
- Every Supabase call that blocks the UI is wrapped in `withTimeout` (`src/utils/asyncHelper.ts`, default 10s; checkout uses 12s).
- Dialogs use `showAlert`/`showConfirm`/`showPrompt` from `src/components/ui/dialogs.tsx`, never `window.alert`.
- Product search matches Korean initials via `getChosung` in `src/utils/hangul.ts`.
- `src/productsData.ts` is seed data only — used once when an Owner opens an empty store.
