# 🖥️ Simple POS System

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

<p align="center">
  <strong>소규모 카페, 베이커리, 동네 상점을 위한 데스크톱 포스기(POS) 시스템</strong><br />
  Supabase(Postgres + Auth)를 메인 DB로 쓰고, 결제 성공 후 구글 스프레드시트에 보조 기록을 남깁니다.
</p>

---

## ✨ Key Features (주요 기능)

- **🔒 Secure Login & RBAC**: Supabase Auth 기반 로그인, Owner/Manager/Staff 역할별 권한 분리, 매장(store) 단위 격리
- **⚡ Fast Checkout**: 반응성 빠른 상품 그리드와 장바구니, 품목별/전체 할인(할인 제외 품목 지정 가능)
- **📂 Sales History & Refunds**: 매출 내역 조회, 통계 대시보드, 매출 추이 차트, 주문 전체/품목별 부분 환불
- **🧾 Closing Report**: 마감 정산서 생성, 프린터 드라이버와 무관하게 항상 정확한 폭으로 PDF 저장
- **👥 Employee & Customer Management**: 직원 초대/권한 관리, 고객 마일리지 조회
- **📊 Secondary Sheet Log**: 결제 완료 후 구글 스프레드시트에 1행씩 보조 기록 (조회는 앱 내 매출내역이 기준)

---

## 🛠️ Tech Stack (기술 스택)

### Frontend & Desktop
- **UI Framework**: React (v18)
- **Programming Language**: TypeScript
- **Bundler & Dev Server**: Vite
- **Desktop Runtime**: Electron
- **Styling**: Vanilla CSS

### Backend & Database
- **Primary DB & Auth**: Supabase (PostgreSQL + Auth)
- **Secondary Log**: Google Spreadsheet (Google Apps Script Web API, archive-only)

---

## 📐 Architecture (시스템 아키텍처)

```mermaid
graph TD
    A[React Client / Electron] -->|로그인/세션 검증, 상품/주문 CRUD, RPC| B[Supabase Cloud]
    A -->|결제 성공 후 보조 기록| C(Google Apps Script Web App)
    C -->|행 추가| D[Google Spreadsheet]
```

---

## 🚀 Quick Start (시작하기)

### 📋 Prerequisites (필수 조건)
- Node.js (v18 이상 권장)
- npm (Node Package Manager)

### 1. Repository Clone & Install (설치)
```bash
# 레포지토리 클론
git clone https://github.com/cade-beep/ssnr-pos.git
cd ssnr-pos

# 의존성 설치
npm install
```

### 2. Environment Variables Setup (설정)
루트 경로에 `.env` 파일을 생성하고 아래 연동 변수 정보를 입력합니다.

```env
# Supabase Configuration (primary DB + Auth)
VITE_SUPABASE_URL="https://your-supabase-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"

# Google Apps Script Web App Deployment URL (archive-only: sales are logged here
# after a successful Supabase write; the app never reads products/settings from it)
VITE_GOOGLE_SHEETS_WEBAPP_URL="https://script.google.com/macros/s/YOUR_DEPLOID_ID/exec"
```

### 3. Run Development (개발 서버 실행)
React Vite 개발 서버와 Electron 데스크톱 런타임이 동시에 구동됩니다.
```bash
npm run dev
```

---

## 🔀 Repository Split (POS ↔ 재고 조사 앱)

재고 기능은 **[ssnr-inventory](../ssnr-inventory)** 로 분리되어 있습니다. 같은 Supabase
프로젝트를 보지만 프론트엔드는 완전히 따로입니다.

| | POS (이 저장소) | 재고 조사 앱 (ssnr-inventory) |
|---|---|---|
| 목적 | 판매 · 정산 · 영수증 | 실사 · 입고 · 폐기 · 조정 · 리포트 |
| 실행 | Electron 데스크톱 (매장 노트북) | 모바일 웹 (매장에서 폰으로) |
| 쓰는 테이블 | `products`(읽기) `orders` `order_items` `closing_reports` `user_roles` | `products`(읽기) `orders`·`order_items`(읽기) `stock_movements`(읽기/쓰기) |
| 재고 | **전혀 다루지 않음.** 판매해도 재고를 차감하지 않는다 | 재고를 계산해서 보여주는 유일한 곳 |

**판매 시 재고 차감은 POS 에 없습니다.** 재고는 어디에도 저장하지 않고 재고 앱이
매번 계산합니다 — `입고 − 이월 − 폐기 ± 조정 − (order_items 의 판매 수량)`. 그래서
POS 에서 환불이 일어나면 재고 앱의 숫자가 저절로 따라옵니다.

### 공유 테이블 & RLS

모든 테이블은 `store_id` 로 격리되고, 정책은 `public.get_user_store_id()` 와
`public.get_user_role(auth.uid())` 를 씁니다.

| 테이블 | POS | 재고 앱 | RLS 요약 |
|---|---|---|---|
| `products` | 읽기 / Owner 쓰기 | 읽기 | 같은 매장만 |
| `orders`, `order_items` | 읽기 / `complete_sale` RPC 로만 쓰기 | 읽기 | 같은 매장만. 결제는 서버가 금액을 재검증 |
| `stock_movements` | **사용 안 함** | 읽기 / 쓰기 | 같은 매장만. `waste`·`adjust` 기록과 모든 삭제는 Owner 만 |
| `user_roles` | 읽기 | 읽기 | 본인 행 |

마이그레이션 소유권: `stock_movements` 관련은 **재고 앱 저장소**에서 관리하고,
나머지 판매 · 권한 관련은 이 저장소에서 관리합니다.

---

## 🚫 Scope Limits (범위 제한)

- ❌ 바코드 리더기 하드웨어 직접 연동 (바코드 값 매칭 로직은 있음, 리더기 자체 드라이버 연동은 없음)
- ❌ 감열 영수증 프린터 ESC/POS 직접 연동 (정산서 PDF 저장으로 대체)
- ❌ 재고 관리 전반 — 재고 조사 앱이 전담합니다
- ❌ 엑셀(`미니빵집 판매현황.xlsx`, `서산나래 판매지.xlsx`) 동기화 — 재고 기능과 함께 제거됨

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
