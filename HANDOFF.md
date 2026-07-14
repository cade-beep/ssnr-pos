# HANDOFF: RBAC & Store Isolation Implementation

이 문서는 간이 POS 프로젝트의 RBAC(역할 기반 접근 제어) 및 매장 격리 시스템 개발 내역을 후임 AI 에이전트에게 인계하기 위해 작성되었습니다.

---

## 1. 프로젝트 기술 스택 (Tech Stack)

* **Core**: React, TypeScript, Vite
* **Desktop**: Electron
* **Database / Backend**: Supabase (PostgreSQL)
* **Secondary Log Logging**: Google Apps Script & Google Spreadsheet
* **Icons**: `lucide-react`

---

## 2. 프로젝트 구조 (Project Structure)

```
간이포스기/
├── src/
│   ├── App.tsx                     # GNB 메뉴 바 제어 및 글로벌 탭 라우팅 통합
│   ├── types.ts                    # CashierUser 및 Customer 인터페이스 정의
│   ├── supabase.ts                 # Supabase 클라이언트 초기화
│   ├── components/
│   │   ├── LoginOverlay.tsx        # 바이패스/일반 로그인 및 사내 직원(Staff) 회원가입 폼
│   │   ├── Cart.tsx                # 장바구니 및 Staff 대상 할인 버튼 숨김 처리
│   │   ├── ProductsView.tsx        # 상품 목록 테이블 및 점주 전용 CRUD 권한 처리
│   │   ├── HistoryView.tsx         # 매출 기록 피드 및 Staff 당일 조회 격리 / CSV 익스포트
│   │   ├── SettingsView.tsx        # 마감 정산 실행 및 영수증 프린터 로컬 설정
│   │   ├── InventoryView.tsx       # [NEW] 재고 실시간 현황 및 수동 재고 조정 이력
│   │   ├── CustomersView.tsx       # [NEW] 고객 마일리지 검색 및 포인트 목록 조회
│   │   └── EmployeesView.tsx       # [NEW] 직원 등록 초대 메타데이터 및 직급 관리
│   └── utils/
│       ├── auditLogger.ts          # 감사 로그 저장 유틸 및 SIGNUP 액션 지원
│       └── asyncHelper.ts          # 타임아웃 지연 처리
└── supabase/
    └── migrations/
        └── 20260714000002_implement_rbac_and_store_isolation.sql # 스토어 격리 RLS 정책 및 검증 트리거
```

---

## 3. 현재 코드 상태 (Current Status)

* **TypeScript 컴파일 성공**: `npm run typecheck` 및 `npx tsc`가 경고나 오류 없이 완벽하게 통과합니다.
* **RLS & Trigger 설정 완료**: 데이터베이스 차원에서 Staff/Manager의 부정 접근 및 가격 수정을 원천 차단하는 트리거와 RLS 정책 SQL 마이그레이션이 작성되었습니다.
* **회원가입/자동 스토어 소속 연동**: `LoginOverlay.tsx`에 신규 가입 기능이 추가되어, 가입 시 기존 매장 관리자로부터 공유받은 `store_id`(매장 고유 코드)를 입력받아 해당 매장의 `Staff` 역할로 계정이 생성됩니다. 또한, 매장의 고유 코드는 로그인 후 [설정] 탭의 '근무자 정보 및 보안' 영역에서 쉽게 복사할 수 있습니다.

---

## 4. 에러 로그 및 해결 방법 (Troubleshooting History)

1. **`PlusMinus` 아이콘 정의 미확인**:
   * *원인*: `lucide-react`에 `PlusMinus` 아이콘이 존재하지 않아 컴파일 오류가 발생함.
   * *해결*: `SlidersHorizontal` 아이콘으로 교체하여 해결함.
2. **`SIGNUP` 액션 미등록**:
   * *원인*: `auditLog`에 `SIGNUP` 타입 액션이 지정되지 않아 형식 오류가 발생함.
   * *해결*: `src/utils/auditLogger.ts` 내 `AuditLogEntry` 인터페이스 유니온 타입에 `'SIGNUP'`을 명시적으로 추가함.
3. **get_employees_rpc 함수 중복 오류**:
   * *원인*: 마이그레이션 SQL 파일의 후반부 추가 과정에서 임시 정의된 빈 스텁 함수가 중복 생성되어 SQL 구문 에러를 유발함.
   * *해결*: 중복 선언된 빈 함수 스텁을 제거하고 정상 동작하는 PL/pgSQL 블록만 남김.

---

## 5. 필수 환경 변수 목록 (Environment Variables)

* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`
* `VITE_DEV_ADMIN_EMAIL`
* `VITE_DEV_ADMIN_PASSWORD`
* `VITE_ENABLE_DEV_LOGIN`
* `VITE_SPREADSHEET_URL`

---

## 6. 다음 구현 작업 및 검증 방법 (Next Steps & Verification)

### [Next Steps]
1. **마이그레이션 실행**: `supabase/migrations/20260714000002_implement_rbac_and_store_isolation.sql` 파일의 내용을 복사하여 Supabase 클라우드 콘솔의 SQL Editor에서 전체 실행해야 합니다. (로컬 샌드박스에서 클라우드 DB 직접 배포 불가로 인한 사용자 수동 작업 필요).
2. **직원 가입 테스트**: 로그인 창 하단의 "직원 계정 회원가입 (Staff)"을 클릭하고, 기존 매장 설정 탭에서 복사한 '매장 고유 코드'를 입력하여 가입을 진행합니다.
3. **직원 초대 및 권한 테스트**: 등록한 직원 계정으로 로그인한 뒤 GNB 메뉴 격리 및 할인 불가 정책이 올바르게 나타나는지 점검합니다.

### [검증 방법 (Verification)]
* **TypeScript 빌드 무결성 확인**:
  ```bash
  npm run typecheck
  npx tsc
  ```
* **데이터베이스 우회 차단 검증**:
  Staff 계정으로 브라우저 개발자 도구 콘솔에서 supabase 클라이언트를 활용해 타 매장 데이터 변경 혹은 `adjust_product_stock` RPC 직접 호출 시 `permission denied` 예외가 정상 발생하여 데이터베이스 정책이 작동하는지 직접 모니터링합니다.
