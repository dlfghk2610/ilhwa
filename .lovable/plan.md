# 입찰참가관리 개편 계획

## 1. 데이터베이스 스키마 변경 (bid_participations)

기존 컬럼 유지하면서 다음 필드 추가/변경:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| project_name | text | 사업명 (기존) |
| client | text | 발주처 (기존) |
| announcement_date | date | 공고일 (신규) |
| pq_due_date | date | PQ제출마감일 (신규) |
| bid_start_date | date | 입찰시작일 (신규, 기존 bid_date 마이그레이션) |
| bid_end_at | timestamptz | 입찰마감일+시간 (신규) |
| estimated_amount | numeric | 추정금액 (기존) |
| share_rates | jsonb | 각사 지분율 `[{company, rate}]` (신규) |
| participants | jsonb | 참여인력 `[{name, role}]` (신규) |
| evaluation_types | text[] | 평가종류 (신규) |
| service_types | text[] | 사업종류 (신규) |
| agreement_approval_date | date | 협정승인일 (신규) |
| status | text | 상태 (기존) |
| notes | text | 비고 (기존) |
| notify_hours_before | integer | 마감 N시간 전 알람 (신규) |
| notify_browser | boolean default true | 브라우저 알람 (신규, 고정 on) |
| notify_email | text | 알람 메일 주소 (신규, nullable) |
| notify_phone | text | 알람 핸드폰번호 (신규, nullable) |
| notified_at | timestamptz | 발송 완료 시각 (중복 방지) |

## 2. UI (src/pages/Bids.tsx 재작성)

- DataManager 대신 PerformanceDatabase 스타일의 전용 폼/테이블 구현
- 입찰마감일은 datetime-local input
- 각사 지분율: 회사명+지분율 동적 추가/삭제 행
- 참여인력: 이름+역할 동적 추가/삭제 행
- 평가종류/사업종류: 멀티 체크박스
- 알림 섹션:
  - 브라우저 알람: 항상 켜짐 (체크박스 disabled+checked 표시)
  - 메일 알림 받기 체크 → 메일 주소 입력칸
  - 문자/카카오톡 알림 받기 체크 → 핸드폰번호 입력칸
  - "마감 몇시간 전" 숫자 입력 (기본 24)
- 테이블 컬럼: 사업명/발주처/공고일/PQ마감/입찰시작/입찰마감/추정금액/상태/D-시간
- 스크롤 위치 기억 (PerformanceDatabase와 동일 패턴)

## 3. 알람 구현

### 브라우저 알람 (즉시 작동)
- 페이지 진입 시 `Notification.requestPermission()` 요청
- 1분 간격 setInterval로 모든 bid 검사: `bid_end_at - notify_hours_before <= now < bid_end_at` 이고 `notified_at IS NULL` 인 건 알림 표시 후 notified_at 업데이트
- 마감 임박/지난 항목은 테이블에서 색상 강조

### 메일/문자 알람
- 메일: Lovable Cloud 기본 이메일 인프라 사용 가능. 단 사용자가 별도 도메인/주소 설정해야 함. 본 단계에서는 **알람 수신 주소 필드만 저장**하고 발송 백엔드는 다음 작업으로 분리 권장 (Edge Function + pg_cron 필요, 도메인 설정 별도)
- 문자/카카오톡: Lovable 내장 SMS 발송 기능 없음. Aligo/Solapi/Twilio 같은 외부 API 키 필요. 이번 단계에서는 **핸드폰번호 필드만 저장**, 실제 발송은 사용자가 SMS 제공자 선택 후 별도 진행

## 이번 작업 범위
1. DB 마이그레이션 (위 컬럼 모두 추가)
2. Bids.tsx 전체 재작성 — 폼/테이블/필터/엑셀 입출력/스크롤 기억
3. 브라우저 알람 클라이언트 사이드 구현
4. 메일/SMS 수신정보 입력 UI + DB 저장 (실제 발송은 후속 작업으로 안내)

## 다음 단계로 안내할 항목
- 메일 발송: 이메일 도메인 설정 + cron edge function
- 문자 알림: SMS 제공자(Aligo/Solapi 등) 선택 및 API 키 등록

진행해도 될까요?