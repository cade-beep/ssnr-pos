# Reliable Closing-Report PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop print capability from the per-sale receipt popup (it's confirmation-only now), and make the closing report (마감 정산서) export as a real 58mm-wide PDF client-side, so it's correct regardless of which printer/PDF driver is installed.

**Architecture:** One new pure utility (`pdfExport.ts`) using `html2canvas` to rasterize a DOM node and `jsPDF` to wrap it in a PDF sized exactly to that content — no OS print pipeline involved, so no driver can override the page size. `SettingsView.tsx` wires this to a new button on the closing report. `ReceiptModal.tsx` loses its print button entirely.

**Tech Stack:** React 18 + TypeScript, `html2canvas` + `jspdf` (new deps), existing `ui/Button`/`ui/Modal` components.

## Global Constraints

- No automated test runner in this repo — every task's verification is `npm run typecheck` (+ `npm run build` on the last task) plus a manual check the project owner runs (they're the only one who can log in).
- Match existing code style: inline `style={{...}}` for one-off layout, dedicated CSS classes for reusable elements, Korean UI copy in the existing short/direct tone.
- Paper width is read from the existing (previously unused) `localStorage.getItem('ssnr_pos_paper_width')` setting (defaults to `'80'`, set via [설정] > 프린터 설정), falling back to `58` if unset/unparseable — don't hardcode a width.

---

### Task 1: Remove print from the per-sale receipt

**Files:**
- Modify: `src/components/ReceiptModal.tsx`

- [ ] **Step 1: Remove the print handler and button**

Current file:

```tsx
import React from 'react';
import { Receipt } from '../types';
import { Printer, CheckCircle } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const handlePrint = () => {
    // Opens print settings window for active frame/window
    window.print();
  };

  return (
    <Modal
      maxWidth={440}
      onClose={onClose}
      bodyStyle={{ padding: '24px 24px 4px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      footer={
        <>
          <Button variant="secondary" onClick={handlePrint}>
            <Printer size={14} />
            <span>영수증 출력</span>
          </Button>
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        </>
      }
    >
```

Replace with:

```tsx
import React from 'react';
import { Receipt } from '../types';
import { CheckCircle } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  return (
    <Modal
      maxWidth={440}
      onClose={onClose}
      bodyStyle={{ padding: '24px 24px 4px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      footer={
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      }
    >
```

