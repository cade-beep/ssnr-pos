---
trigger: always_on
---

# AGENTS.md

# Simple POS Project Rules

## Project Goal

This project is a simple POS (Point of Sale) system.

It is designed for small stores such as bakeries, cafés, snack shops, and local stores.

This is NOT an enterprise system.

Keep everything simple.

Prioritize reliability over features.

---

# Technology Stack

Frontend

- React
- TypeScript

Desktop

- Electron

Backend

- Google Apps Script

Database

- Google Spreadsheet

Do NOT introduce any additional backend.

---

# Architecture

The application architecture is fixed.

```
React UI

↓

preload.ts

↓

ipcRenderer.invoke()

↓

ipcMain.handle()

↓

googleSheetService.ts

↓

Google Apps Script

↓

Google Spreadsheet
```

This architecture MUST NOT change.

---

# Database

Google Spreadsheet is the ONLY database.

Do NOT introduce

- SQLite
- Supabase
- Firebase
- MongoDB
- PostgreSQL
- MySQL

---

# Google Apps Script

Google Apps Script acts as the backend API.

Electron communicates ONLY through HTTP POST.

The payload is

```json
{
    "orderId": "",
    "paymentDateTime": "",
    "paymentMethod": "",
    "totalAmount": 0,
    "items": "",
    "totalQuantity": 0,
    "receivedAmount": 0,
    "change": 0
}
```

Never rename fields.

Never remove fields.

Never add fields.

---

# Payment Flow

The payment flow is fixed.

```
Click Product

↓

Shopping Cart

↓

Complete Payment

↓

googleSheetService

↓

Google Apps Script

↓

Google Spreadsheet
```

Each payment appends exactly ONE row.

Never create duplicate rows.

---

# Current MVP Scope

The application only needs

✅ Product buttons

✅ Shopping cart

✅ Quantity increase

✅ Total calculation

✅ Complete payment

✅ Google Spreadsheet storage

✅ Sales history

Nothing more.

---

# Out of Scope

Never implement

- Inventory
- Barcode
- Printer
- Employee Management
- Authentication
- Coupons
- Discount System
- Reports
- Charts
- Analytics
- Multi Store
- Cloud Database
- Push Notification

Unless explicitly requested.

---

# Configuration

Keep configuration simple.

Store only

Google Apps Script URL

Do not over-engineer.

---

# Error Handling

Always show meaningful errors.

Examples

No Internet

↓

"Internet connection unavailable."

Google Apps Script Error

↓

Display returned error.

Never silently ignore failures.

---

# Code Style

Keep functions small.

Prefer readability.

Avoid unnecessary abstraction.

Avoid deep inheritance.

Avoid premature optimization.

---

# Project Philosophy

Every feature should make the POS easier to use.

Never add features simply because they are technically interesting.

The software should be understandable by beginners.

---

# Runtime Verification

Never claim success without runtime verification.

Never fabricate logs.

Never fabricate screenshots.

Never fabricate runtime evidence.

If verification cannot be performed,

report

NOT VERIFIED

instead of SUCCESS.

---

# Build Rules

Every modification must pass

npm run typecheck

and

npx tsc

before reporting completion.

---

# Reporting Format

Always report using

RESULT

SUCCESS

FAILED

NOT VERIFIED

FILES MODIFIED

IMPLEMENTATION DETAILS

BUILD STATUS

VERIFICATION

KNOWN ISSUES

NEXT STEP

---

# Golden Rule

If you are unsure,

DO NOT GUESS.

Read the existing code.

Continue the existing architecture.

Never redesign the project unless explicitly instructed.

The goal is to build a stable MVP, not a complex system.

# AI Decision Rules

Before implementing any feature, ask yourself:

1. Does this feature help the cashier complete a sale faster?

If NO, do not implement it.

2. Does this feature increase complexity?

If YES, avoid it unless explicitly requested.

3. Can this feature be postponed to v2?

If YES, postpone it.

Always prefer the simplest working solution.

MVP first.
Perfect later.