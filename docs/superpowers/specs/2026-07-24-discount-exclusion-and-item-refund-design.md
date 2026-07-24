# Design: Per-item discount exclusion & item-level partial refund

## Overview

Two independent checkout/history improvements, requested together:

- **A. Discount exclusion** — let the cashier mark specific cart items (e.g. a
  paper bag) as excluded from the cart-wide percentage discount, so "전체 할인"
  doesn't accidentally discount things that shouldn't be discounted.
- **B. Item-level partial refund** — let an Owner refund specific line items
  from a past order instead of only the whole order.

These ship together because they touch adjacent code (Cart, checkout total
math, order history) but are otherwise unrelated and can be built/tested
independently.

## Non-goals

- No change to payment methods (confirmed: cash is not accepted, card/transfer
  only — no work needed there).
- No quantity-level partial refund (e.g. "refund 1 of 3 units on this line").
  A line item is refunded as a whole unit of work. If finer granularity turns
  out to be needed later, it's a separate follow-up.
- No change to the per-item discount feature that already exists (🏷️ 할인 버튼) —
  discount exclusion is a new, separate toggle.

## A. Discount exclusion per cart item

### Data model

`CartItem` (`src/types.ts`) gains one optional field:

```ts
excludeFromCartDiscount?: boolean;
```

This is cart-session state only (like `discount`/`discountPercent` already
are) — it does not need a DB column. It never reaches the server as its own
field; it only changes what the client computes as `cartDiscountAmount`
before calling `complete_sale`.

### Calculation (`src/App.tsx`)

Today (`App.tsx:595-600`):

```ts
const subtotalAfterItemDiscounts = originalSubtotal - totalItemDiscount;
const cartDiscountAmount = round(subtotalAfterItemDiscounts * pct/100);
```

Change to compute the cart-discount base only from non-excluded items:

```ts
const discountableSubtotalAfterItemDiscounts = cart
  .filter(item => !item.excludeFromCartDiscount)
  .reduce((sum, item) => sum + (post-item-discount line total), 0);
const cartDiscountAmount = round(discountableSubtotalAfterItemDiscounts * pct/100);
```

`finalTotal` still subtracts `cartDiscountAmount` from the full
`subtotalAfterItemDiscounts` (excluded items still cost full price, they just
don't shrink further).

No RPC change needed: `complete_sale` already treats the cart discount as a
single pre-computed `p_global_discount` amount and only verifies that
`sum(item totals) - p_global_discount == p_total_amount`. Since the client
computes the (now-smaller) discount correctly, server-side verification
passes unchanged.

### UI (`src/components/Cart.tsx`)

- Each cart line gets a small toggle (icon button, next to the existing 🏷️
  할인 button) — "할인 제외" / active state when `excludeFromCartDiscount` is
  true.
- Only relevant once a cart-wide discount is active; show it whenever the
  cart has 2+ items so the cashier can pre-mark exclusions before applying
  the discount. Non-Staff roles only (same gate as the existing discount
  button — Staff can't discount at all).
- Excluded items get a small badge ("할인 제외") in the cart list so it's
  visually obvious which items won't move when a cart discount is applied.

### Receipt (`src/components/ReceiptModal.tsx`)

No structural change required — the receipt already renders the single
`cartDiscountAmount` total, not a per-item breakdown of the cart discount.
Excluded items just naturally show their full price with no cart-discount
effect, which is already correct once the App.tsx calculation change lands.

## B. Item-level partial refund

### Data model (new migration)

New file `supabase/migrations/20260724000000_add_item_level_refunds.sql`,
additive only (`ADD COLUMN IF NOT EXISTS`, no type changes, no policy
rewrites — avoids the dependency-ordering issue hit in the schema-drift fix):

```sql
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;
```

`orders.is_refunded` keeps its current meaning: **fully** refunded (every
line item refunded). `orders.refunded_amount` accumulates partial refunds so
revenue stats can subtract the right amount without needing to re-sum
`order_items` on every read.

### New RPC: `refund_order_items`

```sql
refund_order_items(p_order_number VARCHAR, p_item_ids BIGINT[], p_reason VARCHAR) RETURNS JSONB
```

Mirrors `refund_order`'s auth/authorization shape:

1. Require authenticated session; require `role = 'Owner'` (same restriction
   as full refund today).
2. Lock the `orders` row by `order_number` (`FOR UPDATE`), verify store
   match, verify the order is not already fully refunded.
3. For each id in `p_item_ids`: verify it belongs to this order and is not
   already refunded (skip/ignore duplicates rather than erroring, so a
   retried request is idempotent); compute that line's net amount
   (`product_price * quantity - discount*discount_qty`); mark
   `is_refunded = true`, `refunded_at = now()`, `refunded_amount = <that net amount>`.
4. Sum the newly refunded amounts into `orders.refunded_amount`.
5. If every `order_items` row for this order is now refunded, also set
   `orders.is_refunded = true`, `refunded_at`, `refunded_by` (reuses the
   existing full-refund fields — a full refund via the item path looks
   identical to today's full refund afterward).
6. Return `{ success, order_id, refunded_amount, fully_refunded }`.

Grant `EXECUTE` to `authenticated`, matching the existing RPCs.

### UI (`src/components/HistoryView.tsx`)

- Existing "환불" button/flow is unchanged (still does a full refund in one
  click — that's the common case).
- Add a second action, "품목별 환불", opening a modal listing that order's
  `order_items` with a checkbox per line (already-refunded lines shown
  disabled/checked with a "환불됨" tag). Confirm requires a reason, same
  prompt pattern as `handleRefund`.
- On submit, call `refund_order_items`, then `fetchHistory()` to refresh.
- Fix the existing full-refund success toast: it currently says "재고가
  복원되었습니다" (stock restored), which stopped being true once inventory
  logic was removed. Update the copy to just confirm the refund.

### Stats/revenue calculations

`HistoryView.tsx` has a few places that sum order totals while skipping
refunded orders (e.g. the trend chart at line 298, revenue stat around line
638). These currently do `if (o.is_refunded) return;` and otherwise use the
full `final_total`. Change the amount used to
`(o.final_total ?? o.total_amount) - (o.refunded_amount || 0)` and only skip
entirely when `is_refunded` is true (fully refunded, contributes 0 either
way). This makes partially-refunded orders contribute their remaining
(non-refunded) amount instead of either their full amount or zero.

## Error handling

- RPC errors surface through the same `getFriendlyErrorMessage`/`showAlert`
  path already used by `handleRefund` — no new error-handling pattern needed.
- Re-submitting a partial refund for an already-refunded line is a no-op
  (step 3 above skips it) rather than an error, so a flaky network retry
  can't double-refund or throw.

## Testing / verification

- `npm run typecheck` and `npm run build` after the frontend changes.
- Manual verification in the live app (cashier login required, done by the
  project owner): apply a cart discount with one item excluded and confirm
  the excluded item's price doesn't shrink; complete a sale and check the
  receipt total matches.
- New migration run manually in the Supabase SQL Editor by the project
  owner, same process as the schema-drift fix, verified with a follow-up
  `SELECT` confirming the new columns exist and a manual partial refund on a
  test order confirms `orders.refunded_amount` and the item's `is_refunded`
  update correctly.
