# AI Review Package: Mini POS System Audit Report

본 문서는 사내 재고 기록 관리 및 결제 관리를 위한 Mini POS 웹 애플리케이션의 품질 검증, UX, 데이터 정합성 및 보안 취약점을 진단한 독립 감사용 리뷰 패키지입니다.

---

# 1. Project Overview (프로젝트 개요)

* **애플리케이션 목적**: 소규모 매장(서산나래 베이커리/카페)의 실시간 매출 집계, 상품 CRUD, 결제 처리 및 재고 관리 마스터 정보를 중앙 통제하기 위한 사내 업무용 웹 어플리케이션입니다.
* **기술 스택 (Tech Stack)**:
  * **Frontend**: React (v18.2.0), TypeScript (v5.2.2), Vite (v8.1.4)
  * **Styling**: Vanilla CSS (Toss 스타일의 다크 모드 및 글래스모피즘 계열 인터페이스)
  * **Database & Auth**: Supabase JS (PostgreSQL 기반 클라우드 DB 및 Supabase Auth 세션 인증)
  * **Log Sync**: Google Apps Script Web App API 연동 (구글 스프레드시트 매출 동기화 백업)
* **로컬 실행 방법 (How to run locally)**:
  1. 의존성 설치: `npm install`
  2. 로컬 서버 구동: `npm run dev` (Vite 번들러 서버 실행)
  3. 빌드 및 정적 분석: `npm run build` 및 `npm run typecheck`
* **주요 화면 구성 (Main Pages / Tabs)**:
  * **판매 (Sales)**: 상품 그리드 카드 카탈로그 리스팅 및 실시간 장바구니 결제 처리.
  * **내역 (History)**: 매출 거래 데이터 그리드, 일자별/조건별 필터링 조회 및 환불 기능, 통계 대시보드.
  * **상품 (Products)**: 상품 마스터 정보 관리 테이블, 상품 CRUD 작성 폼 및 재고 조정.
  * **설정 (Settings)**: 근무자 세션 관리, 최저 재고 알림 현황 조회 및 마감 정산(Business Close) 처리.
* **데이터 저장소 아키텍처**:
  * Supabase PostgreSQL 원격 데이터베이스에 `orders`, `order_items`, `products`, `closing_reports` 테이블로 영구 저장하며, 결제 완료 시 구글 시트 웹앱 API에 POST 요청을 전송해 엑셀 형태의 이중 매출 장부를 기록합니다.

---

# 2. Current Features (현재 기능 명세 현황)

각 핵심 기능의 실제 구현 완료 여부와 상태는 다음과 같습니다:

* **상품 등록 (Item registration)**: **Fully Implemented** (ProductsView 탭에서 코드, 명칭, 가격, 이모지, 바코드 정보 생성)
* **상품 검색/필터 (Item list/search/filter)**: **Fully Implemented** (명칭 및 바코드 통합 검색창 작동, 베이커리/음료/기타 카테고리 칩 필터링 지원)
* **상품 상세 정보 (Item detail)**: **Fully Implemented** (내역 그리드의 돋보기 아이콘을 통해 과거 주문 내역의 영수증 상세 내역 및 할인액 명세 표출)
* **상품 수정/삭제 (Item editing/deletion)**: **Fully Implemented** (상품 목록 행별 에디터 및 삭제 다이얼로그 호출 가능)
* **재고 입출고 (Stock in/out)**: **Fully Implemented** (판매 시 재고 자동 차감, 환불 취소 시 원본 주문의 상품 재고 복원)
* **수량 관리 (Quantity management)**: **Fully Implemented** (장바구니 수량 조정 및 상품 관리 화면에서 증감 수동 제어 버튼 지원)
* **대여/반납 프로세스 (Loan/return)**: **Not Applicable** (자산 대여용이 아닌 매장 판매 POS용이므로 스코프에서 제외)
* **이미지 첨부 (Image attachment)**: **Fully Implemented** (Supabase Storage 업로드 연동 및 로컬 업로드 실패 시 Base64 데이터 스트림으로 포맷 변환하여 DB 백업)
* **이력 감사 로그 (History/audit log)**: **Partial** (거래 및 마감 정산 히스토리는 완벽히 축적되나, 상품 가격 변경 등 마스터 정보 임의 변동에 대한 시스템 관리 기록 로그는 누락됨)
* **사용자 인증 (User authentication)**: **Fully Implemented** (Supabase Auth 이메일 기반 세션 토큰 검증)
* **역할 및 권한 분류 (Roles and permissions)**: **Partial** (클라이언트 소스 내에서 이메일 식별자 및 메타데이터 필드로 '관리자'와 '캐셔' 뷰를 제한하나, API 보안 수준의 권한 차단은 부재함)
* **통계 대시보드 (Dashboard/statistics)**: **Fully Implemented** (순 매출액, 거래 건수, 객단가, 환불 처리 액수, 결제 비율, 베스트셀러 TOP 5 가로 차트 시각화)
* **모바일 반응형 (Mobile responsiveness)**: **Partial** (레이아웃 스케일은 유연하게 조절되나, 태블릿 가로 보기 및 특정 포스 디바이스 뷰포트에 종속적인 폰트 크기 존재)

