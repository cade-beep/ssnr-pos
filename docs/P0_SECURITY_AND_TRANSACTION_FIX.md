# P0 보안 및 트랜잭션 차단점 수정 완료 보고서

본 문서는 사내 재고 기록 관리 및 결제 시스템(Mini POS)의 P0 배포 차단 오류들(익명 데이터베이스 임의 접근, 동시 결제 시 재고 음수 진입, 이중 매출 중복 제출 및 재고 수동 조정 감사 누락)에 대한 보안 엔지니어링 조치 내역 보고서입니다.

---

## 1. 수정된 파일 및 마이그레이션 목록

* **데이터베이스 마이그레이션**:
  * [supabase/migrations/20260714000000_secure_rls_and_rpcs.sql](file:///c:/Users/김규호/Desktop/간이포스기/supabase/migrations/20260714000000_secure_rls_and_rpcs.sql)
* **프론트엔드 핵심 파일**:
  * [src/App.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/App.tsx): 결제 모달 `isSubmitting` 락 설정, 고유 UUID 멱등성 키 생성 및 `complete_sale` RPC 연동.
  * [src/components/HistoryView.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/HistoryView.tsx): 개별 주문 환불 시 관리자 사유 입력을 필수로 적용하고 `refund_order` RPC 연동.
  * [src/components/ProductsView.tsx](file:///c:/Users/김규호/Desktop/간이포스기/src/components/ProductsView.tsx): 수동 재고 수량 정정 시 조치 사유 입력을 필수로 제한하고 `adjust_product_stock` RPC 연동.

---

## 2. 기존 취약점(Old Risk) 및 개선 조치(New Protection)

| 보안 위협 (Risk) | 수정 전 상태 (Old) | 수정 후 상태 (New Protection) |
| :--- | :--- | :--- |
| **익명 사용자 무제한 DB 쓰기** | `public` 권한이 풀려 있어 브라우저 개발자 도구의 API 호출로 임의의 상품 가격 위조 및 매출 레코드 삭제가 가능했음. | RLS를 완전 활성화하여 외부 직접 삽입/수정 쿼리를 원천 차단하고 오직 데이터베이스 검증 RPC를 통해서만 쓰기가 가능하게 함. |
| **동시 결제 재고 음수 오작동** | 다수 디바이스에서 마지막 남은 한 개 재고를 동시 결제할 시 선검사 우회로 재고가 마이너스(`-1`, `-2`)로 떨어짐. | `products` 테이블에 `CHECK (stock >= 0)` 제약 조건을 삽입하고, 결제 RPC 내부에서 `FOR UPDATE` 행 잠금(Row Lock)을 이용해 트랜잭션 롤백 처리. |
| **이중 결제 처리 (Double Submit)** | 네트워크 응답 지연 시 결제 완료 단추를 다중 클릭하면 한 개의 거래가 이중 매출로 중복 기입되고 재고가 이중 차감됨. | 결제 시작 즉시 `isSubmitting` 상태를 활성화해 UI 폼 전체를 비활성화 잠금 조치하고, 브라우저가 생성한 UUID 멱등키를 통해 DB 중복 등록을 예방. |
| **권한 우회 (Privilege Escalation)** | 프론트엔드의 `currentCashier.role` 변수에 의존하여 화면을 제어하여 캐셔 계정의 관리자 기능 호출 차단이 불가능했음. | Supabase의 `auth.uid()` 인증 값과 매핑된 `user_roles` 테이블을 DB 수준에서 직접 질의하여 권한(관리자/캐셔)을 검증하도록 구성. |
| **무결성 추적(Audit) 부재** | 사내 비축 재고를 수동으로 수정하거나 가격을 임의 변경할 시 어떠한 기록도 남지 않아 감사 불가능. | `inventory_movements` (재고 수동/자동 입출고 이력) 및 `product_audit_logs` (상품 마스터 변경 이력) 테이블을 구축하여 수정 일지 강제 축적. |

---

## 3. RLS 정책 매트릭스 (Table RLS Matrix)

데이터베이스 내 모든 주요 비즈니스 테이블은 행 레벨 보안(RLS)이 작동하고 있으며 아래의 규칙을 준수합니다.

| 테이블명 | Anon (비인증 익명) | Authenticated (일반 캐셔) | Authenticated (관리자 Admin) | 정책 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **products** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 모든 제어 허용 (`ALL`) | 일반 사용자의 단가 조작 차단 |
| **orders** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 읽기 허용 (`SELECT`) | RPC 외부의 임의 매출 기입 불가능 |
| **order_items** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 읽기 허용 (`SELECT`) | 매출 세부 명세 보호 |
| **closing_reports** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 읽기/쓰기 허용 (`SELECT`/`INSERT`) | 캐셔의 정산 리포트 무단 덮어쓰기 금지 |
| **inventory_movements** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 읽기 허용 (`SELECT`) | 재고 입출고 기록 테이블 |
| **product_audit_logs** | 거부 (Deny) | 거부 (Deny) | 읽기 허용 (`SELECT`) | 어드민 계정 전용 정보 변경 감사기록 |
| **user_roles** | 거부 (Deny) | 읽기 허용 (`SELECT`) | 모든 제어 허용 (`ALL`) | 회원별 고유 권한 테이블 |

---

## 4. RPC 입출력 규약 (RPC Interface Contracts)

모든 데이터베이스의 입력 검증 및 상태 전이는 아래 RPC 함수들을 경유하며, 세션 검증이 실패하거나 인가되지 않은 역할의 사용자인 경우 예외를 발생시키고 전체 연산을 롤백합니다.

### 1) `complete_sale` (결제 트랜잭션 처리)
* **권한**: `authenticated` (인증된 모든 사용자)
* **입력 매개변수**:
  * `p_idempotency_key` (`VARCHAR`): 클라이언트에서 생성한 영수증/결제 시도 고유 UUID
  * `p_payment_method` (`VARCHAR`): `'CARD'` 또는 `'TRANSFER'`
  * `p_total_amount` (`NUMERIC`): 최종 수납 단가 (글로벌 할인 공제 후 실결제액)
  * `p_total_quantity` (`INTEGER`): 장바구니 총 수량
  * `p_received_amount` (`NUMERIC`): 고객 수납 액수
  * `p_change` (`NUMERIC`): 현금 거스름돈
  * `p_items` (`JSONB`): 결제 품목 상세 명세 배열 `[{product_id, product_name, price, quantity, discount, discount_qty, is_percent, discount_percent}, ...]`
  * `p_global_discount` (`NUMERIC`): 전체 장바구니 적용 할인 금액
* **출력 구조 (`JSONB`)**:
  * 성공 시: `{"success": true, "is_duplicate": false, "order_id": "UUID"}`
  * 이미 결제된 건 재요청 시 (멱등성 작동): `{"success": true, "is_duplicate": true, "order_id": "UUID"}`
  * 유효성 검사 실패 시: DB SQL Exception을 발생시킴. (예: `재고가 부족합니다.`, `가격 정보가 일치하지 않습니다.`)

### 2) `refund_order` (매출 환불 및 재고 롤백)
* **권한**: `authenticated` (관리자 권한인 `is_admin` 충족 필요)
* **입력 매개변수**:
  * `p_order_number` (`VARCHAR`): 환불 타겟 주문 번호
  * `p_reason` (`VARCHAR`): 환불 사유 기입
* **출력 구조 (`JSONB`)**:
  * 성공 시: `{"success": true, "already_refunded": false, "order_id": "UUID"}`
  * 이미 환불 완료된 건 재요청 시: `{"success": true, "already_refunded": true, "order_id": "UUID"}`

### 3) `adjust_product_stock` (수동 재고 조정)
* **권한**: `authenticated` (관리자 권한인 `is_admin` 충족 필요)
* **입력 매개변수**:
  * `p_product_id` (`VARCHAR`): 조정할 상품 코드
  * `p_amount` (`INTEGER`): 증감값 (예: `-5` 또는 `10`)
  * `p_reason` (`TEXT`): 변경 사유 입력 (필수)
* **출력 구조 (`BOOLEAN`)**:
  * 성공 시 `true` 반환.

---

## 5. 수동 Supabase 대시보드 추가 설정 사항

본 마이그레이션이 원활히 동작하기 위해서는 Supabase 프로젝트 대시보드에서 아래의 수동 설정이 필요합니다.

1. **마이그레이션 파일 실행**:
   * [supabase/migrations/20260714000000_secure_rls_and_rpcs.sql](file:///c:/Users/김규호/Desktop/간이포스기/supabase/migrations/20260714000000_secure_rls_and_rpcs.sql) 파일의 SQL 전체를 복사하여, Supabase Dashboard 내 **SQL Editor**에 붙여넣기 한 후 **RUN** 버튼을 눌러 스키마를 업데이트해 주어야 합니다.
2. **관리자 계정 지정**:
   * 특정 캐셔 사용자에게 상품 생성/수정 및 환불 권한(어드민)을 부여하려면 데이터베이스 SQL Editor 또는 Table Editor에서 `public.user_roles` 테이블에 행을 추가하거나 갱신하여 권한을 지정합니다:
     ```sql
     -- 특정 유저(UUID)를 관리자(role = '관리자')로 등록하는 예시
     INSERT INTO public.user_roles (user_id, role)
     VALUES ('USER_UUID_HERE', '관리자')
     ON CONFLICT (user_id) DO UPDATE SET role = '관리자';
     ```
   * 참고로 `rbflrbgh@ssnr-pos.com` 이메일 주소 또는 `admin` 계정 계열의 이메일 주소는 마이그레이션 내부의 트리거(`handle_new_user`)에 의해 가입 시 **자동으로 관리자 권한이 부여**됩니다.

---

## 6. 테스트 및 빌드 결과

* **정적 타입 무결성 분석**: `npm run typecheck` 실행 결과 에러 없음 (**0 Errors**)
* **Vite 배포 압축 빌드**: `npm run build` 실행 결과 성공 (**Vite built completed**)

---

## 7. 롤백 방법 (Rollback Notes)

만약 예기치 않은 데이터 구조 문제로 인해 롤백이 필요할 경우, Supabase SQL Editor에서 아래 명령을 실행하여 조치를 원래 상태로 환원할 수 있습니다.

```sql
-- 1. 신설된 RPC 함수 및 트리거 삭제
DROP FUNCTION IF EXISTS public.adjust_product_stock(VARCHAR, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.refund_order(VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.complete_sale(VARCHAR, VARCHAR, NUMERIC, INTEGER, NUMERIC, NUMERIC, JSONB, NUMERIC) CASCADE;
DROP TRIGGER IF EXISTS trg_product_audit ON public.products;
DROP FUNCTION IF EXISTS public.log_product_changes() CASCADE;

-- 2. 감사 일지 및 입출고 내역 테이블 삭제
DROP TABLE IF EXISTS public.product_audit_logs;
DROP TABLE IF EXISTS public.inventory_movements;

-- 3. 유효성 제약조건 완화
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_check;
DROP INDEX IF EXISTS public.products_barcode_unique_idx;

-- 4. 역할 정보 테이블 제거 및 트리거 해제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
DROP TABLE IF EXISTS public.user_roles;

-- 5. RLS를 임시 공개 정책으로 회복 (롤백 상황에만 권장)
CREATE POLICY "Allow public all to products" ON public.products FOR ALL TO public USING (true) WITH CHECK (true);
```
