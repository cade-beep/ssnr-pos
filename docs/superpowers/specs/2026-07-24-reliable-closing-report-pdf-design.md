# Design: Drop per-sale receipt printing, make the closing report reliably printable

## Background

A prior session added `@media print` CSS so `window.print()` would isolate
just the receipt/report paper at 58mm instead of capturing the whole
screen. Testing against a real printer driver ("혼PDF", a third-party
virtual PDF printer) showed the driver ignores the CSS `@page` size
request and still produces an A4-sized page with the narrow content stuck
in one corner — `@page` is a request, not a guarantee, and some print
drivers don't honor it.

Discussing the actual need behind this (checking later how much was sold,
on paper) surfaced that the per-sale receipt popup isn't the right tool for
that — the existing closing report (마감 정산서, in Settings) already
aggregates total sales, card/transfer breakdown, and per-item sales counts.
That's the document that needs to print reliably. The per-sale receipt
popup is being kept only as an on-screen "결제 완료" confirmation; its
print button is being removed rather than fixed.

## Goals

- Remove print/export capability from the per-sale receipt (`ReceiptModal.tsx`) — it stays a screen-only confirmation.
- Make the closing report print reliably at 58mm regardless of printer driver, by generating the PDF client-side (bypassing the OS print pipeline entirely) rather than depending on `@page` being honored.
- Fix the closing report's unstyled `.receipt-paper` class (not defined anywhere in `index.css`) by reusing the existing `.bo-receipt-paper` card styling.

## Non-goals

- No redesign of the per-sale receipt's visual layout (Square/Toast/Starbucks-style polish, QR code, VAT, coupon, logo, business number) — the earlier detailed receipt spec is dropped along with the print button it was for.
- No change to how the closing report's *data* is calculated — only how it's styled and exported.
- Keep the closing report's existing `window.print()` button (`정산서 출력`) as-is — it still works correctly for a real thermal printer or Chrome's built-in PDF destination, both of which do honor `@page`. It's specifically third-party virtual-PDF drivers that don't, and the new PDF button below is the reliable fallback for those.

## Design

### 1. Remove receipt print capability (`src/components/ReceiptModal.tsx`)

Remove the `handlePrint` function and the "영수증 출력" button from the
modal's footer. The modal keeps its checkmark, item list, and totals —
purely a post-payment confirmation now, with only a "닫기" button.

### 2. Style the closing report with the existing receipt-paper look

In `src/components/SettingsView.tsx`, the closing report modal currently
renders its content in `<div className="receipt-paper">` — a class with no
CSS rule anywhere, so today it displays with only whatever inline styles
each row already carries, missing the monospace font/card background/
padding/shadow that `.bo-receipt-paper` (used by the now-simplified
receipt popup) already has. Change the className to `bo-receipt-paper` to
pick up that existing styling for free.

### 3. `src/utils/pdfExport.ts` — client-side PDF generation

One function:

```ts
export async function downloadElementAsPdf(
  node: HTMLElement,
  filename: string,
  widthMm?: number // defaults to 58
): Promise<void>
```

Implementation: `html2canvas(node, { scale: 2 })` to rasterize the element
at 2x for print-quality sharpness, compute the PDF page height in mm from
the canvas's pixel aspect ratio (so the page is exactly as tall as the
content — no forced page breaks), create a `jsPDF({ unit: 'mm', format: [widthMm, computedHeightMm] })`,
add the canvas image filling the page, then `doc.save(filename)`. This
produces a real PDF file, downloaded directly by the browser — no OS print
dialog, no printer driver, so the 58mm width is exact regardless of what's
installed on the machine.

Error handling: wrap in try/catch; on failure, show the same
`showAlert`-style user-facing error the rest of the app uses (via a
callback passed in, since this is a plain utility function with no UI
dependency) rather than a raw thrown exception reaching the caller
unhandled.

### 4. Wire it into the closing report

In `SettingsView.tsx`: add a `useRef<HTMLDivElement>` on the closing
report's `.bo-receipt-paper` div. Add a "PDF로 저장" button in the modal
footer, next to the existing "정산서 출력" button, calling
`downloadElementAsPdf(reportRef.current, '정산서_${date}.pdf')` with a
loading state on the button while the async export runs (matching the
`savingClose`-style disabled-button pattern already used elsewhere in this
file).

### 5. Dependencies

Add `html2canvas` and `jspdf` to `package.json` — both are pure
client-side libraries, no build config changes needed.

### 6. Clean up the print CSS

The `@media print` block added last session targets both
`.bo-receipt-paper` and `.receipt-paper`. Since the closing report now
uses `.bo-receipt-paper` too (step 2), drop the now-redundant
`.receipt-paper` selectors from that block.

## Testing

- `npm run typecheck` and `npm run build` after each file change.
- Manual, by the project owner (requires login): confirm the receipt popup
  after a sale has no print button and still shows the right totals;
  confirm the closing report's "PDF로 저장" button downloads a PDF that
  opens at 58mm width with the report content filling it top-to-bottom,
  regardless of which printer/PDF driver is installed as default.
