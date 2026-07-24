# Cart Discount Exclusion & Item-Level Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier exclude specific cart items from the cart-wide percentage discount, and let an Owner refund specific line items from a past order instead of only the whole order.

**Architecture:** Feature A (discount exclusion) is a pure frontend change — one new optional field on `CartItem` and a calculation change in `App.tsx`, no server changes. Feature B (item-level refund) adds two DB columns and one new `SECURITY DEFINER` RPC (`refund_order_items`), following the same shape as the existing `refund_order` RPC, plus a new selection modal in `HistoryView.tsx`.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Supabase (Postgres + Auth via `@supabase/supabase-js`), plain CSS (no CSS-in-JS framework), `lucide-react` icons.

## Global Constraints

- This repo has no automated test runner (`package.json` only defines `dev`, `build`, `typecheck` — no `test` script, no Jest/Vitest dependency). Do not add one as part of this work. Every task's "test" step is `npm run typecheck` (and `npm run build` on the last task of each feature) plus a manual check — there is no `pytest`/`jest`-style failing-test-first cycle here.
- The project owner is the only one who can log into the live app (Supabase Auth login) or run SQL in the Supabase SQL Editor — the agent implementing this plan cannot do either. Any step that needs one of those is written as "hand off to the project owner," not as something the implementer executes.
- Match existing code style exactly: inline `style={{...}}` for one-off layout in `.tsx` files (as `Cart.tsx`/`HistoryView.tsx` already do), dedicated CSS classes in `index.css` only for reusable/stateful elements (buttons, badges used more than once) — mirror `.item-discount-btn` for the new toggle button.
- Korean UI copy only, matching the tone already in the file being edited (short, direct, occasional emoji prefix on toasts/alerts — see existing `handleRefund` strings for the reference tone).
- All new Supabase migrations must be additive (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) — no `ALTER COLUMN ... TYPE` and no policy rewrites, per the design spec's explicit goal of avoiding the dependency-ordering failure hit in the previous schema-drift fix.

---

### Task 1: Cart-wide discount exclusion toggle

**Files:**
- Modify: `src/types.ts:32-39` (`CartItem` interface)
- Modify: `src/App.tsx` (discount calculation block, cart mutation handlers, `Cart` props)
- Modify: `src/components/Cart.tsx` (props, per-item toggle button, exclusion badge)
- Modify: `src/index.css` (new `.item-exclude-btn` styles, mirroring `.item-discount-btn`)

**Interfaces:**
- Produces: `CartItem.excludeFromCartDiscount?: boolean`
- Produces: `App.tsx` handler `handleToggleItemDiscountExclusion(productId: string): void`
- Produces: `Cart.tsx` prop `onToggleDiscountExclusion: (productId: string) => void`

- [ ] **Step 1: Add the field to `CartItem`**

In `src/types.ts`, the `CartItem` interface currently reads:

```ts
export interface CartItem {
  product: Product;
  quantity: number;
  discount?: number; // 개당 할인 금액 (원 단위)
  discountQty?: number; // 할인을 적용할 수량 (개수)
  isPercent?: boolean; // 퍼센트 할인 여부
  discountPercent?: number; // 할인 퍼센트 수치 (예: 10)
}
```

Add one field at the end:

```ts
export interface CartItem {
  product: Product;
  quantity: number;
  discount?: number; // 개당 할인 금액 (원 단위)
  discountQty?: number; // 할인을 적용할 수량 (개수)
  isPercent?: boolean; // 퍼센트 할인 여부
  discountPercent?: number; // 할인 퍼센트 수치 (예: 10)
  excludeFromCartDiscount?: boolean; // 전체 할인 계산에서 이 품목을 제외할지 여부
}
```

- [ ] **Step 2: Run typecheck to confirm the type change alone is inert**

Run: `npm run typecheck`
Expected: passes with no errors (the field is optional, so nothing else breaks yet).

- [ ] **Step 3: Add the toggle handler in `App.tsx`**

Find `handleApplyItemDiscount` in `src/App.tsx` (around line 569):

