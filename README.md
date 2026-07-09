# 🖥️ Simple POS System

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Google_Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="Google Sheets" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

<p align="center">
  <strong>소규모 카페, 베이커리, 동네 상점을 위한 초간편 데스크톱 포스기(POS) 시스템</strong><br />
  근무자 세션 관리는 <b>Supabase Auth</b>로 안전하게 수행하고, 매출/상품 목록은 <b>구글 스프레드시트</b>를 데이터베이스로 결합하여 투명하게 관리합니다.
</p>

---

## ✨ Key Features (주요 기능)

- **🔒 Secure Login**: Supabase Auth 기반의 이메일/비밀번호 암호화 근무자 로그인 및 지속 세션 제어
- **⚡ Fast Checkout**: 직관적이고 반응성 빠른 상품 그리드와 실시간 장바구니 시스템
- **📊 Real-time Sheet Sync**: 결제 완료 즉시 구글 스프레드시트(Google Spreadsheet)에 결제 내역을 1행 단위로 안전하게 추가 (담당자 자동 기입)
- **📂 Sales History**: 데스크톱 앱 내에서 실시간 매출 내역을 간편하게 스크롤 및 조회 가능
- **🎨 Modern Premium UI**: 다크 모드 기반의 글래스모피즘(Glassmorphism) 스타일과 고급스러운 인터랙션
- **☁️ Zero-Server DB**: 별도의 DB 서버를 직접 구축할 필요 없이 구글 스프레드시트의 편리함과 클라우드 인프라를 그대로 연계

---

## 🛠️ Tech Stack (기술 스택)

### Frontend & Desktop
- **UI Framework**: React (v18)
- **Programming Language**: TypeScript
- **Bundler & Dev Server**: Vite
- **Desktop Runtime**: Electron (v29)
- **Styling**: Vanilla CSS (Premium Glassmorphic Design)

### Backend & Database (Hybrid)
- **User Authentication**: Supabase Auth (PostgreSQL DB)
- **POS Data Storage**: Google Spreadsheet (via Google Apps Script Web API)

---

## 📐 Architecture (시스템 아키텍처)

이 프로젝트는 보안 중심의 로그인 처리와 경량 스프레드시트 결제 아키텍처가 공존합니다:

```mermaid
graph TD
    A[React Client / Electron] -->|1. 로그인/세션 검증| B[Supabase Auth Cloud]
    A -->|2. 상품 로드 & 결제 기록 저장| C(Google Apps Script Web App)
    C -->|행 추가 및 갱신| D[Google Spreadsheet DB]
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
루트 경로에 `.env` 파일을 생성하고 아래 연동 변수 정보를 입력합니다. (기본 템플릿은 `.env.example`을 참고하세요.)

```env
# Google Apps Script Web App Deployment URL
GOOGLE_SHEETS_WEBAPP_URL="https://script.google.com/macros/s/YOUR_DEPLOID_ID/exec"
VITE_GOOGLE_SHEETS_WEBAPP_URL="https://script.google.com/macros/s/YOUR_DEPLOID_ID/exec"

# Supabase Auth Configuration
VITE_SUPABASE_URL="https://your-supabase-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"
```

### 3. Run Development (개발 서버 실행)
React Vite 개발 서버와 Electron 데스크톱 런타임이 동시에 구동됩니다.
```bash
npm run dev
```

---

## 🚫 Scope Limits (MVP 프로젝트 범위 제한)

이 프로젝트는 심플하고 신뢰도 높은 MVP(최소 기능 제품)를 지향합니다. **다음 기능들은 기본 범위 외(Out of Scope)에 해당합니다:**
- ❌ 바코드 리더기 및 영수증 프린터 하드웨어 연동
- ❌ 회원가입 양식 노출 (관리자가 Supabase 대시보드에서 직원 계정 일괄 등록 후 지급)
- ❌ 다중 매장 및 직원 관리 시스템
- ❌ 별도의 로컬/서버용 관계형 DB 구축 (구글 스프레드시트 단독 사용)

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