---

# 3. User Flows (사용자 시나리오 및 예외 흐름)

### 1. 관리자 상품 등록 흐름
* **작업 흐름**: 로그인 -> 상품 탭 진입 -> '상품 등록' 버튼 클릭 -> 상품코드(ID), 명칭, 카테고리, 가격, 재고, 경고 기준, 바코드 입력 -> 완료.
* **UX 개선점 및 잠재적 리스크**:
  * 상품코드(ID) 및 상품명이 이미 데이터베이스에 존재할 때 등록을 누르기 전 실시간 유효성 검사가 되지 않음. 중복 저장 요청을 보낸 뒤에만 Supabase DB Unique 제약에 의해 실패 팝업이 표시되어 입력 양식이 리셋되거나 중복 입력을 수정해야 하는 피로가 있음.
  * 바코드 번호 중복에 대한 검사 장치가 없어서 동일 바코드로 다른 상품이 등록되는 것을 방지하지 못함.

### 2. 사용자 상품 검색 흐름
* **작업 흐름**: 판매 탭 진입 -> 검색 입력창에 명칭 검색 또는 하드웨어 바코드 스캐너로 상품 스캔 -> 일치하는 상품 카드 노출 및 자동 장바구니 삽입.
* **UX 개선점 및 잠재적 리스크**:
  * 바코드 스캔 시 화면 내 포커스가 다른 폼(예: 장바구니 수량 인풋 또는 검색 인풋창)에 있으면 바코드 텍스트가 인풋 텍스트 창에 입력되는 기현상이 발생하여 바코드 파싱 로직에 노이즈가 유입될 위험이 있음.

### 3. 상품 판매 및 재고 차감 (출고) 흐름
* **작업 흐름**: 상품 그리드에서 선택 -> 수량 증감 설정 -> 결제하기 -> 결제 수단(카드/이체) 선택 및 현금 거스름돈 산정 -> 최종 승인 -> 재고 차감 및 영수증 모달 팝업.
* **UX 개선점 및 잠재적 리스크**:
  * **동시성(Race Condition) 위험**: 결제 처리 버튼을 누르는 순간 클라이언트단 재고 유효성 판별이 끝나고 결제가 성사되는 짧은 간격 사이에, 다른 단말기에서 동일한 재고를 털어가는 경우 음수 재고가 데이터베이스에 찍히는 무결성 붕괴 위험이 존재함.
  * **Double Submit**: '결제 완료' 버튼 더블 클릭 시 비동기 요청이 2회 전송되어 한 주문에 대한 이중 매출 기록이 2건 작성되고 재고가 2배로 깎이는 오류가 발생할 수 있음.

### 4. 매출 취소 및 재고 복구 (입고) 흐름
* **작업 흐름**: 내역 탭 진입 -> 결제 리스트에서 해당 거래 건 검색 -> '환불' 아이콘 클릭 -> 환불 컨펌 승인 -> 영수증 상태 `is_refunded` 갱신 및 포함 품목 수량만큼 재고 원복.
* **UX 개선점 및 잠재적 리스크**:
  * 이미 환불 완료된 건은 UI에서 환불 버튼이 가려지지만, API를 통한 직접 요청 또는 비동기 응답 지연 상태에서 버튼 연타 시 환불 DB 로직이 복수 실행되어 재고가 계속 늘어날 수 있는 취약점이 있습니다.