```ts
  // Apply custom item discount
  const handleApplyItemDiscount = (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId
          ? { 
              ...item, 
              discount: Math.max(0, amount), 
              discountQty: Math.max(0, qty),
              isPercent: !!isPercent,
              discountPercent: percentVal || 0
            }
          : item
      )
    );
  };
```

Add a new handler directly after it:

```ts
  // Toggle whether a cart item is excluded from the cart-wide percentage discount
  const handleToggleItemDiscountExclusion = (productId: string) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId
          ? { ...item, excludeFromCartDiscount: !item.excludeFromCartDiscount }
          : item
      )
    );
  };
```

- [ ] **Step 4: Change the cart-discount base to exclude flagged items**

In `src/App.tsx`, find the discount calculation block (around line 595):

```ts
  const originalSubtotal = safeNumber(cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0));
  const totalItemDiscount = safeNumber(cart.reduce((sum, item) => sum + getItemDiscountInfo(item).totalDiscount, 0));
  const subtotalAfterItemDiscounts = Math.max(0, originalSubtotal - totalItemDiscount);
  const cartDiscountAmount = safeNumber(Math.round(subtotalAfterItemDiscounts * (Math.min(100, Math.max(0, cartDiscountPercent)) / 100)));
  const totalDiscount = safeNumber(totalItemDiscount + cartDiscountAmount);
  const finalTotal = Math.max(0, subtotalAfterItemDiscounts - cartDiscountAmount);
```

Replace with:

```ts
  const originalSubtotal = safeNumber(cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0));
  const totalItemDiscount = safeNumber(cart.reduce((sum, item) => sum + getItemDiscountInfo(item).totalDiscount, 0));
  const subtotalAfterItemDiscounts = Math.max(0, originalSubtotal - totalItemDiscount);
  const discountableSubtotalAfterItemDiscounts = safeNumber(
    cart
      .filter((item) => !item.excludeFromCartDiscount)
      .reduce((sum, item) => sum + (item.product.price * item.quantity - getItemDiscountInfo(item).totalDiscount), 0)
  );
  const cartDiscountAmount = safeNumber(Math.round(discountableSubtotalAfterItemDiscounts * (Math.min(100, Math.max(0, cartDiscountPercent)) / 100)));
  const totalDiscount = safeNumber(totalItemDiscount + cartDiscountAmount);
  const finalTotal = Math.max(0, subtotalAfterItemDiscounts - cartDiscountAmount);
```

`finalTotal` still subtracts `cartDiscountAmount` from the *full* `subtotalAfterItemDiscounts` — excluded items keep their full price, they just don't shrink the discount base.

- [ ] **Step 5: Wire the handler into the `<Cart />` prop list**

In `src/App.tsx`, find the `<Cart ... />` element (around line 837-856):

```tsx
              <Cart
                items={cart}
                totalAmount={finalTotal}
                cartDiscountPercent={cartDiscountPercent}
                cartDiscountAmount={cartDiscountAmount}
                itemDiscountAmount={totalItemDiscount}
                onIncrease={handleIncreaseQty}
                onDecrease={handleDecreaseQty}
                onDelete={handleRemoveFromCart}
                onClear={handleClearCart}
                onCheckout={() => {
                  const key = crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                  setActiveIdempotencyKey(key);
                  setIsPaymentModalOpen(true);
                }}
                onApplyDiscount={handleApplyGlobalDiscount}
                onApplyItemDiscount={handleApplyItemDiscount}
                onSetQuantity={handleSetQty}
                role={currentCashier.role}
              />
```

Add `onToggleDiscountExclusion={handleToggleItemDiscountExclusion}` after `onApplyItemDiscount`:

```tsx
                onApplyDiscount={handleApplyGlobalDiscount}
                onApplyItemDiscount={handleApplyItemDiscount}
                onToggleDiscountExclusion={handleToggleItemDiscountExclusion}
                onSetQuantity={handleSetQty}
                role={currentCashier.role}
              />
```

- [ ] **Step 6: Run typecheck — expect a prop-type error**

Run: `npm run typecheck`
Expected: FAIL — `Cart` doesn't declare an `onToggleDiscountExclusion` prop yet. This confirms `App.tsx` is correctly wired and waiting on `Cart.tsx`.