(`Printer` is dropped from the icon import — it was only used by the removed button. The footer's `<>...</>` fragment is no longer needed since there's only one child now.)

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReceiptModal.tsx
git commit -m "refactor: drop print button from the per-sale receipt popup"
```

---

### Task 2: PDF export utility

**Files:**
- Create: `src/utils/pdfExport.ts`
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Produces: `downloadElementAsPdf(node: HTMLElement, filename: string, widthMm?: number): Promise<void>` — `widthMm` defaults to `58`.

- [ ] **Step 1: Install dependencies**

Run: `npm install html2canvas jspdf`
Expected: `package.json`/`package-lock.json` gain `html2canvas` and `jspdf` under `dependencies`. Both ship their own TypeScript types — no `@types/*` packages needed.

- [ ] **Step 2: Write the utility**

Create `src/utils/pdfExport.ts`:

```ts
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Rasterizes `node` and wraps it in a PDF sized exactly to its content at
// `widthMm` wide. Bypasses the OS print pipeline entirely (no window.print,
// no printer driver in the loop), so the output width is exact regardless
// of what's installed as the default printer/PDF driver on the machine.
export async function downloadElementAsPdf(
  node: HTMLElement,
  filename: string,
  widthMm: number = 58
): Promise<void> {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const heightMm = (canvas.height / canvas.width) * widthMm;

  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, heightMm]
  });
  doc.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
  doc.save(filename);
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/utils/pdfExport.ts
git commit -m "feat: add client-side PDF export utility (html2canvas + jsPDF)"
```

---

### Task 3: Wire the PDF button into the closing report, and fix its styling

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `downloadElementAsPdf(node, filename, widthMm?)` from Task 2.

- [ ] **Step 1: Fix the closing report's className**

In `src/components/SettingsView.tsx`, the closing report content currently renders in a class with no CSS rule anywhere in the project:

```tsx
              <div className="receipt-paper">
```

Replace with (also attaches the ref added in Step 3):

```tsx
              <div className="bo-receipt-paper" ref={reportRef}>
```

This picks up the monospace font, card background, padding, and shadow that `.bo-receipt-paper` already defines in `src/index.css` (used by the receipt popup) — the closing report currently renders with none of that.

- [ ] **Step 2: Add imports and state**

At the top of `src/components/SettingsView.tsx`:

```ts
import React, { useState, useEffect } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { FileSpreadsheet, Lock, RefreshCw, BarChart, ShieldCheck, Printer } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Field, Input, Select } from './ui/Field';
import { showAlert, showConfirm } from './ui/dialogs';
```

Replace with:

```ts
import React, { useState, useEffect, useRef } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { FileSpreadsheet, Lock, RefreshCw, BarChart, ShieldCheck, Printer, Download } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Field, Input, Select } from './ui/Field';
import { showAlert, showConfirm } from './ui/dialogs';
import { downloadElementAsPdf } from '../utils/pdfExport';
```

Then find:

```ts
  const [activeCloseReport, setActiveCloseReport] = useState<any>(null);
```

Add directly after it:

```ts
  const [activeCloseReport, setActiveCloseReport] = useState<any>(null);
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Add the export handler**

Find `handlePrintReport`:

```ts
  const handlePrintReport = () => {
    window.print();
  };
```

Add directly after it:

```ts
  const handleDownloadReportPdf = async () => {
    if (!reportRef.current || isExportingReportPdf) return;
    setIsExportingReportPdf(true);
    try {
      const widthMm = Number(localStorage.getItem('ssnr_pos_paper_width')) || 58;
      const dateStr = activeCloseReport ? new Date(activeCloseReport.closed_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      await downloadElementAsPdf(reportRef.current, `정산서_${dateStr}.pdf`, widthMm);
    } catch (err: any) {
      console.error(err);
      showAlert(`⚠️ PDF 저장에 실패했습니다: ${err.message || String(err)}`, { title: 'PDF 저장 실패' });
    } finally {
      setIsExportingReportPdf(false);
    }
  };
```

- [ ] **Step 4: Add the button and pass the ref**

Find the closing report modal's footer:

```tsx
          footer={
            <>
              <Button variant="secondary" onClick={handlePrintReport}>
                <Printer size={14} />
                <span>정산서 출력</span>
              </Button>
              <Button variant="primary" onClick={() => setActiveCloseReport(null)}>
                닫기
              </Button>
            </>
          }
```

Replace with:

```tsx
          footer={
            <>
              <Button variant="secondary" onClick={handlePrintReport}>
                <Printer size={14} />
                <span>정산서 출력</span>
              </Button>
              <Button variant="secondary" onClick={handleDownloadReportPdf} disabled={isExportingReportPdf}>
                <Download size={14} />
                <span>{isExportingReportPdf ? '저장 중...' : 'PDF로 저장'}</span>
              </Button>
              <Button variant="primary" onClick={() => setActiveCloseReport(null)}>
                닫기
              </Button>
            </>
          }
```

(The `<div className="receipt-paper">` → `<div className="bo-receipt-paper" ref={reportRef}>` change from Step 1 is the JSX directly below this footer block, inside the same `<Modal>`.)

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 6: Clean up the print CSS**

In `src/index.css`, find the `@media print` block added in a prior session:

```css
@media print {
  body * {
    visibility: hidden;
  }
  .bo-receipt-paper, .bo-receipt-paper *,
  .receipt-paper, .receipt-paper * {
    visibility: visible;
  }
  .bo-receipt-paper,
  .receipt-paper {
    position: absolute;
    left: 0;
    top: 0;
    width: 58mm;
    max-height: none;
    overflow: visible;
    box-shadow: none;
    border: none;
    border-radius: 0;
    margin: 0;
    padding: 6mm 3mm;
  }
}
```

Replace with (the closing report now uses `.bo-receipt-paper` too, per Step 1, so the separate `.receipt-paper` selectors are redundant):

```css
@media print {
  body * {
    visibility: hidden;
  }
  .bo-receipt-paper, .bo-receipt-paper * {
    visibility: visible;
  }
  .bo-receipt-paper {
    position: absolute;
    left: 0;
    top: 0;
    width: 58mm;
    max-height: none;
    overflow: visible;
    box-shadow: none;
    border: none;
    border-radius: 0;
    margin: 0;
    padding: 6mm 3mm;
  }
}
```

- [ ] **Step 7: Run build one more time**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Hand off for manual verification**

Ask the project owner (login required) to: close out a register session, open the saved closing report, click "PDF로 저장", and confirm the downloaded PDF is a narrow strip (58mm, or 80mm if they'd set that in [설정] > 프린터 설정's 용지폭 field) with the report content filling it top-to-bottom — no blank A4-sized page around it, regardless of which printer/PDF app is set as their Windows default.

- [ ] **Step 9: Commit**

```bash
git add src/components/SettingsView.tsx src/index.css
git commit -m "feat: reliable PDF export for the closing report, independent of printer driver"
```