### 5. 임의 오류 데이터 정정 흐름
* **작업 흐름**: 상품 탭 진입 -> 오기입된 상품 마스터 행의 '수정' 버튼 클릭 -> 가격, 재고 등의 값을 올바르게 정정하고 저장.
* **UX 개선점 및 잠재적 리스크**:
  * 사내 재고 관리의 가장 핵심인 **재고 조정 이력 추적(Audit Trail)**이 누락되어 있음. 단순히 현재 재고를 `50`개에서 `30`개로 강제 정정할 시, 어떤 계정의 작업자가 어떤 사유(예: 파손, 분실 등)로 값을 변경했는지 감사 일지가 기록되지 않아 내부 횡령이나 손실 파악에 장애가 생김.

---

# 4. UI/UX Audit (Toss 스타일 기준 사용성 평가)

사내 업무용 시스템으로서 Toss의 '신뢰할 수 있고, 직관적이며 극도의 가독성을 추구하는' UI 디자인 가이드라인 관점에서 검토한 진단 결과입니다.

* **Severity: High**
  * **Screen/route**: `PaymentModal` (결제 처리 창)
  * **Problem**: 결제 완료 버튼을 연속 클릭할 시 중복 서브밋 방지(Disabled 및 Loading 스피너 전환) 조치가 되어 있지 않음.
  * **Why it matters**: 사내 매출 장부와 물리적 재고 무결성을 파괴하는 핵심 버그 요인임.
  * **Recommended improvement**: `isSubmitting` 상태를 결제 비동기 작업 처리 전 `true`로 설정하고 버튼 비활성화 조치 적용.

* **Severity: High**
  * **Screen/route**: `ProductsView` (상품 관리 탭)
  * **Problem**: 이미지 파일 업로드 실패 시 데이터베이스 텍스트 컬럼에 대용량 base64 이미지 인코딩 텍스트를 통째로 쑤셔 넣어 보존함.
  * **Why it matters**: 쿼리 조회 트래픽이 비대해져 클라우드 네트워크 성능 급하강 및 브라우저 렌더링 렉을 유발함.
  * **Recommended improvement**: base64 인코딩 파일 크기 한도를 `100KB` 미만으로 엄격히 제한하고 초과 시 경고 알림 표시 및 기본 이모지로 대체 강제화.

* **Severity: Medium**
  * **Screen/route**: `LoginOverlay` (근무 세션 인증)
  * **Problem**: 로그인 화면 진입 시 개발용 아이디 우회 기능 경고문구가 노출되지 않고 바로 로그인 기능이 열려 있어 캐셔가 임의로 바이패스 로그인을 시도하게 유도할 소지가 있음.
  * **Why it matters**: 사내 자산 도난 방지를 위한 근무자 근무 책임(Accountability) 추적에 혼선 발생.
  * **Recommended improvement**: `.env` 설정에 의해 우회 모드가 활성화된 경우 화면 상단에 붉은색 글씨로 "개발 모드 로그인 활성화 중"임을 안내.

* **Severity: Low**
  * **Screen/route**: `HistoryView` Dashboard (통계 화면)
  * **Problem**: 인기 판매 상품 TOP 5 그래프가 일반 HTML block의 너비를 CSS로 제어해 그려져 인쇄 설정이나 글자 깨짐 현상 발생 우려.
  * **Why it matters**: 인쇄용 장부 제출 시 시각적 신뢰성이 손상됨.
  * **Recommended improvement**: SVG 기반의 차트를 사용하거나 차트 렌더링에 적절한 반응형 비율 고정 값을 부여.

---

# 5. Functional and Data Integrity Audit (기능 및 데이터 무결성 검증)

데이터 조작 및 정합성 저하에 민감한 백오피스 관점의 취약 지점 리스트입니다.