- [ ] **Step 7: Add the prop and toggle button to `Cart.tsx`**

In `src/components/Cart.tsx`, update `CartProps`:

```ts
interface CartProps {
  items: CartItem[];
  totalAmount: number;
  cartDiscountPercent: number;
  cartDiscountAmount: number;
  itemDiscountAmount: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onDelete: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onApplyDiscount: (percent: number) => void;
  onApplyItemDiscount: (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => void;
  onToggleDiscountExclusion: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  role: 'Owner' | 'Manager' | 'Staff';
}
```

Destructure it in the component signature (add `onToggleDiscountExclusion,` next to `onApplyItemDiscount,`):

```tsx
const Cart: React.FC<CartProps> = ({
  items,
  totalAmount,
  cartDiscountPercent,
  cartDiscountAmount,
  itemDiscountAmount,
  onIncrease,
  onDecrease,
  onDelete,
  onClear,
  onCheckout,
  onApplyDiscount,
  onApplyItemDiscount,
  onToggleDiscountExclusion,
  onSetQuantity,
  role,
}) => {
```

- [ ] **Step 8: Run typecheck — expect it to pass again**

Run: `npm run typecheck`
Expected: PASS (prop is declared and passed; not used in JSX yet, so no unused-var error since it's a destructured function prop, not a local variable — TS/ESLint in this repo does not flag unused destructured props).

- [ ] **Step 9: Add the exclusion badge next to the item name**

In `src/components/Cart.tsx`, find the "Top Row" inside the cart items map (around line 256-264):

```tsx
                {/* Top Row: Name on Left, Total Price on Right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="cart-item-name">
                    {item.product.name}
                  </div>
                  <div className="cart-item-total" style={{ width: 'auto', textAlign: 'right' }}>
                    {((isDiscounted ? finalItemPrice : item.product.price) * item.quantity).toLocaleString()}원
                  </div>
                </div>
```

Replace with:

```tsx
                {/* Top Row: Name on Left, Total Price on Right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="cart-item-name">
                    {item.product.name}
                    {item.excludeFromCartDiscount && (
                      <span
                        className="bo-badge"
                        style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', color: 'var(--text-secondary)' }}
                      >
                        할인 제외
                      </span>
                    )}
                  </div>
                  <div className="cart-item-total" style={{ width: 'auto', textAlign: 'right' }}>
                    {((isDiscounted ? finalItemPrice : item.product.price) * item.quantity).toLocaleString()}원
                  </div>
                </div>
```

- [ ] **Step 10: Add the toggle button next to the per-item discount button**

In `src/components/Cart.tsx`, find the "Bottom Row" controls (around line 313-325):

```tsx
                    {/* Dedicated Per-Item Discount Button */}
                    {role !== 'Staff' && (
                      <button
                        type="button"
                        className={`item-discount-btn ${isDiscounted ? 'discounted' : ''}`}
                        onClick={() => openItemDiscountModal(item)}
                      >
                        <span>🏷️</span>
                        <span>{isDiscounted ? '할인 수정' : '할인'}</span>
                      </button>
                    )}
```

Add the exclusion toggle right after it (still inside the same `{role !== 'Staff' && ( ... )}` block, so Staff never sees discount controls at all — consistent with the existing gate):

```tsx
                    {/* Dedicated Per-Item Discount Button */}
                    {role !== 'Staff' && (
                      <>
                        <button
                          type="button"
                          className={`item-discount-btn ${isDiscounted ? 'discounted' : ''}`}
                          onClick={() => openItemDiscountModal(item)}
                        >
                          <span>🏷️</span>
                          <span>{isDiscounted ? '할인 수정' : '할인'}</span>
                        </button>
                        <button
                          type="button"
                          className={`item-exclude-btn ${item.excludeFromCartDiscount ? 'active' : ''}`}
                          onClick={() => onToggleDiscountExclusion(item.product.id)}
                          title="전체 할인 적용 시 이 상품을 제외합니다"
                        >
                          <span>{item.excludeFromCartDiscount ? '✅' : '⬜'}</span>
                          <span>할인 제외</span>
                        </button>
                      </>
                    )}
```

- [ ] **Step 11: Add `.item-exclude-btn` styles**

In `src/index.css`, find the end of the `.item-discount-btn` rule block (around line 1075-1082):

```css
.item-discount-btn.discounted {
  background: #ffe8cc;
  color: #e8590c;
  border: 1.5px solid #ffd8a8;
}
.item-discount-btn.discounted:hover {
  background: #ffd8a8;
}
```

Add directly after it:

```css
.item-exclude-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 28px;
  border-radius: 14px;
  border: none;
  background: #f1f5f9;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.item-exclude-btn:hover {
  background: #e2e8f0;
}
.item-exclude-btn.active {
  background: #e2e8f0;
  color: var(--text-primary);
  border: 1.5px solid #cbd5e1;
}
```

- [ ] **Step 12: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS with no errors.

- [ ] **Step 13: Hand off for manual verification**

Ask the project owner to: open the app, add 2+ items to the cart, tap "할인 제외" on one item, apply a 10% cart-wide discount, and confirm the excluded item's line total didn't shrink while the other item's did, and that `총 결제 금액` reflects only the non-excluded item's discount.

- [ ] **Step 14: Commit**

```bash
git add src/types.ts src/App.tsx src/components/Cart.tsx src/index.css
git commit -m "feat: let cart items be excluded from the cart-wide discount"
```

---

### Task 2: Item-level refund — Supabase migration and RPC

**Files:**
- Create: `supabase/migrations/20260724000000_add_item_level_refunds.sql`

**Interfaces:**
- Produces: `public.order_items.is_refunded BOOLEAN`, `public.order_items.refunded_at TIMESTAMPTZ`, `public.order_items.refunded_amount NUMERIC`
- Produces: `public.orders.refunded_amount NUMERIC`
- Produces: RPC `public.refund_order_items(p_order_number VARCHAR, p_item_ids BIGINT[], p_reason VARCHAR) RETURNS JSONB` — returns `{ success: true, order_id, refunded_amount, fully_refunded }` on success, raises an exception (caught by the caller as a Postgres error) on any failure.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260724000000_add_item_level_refunds.sql`:

```sql
-- Migration: Item-level partial refunds
-- Adds refund tracking to order_items/orders and a new RPC that refunds
-- specific line items instead of only the whole order. Additive only
-- (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION) — no ALTER COLUMN
-- TYPE, so this can't hit the policy-dependency ordering issue that broke
-- 20260714000002 on first run.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0 NOT NULL;

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
  -- 1. Verify Authentication & Role (Owner only, same as full refund_order)
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증되지 않은 세션입니다.';
  END IF;

  SELECT store_id, role INTO v_store_id, v_role FROM public.user_roles WHERE user_id = v_user_id;

  IF v_role <> 'Owner' THEN
    RAISE EXCEPTION '품목별 환불 처리 권한이 없습니다. 소유자 권한이 요구됩니다.';
  END IF;

  -- 2. Lock the order row & verify store match
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

  -- 3. Refund each selected, not-yet-refunded line item (lock rows first)
  FOR v_item IN
    SELECT id, product_price, quantity, discount, discount_qty
    FROM public.order_items
    WHERE order_id = v_order_id AND id = ANY(p_item_ids) AND is_refunded = false
    FOR UPDATE
  LOOP
    v_item_net_amount := GREATEST(0, (v_item.product_price * v_item.quantity) - (COALESCE(v_item.discount, 0) * COALESCE(v_item.discount_qty, 0)));

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

  -- 4. If every line is now refunded, this order is fully refunded
  SELECT COUNT(*) INTO v_remaining_unrefunded
  FROM public.order_items
  WHERE order_id = v_order_id AND is_refunded = false;

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

Ask the project owner to paste the full file into the Supabase SQL Editor (same project used for the earlier schema-drift fix) and run it, then run this verification query and share the result:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'order_items' AND column_name IN ('is_refunded', 'refunded_at', 'refunded_amount');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'refunded_amount';

SELECT proname FROM pg_proc WHERE proname = 'refund_order_items';
```

Expected: 3 rows from the first query, 1 row from the second, 1 row from the third.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260724000000_add_item_level_refunds.sql
git commit -m "feat: add refund_order_items RPC and item-level refund columns"
```

---

### Task 3: Item-level refund — HistoryView UI

**Files:**
- Modify: `src/components/HistoryView.tsx`

**Interfaces:**
- Consumes: RPC `refund_order_items(p_order_number, p_item_ids, p_reason)` from Task 2, returning `{ success, order_id, refunded_amount, fully_refunded }`
- Consumes: `order_items.id`, `order_items.is_refunded`, `orders.refunded_amount` columns from Task 2

- [ ] **Step 1: Add the new columns to the fetch query**

In `src/components/HistoryView.tsx`, find the `orders` select (around line 74-98):

```ts
          total_quantity,
          received_amount,
          change,
          cashier_name,
          is_refunded,
          refunded_at,
          refunded_by,
          subtotal,
          item_discount_amount,
          cart_discount_percent,
          cart_discount_amount,
          total_discount,
          final_total,
          order_items (
            product_id,
            product_name,
            product_price,
            quantity,
            discount,
            discount_qty,
            is_percent,
            discount_percent
          )
        `)