1. **동시 결제로 인한 재고 음수 도달 위험**
   * **관련 파일**: [src/App.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/App.tsx)
   * **관련 함수**: `handleCompletePayment`
   * **문제 분석**: 클라이언트 수준에서 `currentStock < item.quantity`를 선검사한 후 개별 품목의 재고를 `supabase.from('products').update()`로 업데이트할 때까지 물리적 트랜잭션 락이 걸리지 않습니다. 동시에 2대의 포스기에서 남은 마지막 1개의 빵을 결제하면 두 검사 모두 통과되어 최종 재고는 `-1`개가 됩니다.
   * **해결책**: Supabase DB에 `products.stock >= 0` 제약 조건(CHECK CONSTRAINT)을 설정해 음수 저장 시 DB 수준에서 에러를 던지도록 조치하고 결제를 롤백해야 합니다.

2. **동일 바코드 중복 지정 가능성**
   * **관련 파일**: [supabase/migrations/20260713000000_add_products_and_inventory.sql](file:///c:/Users/김규호/Desktop/간이포스기/supabase/migrations/20260713000000_add_products_and_inventory.sql)
   * **문제 분석**: `barcode` 컬럼 정의 시 `UNIQUE` 제약 조건이 없어서 동일한 물리적 바코드가 다른 제품(예: 밤식빵과 모카빵)에 동시에 맵핑될 수 있습니다. 이 경우 바코드 리더기로 상품을 스캔하면 배열 내 첫 번째 상품만 선택되거나 혼선이 발생합니다.
   * **해결책**: 스키마 정의 수정: `barcode VARCHAR(255) UNIQUE`

3. **이중 결제 처리 (Double-Submit)**
   * **관련 파일**: [src/App.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/App.tsx)
   * **관련 함수**: `handleCompletePayment`
   * **문제 분석**: 비동기 처리가 동작하는 동안 결제 완료 확인 트리거가 잠기지 않기 때문에 더블 클릭으로 하나의 카트 정보가 두 번 결제 요청으로 송신될 수 있습니다.

4. **클라이언트단 임의 요청 조작 리스크**
   * **관련 파일**: [supabase/migrations/20260713000000_add_products_and_inventory.sql](file:///c:/Users/김규호/Desktop/간이포스기/supabase/migrations/20260713000000_add_products_and_inventory.sql)
   * **문제 분석**: RLS(Row Level Security) 정책에 `CREATE POLICY "Allow public all to products" ON products FOR ALL TO public USING (true)`로 기재되어 브라우저 개발자 도구에서 Supabase ANON key만 가로채면 누구나 DB에 직접 쿼리를 날려 상품 단가를 수정하거나 전체 재고를 삭제할 수 있습니다.

---

# 6. Security and Privacy Audit (보안 및 권한 감사)

사내 인트라넷 통제 수준에 어긋날 수 있는 기술적 위험 요소를 진단합니다.

* **인증 및 인가 누수 (Missing Server-side Authorization)**:
  * 클라이언트 측 화면단에서는 `currentCashier.role` 값을 대조하여 상품 등록/수정(관리자 전용 기능) 버튼의 표시 여부를 결정하고 있습니다.
  * 그러나 DB 쓰기 정책(`RLS`)에 관리자 역할 식별을 체크하는 조항이 없기 때문에, 일반 '캐셔' 세션 토큰을 획득한 공격자가 Supabase 클라이언트를 조작해 `products` 테이블에 강제로 쓰기/수정 요청을 보내면 필터 없이 실행되는 취약점이 있습니다.
* **민감 정보 노출 취약점**:
  * 빌드 결과물에 `VITE_SUPABASE_ANON_KEY`가 평문 노출되는 것은 Supabase SDK 표준 구조상 정상적입니다. 그러나 이 키가 RLS의 느슨한 전체 공개 정책(`Allow public all`)과 조합될 경우, 사실상 데이터베이스 전체에 대한 풀 권한(Write/Delete)을 공격자에게 쥐어주는 무방비 상태가 됩니다.
* **감사 로그 부재 (Missing Audit Trail)**:
  * 마스터 데이터(상품, 단가, 바코드 등)를 수정하거나 수동으로 입고량을 임의 조정하는 백오피스 행위들에 대한 계정 식별 로그 시스템이 마련되어 있지 않아 내부 감사 수행이 불가능합니다.

---

# 7. Priority Roadmap (우선순위 개선 로드맵)

사내 자산 손실 방지와 데이터 보존을 위해 P0부터 P2 단계로 우선순위를 지정한 상세 조치 계획입니다.

| 우선순위 | 당면 취약 과제 | 권장 조치 조치 계획 | 난이도 | 영향력 |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | Supabase RLS 무제한 공개 정책 (캐셔가 단가 수정 가능 위험) | RLS 정책을 변경하여 `INSERT`, `UPDATE`, `DELETE` 권한은 Supabase Auth의 JWT 토큰 검증을 통해 `role === '관리자'`를 만족하는 유저에게만 매칭되도록 통제. | 중 (Medium) | 최상 (Critical 보안 복구) |
| **P0** | 동시 결제 시 음수 재고 진입 위험 | 데이터베이스 `products.stock` 필드에 `CHECK (stock >= 0)` 조건 삽입. 결제 로직 에러 포착 시 롤백 수행. | 하 (Low) | 상 (데이터 무결성 방어) |
| **P1** | 결제 단추 다중 클릭 이중 매출 기입 | 결제 트리거 실행 시 버튼 `disabled` 처리 및 UI 로딩 모션 추가. | 하 (Low) | 상 (매출 왜곡 예방) |
| **P1** | 상품 바코드 식별자 중복 | `products.barcode` 필드에 `UNIQUE` 속성을 명시적으로 할당해 마스터 데이터 오등록 차단. | 하 (Low) | 중 (스캔 동작 정상화) |
| **P2** | 마스터 정보 직접 수정 감사 일지 결핍 | `products_audit_log` 기록 테이블을 별도 배정하여 수정 사항 발생 시 작업자, 일시, 이전 값, 변경 사유를 이력 추적. | 상 (High) | 중 (보안 투명성 확보) |
| **P2** | base64 텍스트 기반 비대화 저장 | 용량이 큰 이미지 파일 첨부 시 해상도 축소 리사이징 프론트 라이브러리를 추가해 이미지 최대 크기를 제한. | 중 (Medium) | 중 (서버 트래픽 성능 향상) |

---

# 8. Reviewer Handoff (감사 파일 셋 및 검증 도구)

외부 보안 감사관 또는 다른 AI 코드 리뷰어가 분석을 효율적으로 이어받을 수 있도록 구성한 중요 인프라 파일 세트 및 점검 도구입니다.

### 핵심 점검 파일 리스트 (Top 10 Files)
1. **[src/App.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/App.tsx)**: 결제 트랜잭션, 바코드 키리스너, 카트 상태 통제.
2. **[supabase/migrations/20260713000000_add_products_and_inventory.sql](file:///c:/Users/김규호/Desktop/간이포스기/supabase/migrations/20260713000000_add_products_and_inventory.sql)**: 스키마 제약 사항 및 RLS 접근 승인 규칙.
3. **[src/components/ProductsView.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/ProductsView.tsx)**: 상품 CRUD 처리부 및 base64 파일 변환 인코더.
4. **[src/components/HistoryView.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/HistoryView.tsx)**: 환불 처리기 및 대시보드 매출 통계 계산 로직.
5. **[src/components/SettingsView.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/SettingsView.tsx)**: 마감 정산 정보 가공 및 정산 파일 PDF 출력 지원기.
6. **[src/components/LoginOverlay.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/LoginOverlay.tsx)**: 근무자 세션 생성 및 개발자 도구 로그인 우회 필터링.
7. **[src/components/POSGrid.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/POSGrid.tsx)**: 재고 수량 한도 표기 및 품절 필터 블로킹 조작.
8. **[src/components/Cart.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/Cart.tsx)**: 개별 할인 설정기 및 최종 청구 금액 파싱.
9. **[src/types.ts](file:///c:/Users/김규호/Desktop/간이포스기/src/types.ts)**: 상품 마스터 형식 명세 및 정산 보고서 형식 구조체.
10. **[src/supabase.ts](file:///c:/Users/김규호/Desktop/간이포스기/src/supabase.ts)**: Supabase 통신 세션 초기값 지정 모듈.

### 소스코드 무결성 진단 명령어
다음 검증 명령을 통해 언제든지 정적 타입 유효성 및 최종 번들 빌드 적합성을 로컬에서 재평가할 수 있습니다.
```bash
# 1. TypeScript 정적 무결성 분석
npm run typecheck

# 2. 운영 배포 패키지 테스트 빌드
npm run build
```