```

Replace with:

```ts
          total_quantity,
          received_amount,
          change,
          cashier_name,
          is_refunded,
          refunded_at,
          refunded_by,
          refunded_amount,
          subtotal,
          item_discount_amount,
          cart_discount_percent,
          cart_discount_amount,
          total_discount,
          final_total,
          order_items (
            id,
            product_id,
            product_name,
            product_price,
            quantity,
            discount,
            discount_qty,
            is_percent,
            discount_percent,
            is_refunded,
            refunded_amount
          )
        `)
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (this file uses `any[]` for `orders` state, so new fields don't need type updates).

- [ ] **Step 3: Add new icon import and modal/button imports**

In `src/components/HistoryView.tsx`, the top of the file currently reads:

```ts
import React, { useState, useEffect } from 'react';
import { Receipt, PaymentMethod, CartItem } from '../types';
import { supabase } from '../supabase';
import { Search, Calendar, RefreshCw, Undo, Coins, TrendingUp, Award, ShoppingBag, Eye } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import { showAlert, showPrompt } from './ui/dialogs';
import SalesTrendChart, { TrendBucket } from './SalesTrendChart';
```

Replace with:

```ts
import React, { useState, useEffect } from 'react';
import { Receipt, PaymentMethod, CartItem } from '../types';
import { supabase } from '../supabase';
import { Search, Calendar, RefreshCw, Undo, Coins, TrendingUp, Award, ShoppingBag, Eye, ListChecks } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import { showAlert, showPrompt } from './ui/dialogs';
import SalesTrendChart, { TrendBucket } from './SalesTrendChart';
import Modal from './ui/Modal';
import Button from './ui/Button';
```

- [ ] **Step 4: Add state for the item-refund modal**

Find the filter-state block (around line 22-28):

```ts
  const [dateRangeType, setDateRangeType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'CARD' | 'TRANSFER'>('all');
  const [refundFilter, setRefundFilter] = useState<'all' | 'active' | 'refunded'>('all');
  const [selectedProduct, setSelectedProduct] = useState('all');
```

Add after it:

```ts
  const [selectedProduct, setSelectedProduct] = useState('all');

  // Item-level refund modal state
  const [itemRefundOrder, setItemRefundOrder] = useState<any | null>(null);
  const [selectedRefundItemIds, setSelectedRefundItemIds] = useState<number[]>([]);
```

(Note: `selectedProduct` line appears once — this step both keeps it and adds the two new lines directly after it.)

- [ ] **Step 5: Add the stats calculation fix for partial refunds**

In `src/components/HistoryView.tsx`, find the `stats` reduce body (around line 212-251):

```ts
    const netSalesVal = Number(curr.final_total) || Number(curr.total_amount) || 0;

    if (curr.is_refunded) {
      acc.refundCount += 1;
      acc.refundAmount += netSalesVal;
    } else {
      acc.grossSales += subtotalVal;
      acc.totalDiscount += totalDiscountVal;
      acc.netSales += netSalesVal;
      acc.salesCount += 1;
      acc.totalQty += Number(curr.total_quantity) || 0;

      // Check if order date is today (local date)
      const orderDate = new Date(curr.payment_date_time);
      const today = new Date();
      if (orderDate.toDateString() === today.toDateString()) {
        acc.todayDiscount += totalDiscountVal;
      }

      // Check if order date is current month/year
      if (orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear()) {
        acc.monthlyDiscount += totalDiscountVal;
      }
      
      if (curr.payment_method === 'CARD') {
        acc.cardAmount += netSalesVal;
        acc.cardCount += 1;
      } else {
        acc.transferAmount += netSalesVal;
        acc.transferCount += 1;
      }
```

Replace with:

```ts
    const netSalesVal = Number(curr.final_total) || Number(curr.total_amount) || 0;
    const refundedAmountVal = Number(curr.refunded_amount) || 0;

    if (curr.is_refunded) {
      acc.refundCount += 1;
      acc.refundAmount += netSalesVal;
    } else {
      // Partially-refunded orders (some order_items refunded, order itself
      // still active) contribute only their remaining, non-refunded amount.
      const effectiveNetSalesVal = Math.max(0, netSalesVal - refundedAmountVal);
      acc.grossSales += subtotalVal;
      acc.totalDiscount += totalDiscountVal;
      acc.netSales += effectiveNetSalesVal;
      acc.refundAmount += refundedAmountVal;
      acc.salesCount += 1;
      acc.totalQty += Number(curr.total_quantity) || 0;

      // Check if order date is today (local date)
      const orderDate = new Date(curr.payment_date_time);
      const today = new Date();
      if (orderDate.toDateString() === today.toDateString()) {
        acc.todayDiscount += totalDiscountVal;
      }

      // Check if order date is current month/year
      if (orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear()) {
        acc.monthlyDiscount += totalDiscountVal;
      }
      
      if (curr.payment_method === 'CARD') {
        acc.cardAmount += effectiveNetSalesVal;
        acc.cardCount += 1;
      } else {
        acc.transferAmount += effectiveNetSalesVal;
        acc.transferCount += 1;
      }
```

`refundCount` intentionally still counts only *fully* refunded orders (unchanged meaning); partial-refund money is folded into `refundAmount` without incrementing that count.

- [ ] **Step 6: Fix the two trend-chart buckets to subtract partial refunds**

In `src/components/HistoryView.tsx`, find the hourly bucket loop (around line 283-288):

```ts
      const amountByHour = new Map<number, number>();
      filteredOrders.forEach(o => {
        if (o.is_refunded) return;
        const hour = new Date(o.payment_date_time).getHours();
        const amt = Number(o.final_total) || Number(o.total_amount) || 0;
        amountByHour.set(hour, (amountByHour.get(hour) || 0) + amt);
      });
```

Replace with:

```ts
      const amountByHour = new Map<number, number>();
      filteredOrders.forEach(o => {
        if (o.is_refunded) return;
        const hour = new Date(o.payment_date_time).getHours();
        const amt = Math.max(0, (Number(o.final_total) || Number(o.total_amount) || 0) - (Number(o.refunded_amount) || 0));
        amountByHour.set(hour, (amountByHour.get(hour) || 0) + amt);
      });
```

Then find the daily bucket loop directly below it (around line 296-302):

```ts
    const amountByDay = new Map<string, number>();
    filteredOrders.forEach(o => {
      if (o.is_refunded) return;
      const dayKey = new Date(o.payment_date_time).toISOString().split('T')[0];
      const amt = Number(o.final_total) || Number(o.total_amount) || 0;
      amountByDay.set(dayKey, (amountByDay.get(dayKey) || 0) + amt);
    });
```

Replace with:

```ts
    const amountByDay = new Map<string, number>();
    filteredOrders.forEach(o => {
      if (o.is_refunded) return;
      const dayKey = new Date(o.payment_date_time).toISOString().split('T')[0];
      const amt = Math.max(0, (Number(o.final_total) || Number(o.total_amount) || 0) - (Number(o.refunded_amount) || 0));
      amountByDay.set(dayKey, (amountByDay.get(dayKey) || 0) + amt);
    });
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Add the item-refund handlers and fix the stale full-refund toast**

Find `handleRefund` in `src/components/HistoryView.tsx` (around line 318-376). Its success toast currently reads:

```ts
      showToast(`↩️ 주문번호 [${order.order_number}] 환불 완료 및 재고가 복원되었습니다.`);
```

Replace that one line with (stock restoration hasn't happened since inventory logic was removed — the message was stale):

```ts
      showToast(`↩️ 주문번호 [${order.order_number}] 환불이 완료되었습니다.`);
```

Then add the new handlers directly after the end of `handleRefund` (after its closing `};`, before `const handleSelectOrderForReceipt = ...`):

```ts
  // Open the item-level refund modal for a given order
  const openItemRefundModal = (order: any) => {
    setItemRefundOrder(order);
    setSelectedRefundItemIds([]);
  };

  const toggleRefundItemSelection = (itemId: number) => {
    setSelectedRefundItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleRefundSelectedItems = async () => {
    if (!itemRefundOrder || selectedRefundItemIds.length === 0 || isLoading) return;

    const reason = await showPrompt(
      `선택한 ${selectedRefundItemIds.length}개 품목을 환불하시겠습니까?\n사유를 입력해 주세요 (필수):`,
      { title: '⚠️ 품목별 환불 처리', defaultValue: '고객 단순 변심' }
    );
    if (reason === null) return;
    if (!reason.trim()) {
      showAlert('환불 사유를 작성해야 환불 처리가 가능합니다.', { title: '품목별 환불 처리' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: rpcData, error: rpcError } = await withTimeout(
        supabase.rpc('refund_order_items', {
          p_order_number: itemRefundOrder.order_number,
          p_item_ids: selectedRefundItemIds,
          p_reason: reason.trim()
        }),
        10000
      );

      if (rpcError) throw rpcError;
      if (!rpcData || !rpcData.success) {
        throw new Error(rpcData?.message || '서버 품목별 환불 처리에 실패했습니다.');
      }

      auditLog({
        action: 'REFUND',
        result: 'SUCCESS',
        context: { orderNumber: itemRefundOrder.order_number, reason: reason.trim(), itemIds: selectedRefundItemIds }
      });

      showToast(`↩️ 선택한 품목 환불이 완료되었습니다 (-${Number(rpcData.refunded_amount).toLocaleString()}원).`);
      setItemRefundOrder(null);
      setSelectedRefundItemIds([]);
      fetchHistory();
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || String(err);

      auditLog({
        action: 'API_FAILURE',
        result: 'FAIL',
        context: { actionType: 'REFUND_ITEMS', orderNumber: itemRefundOrder.order_number, error: errMsg }
      });

      if (errMsg.includes('permission denied') || errMsg.includes('row-level security') || errMsg.includes('policy')) {
        showAlert('⚠️ 환불 권한이 없습니다. 관리자(어드민) 계정만 결제 취소 및 환불 처리가 가능합니다.', { title: '품목별 환불 처리 실패' });
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        showAlert('🌐 인터넷 연결이 원활하지 않습니다. 네트워크 설정을 점검한 후 다시 시도해 주세요.', { title: '품목별 환불 처리 실패' });
      } else {
        showAlert(`⚠️ 품목별 환불 처리 실패: ${errMsg}`, { title: '품목별 환불 처리 실패' });
      }
    } finally {
      setIsLoading(false);
    }
  };

```

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Add the "부분환불" status badge and the new action button**

Find the status-badge cell (around line 605-611):

```tsx
                        <td className="text-center">
                          {o.is_refunded ? (
                            <span className="bo-badge bo-badge--danger bo-badge--pill">환불완료</span>
                          ) : (
                            <span className="bo-badge bo-badge--success bo-badge--pill">정상판매</span>
                          )}
                        </td>
```

Replace with:

```tsx
                        <td className="text-center">
                          {o.is_refunded ? (
                            <span className="bo-badge bo-badge--danger bo-badge--pill">환불완료</span>
                          ) : Number(o.refunded_amount) > 0 ? (
                            <span className="bo-badge bo-badge--danger bo-badge--pill">부분환불</span>
                          ) : (
                            <span className="bo-badge bo-badge--success bo-badge--pill">정상판매</span>
                          )}
                        </td>
```

Then find the action-buttons cell directly below it (around line 612-623):

```tsx
                        <td className="text-center">
                          <div className="bo-action-group">
                            <button type="button" className="bo-action-btn" onClick={() => handleSelectOrderForReceipt(o)} title="영수증 상세">
                              <Eye size={14} />
                            </button>
                            {!o.is_refunded && role !== 'Staff' && (
                              <button type="button" className="bo-action-btn bo-action-btn--danger" onClick={() => handleRefund(o)} title="환불 처리">
                                <Undo size={14} />
                              </button>
                            )}
                          </div>
                        </td>
```

Replace with:

```tsx
                        <td className="text-center">
                          <div className="bo-action-group">
                            <button type="button" className="bo-action-btn" onClick={() => handleSelectOrderForReceipt(o)} title="영수증 상세">
                              <Eye size={14} />
                            </button>
                            {!o.is_refunded && role !== 'Staff' && (
                              <>
                                <button type="button" className="bo-action-btn bo-action-btn--danger" onClick={() => handleRefund(o)} title="전체 환불 처리">
                                  <Undo size={14} />
                                </button>
                                <button type="button" className="bo-action-btn" onClick={() => openItemRefundModal(o)} title="품목별 환불">
                                  <ListChecks size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
```

- [ ] **Step 11: Add the item-refund modal to the render tree**

Find the very end of the component's returned JSX (the last ~7 lines of the file, right before `export default HistoryView;`):

```tsx
        )}
      </div>
      
    </div>
  );
};

export default HistoryView;
```

Replace with (inserting the modal between the two closing `</div>` tags):

```tsx
        )}
      </div>

      {/* Item-level Refund Modal */}
      {itemRefundOrder && (
        <Modal
          title="🧾 품목별 환불"
          description={`주문번호 [${itemRefundOrder.order_number}] — 환불할 품목을 선택하세요.`}
          maxWidth={440}
          onClose={() => !isLoading && setItemRefundOrder(null)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {itemRefundOrder.order_items
              ?.filter((item: any) => item.product_id !== 'DISCOUNT')
              .map((item: any) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    opacity: item.is_refunded ? 0.5 : 1,
                    cursor: item.is_refunded ? 'not-allowed' : 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={item.is_refunded}
                    checked={selectedRefundItemIds.includes(item.id)}
                    onChange={() => toggleRefundItemSelection(item.id)}
                  />
                  <span style={{ flex: 1 }}>
                    {item.product_name} x {item.quantity}
                    {item.is_refunded && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--danger)' }}>(환불됨)</span>
                    )}
                  </span>
                  <span style={{ fontWeight: '700' }}>
                    {(Number(item.product_price) * Number(item.quantity) - Number(item.discount || 0) * Number(item.discount_qty || 0)).toLocaleString()}원
                  </span>
                </label>
              ))}
          </div>
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={selectedRefundItemIds.length === 0 || isLoading}
            onClick={handleRefundSelectedItems}
          >
            선택한 {selectedRefundItemIds.length}개 품목 환불하기
          </Button>
        </Modal>
      )}
    </div>
  );
};

export default HistoryView;
```

- [ ] **Step 12: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS with no errors.

- [ ] **Step 13: Hand off for manual verification**

Ask the project owner (Owner-role login required) to: open 매출내역, find a past order with 2+ items, click the new "품목별 환불" (list-check icon) button, select one item, confirm the reason prompt, and check that (a) the order now shows "부분환불", (b) the refunded item shows "(환불됨)" and is no longer selectable, and (c) 순 매출 총액 on the dashboard dropped by that item's amount, not the whole order's amount.

- [ ] **Step 14: Commit**

```bash
git add src/components/HistoryView.tsx
git commit -m "feat: item-level partial refund UI in sales history"
```
