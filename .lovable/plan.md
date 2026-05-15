# 실적 데이터베이스 관리 탭 — 통합 마스터 DB

## 목표

- 새 탭 **"실적 데이터베이스 관리"** 신설 — 모든 사업 실적의 마스터 레코드 (정보 + 파일).
- 기존 **PQ 개인별 실적관리**, **PQ 유사용역(회사실적)** 두 페이지는 이 마스터 DB의 **뷰(View)** 역할로 전환 — 자체 등록 폼 제거, 마스터 레코드를 읽고 각자 목적(개인별 분석 / 회사 PQ 적용)에 맞게 가공·필터·엑셀 추출만 수행.
- 기존 등록된 모든 `personal_performances` + `similar_services` 데이터를 신규 마스터 테이블로 마이그레이션.

## 데이터 모델

새 테이블 `performance_records` (두 기존 테이블의 superset):

| 필드 | 설명 | 출처 |
|---|---|---|
| project_name, service_overview, client | 사업 기본 | 공통 |
| contract_periods (jsonb), contract_start_date, contract_end_date | 계약기간(다중) | personal_performances |
| announcement_date | 공고일 | similar_services |
| completion_date | 준공일 | similar_services |
| contract_amount, share_rate, share_amount, company_share_rate | 금액/지분 | 공통 |
| evaluation_types (text[]) | 평가종류 (다중) | personal_performances + similar_services.evaluation_type 단일→배열 |
| service_types (text[]) | 사업종류 (다중) | personal_performances + similar_services.service_type 콤마분리→배열 |
| participants (jsonb) | 참여 기술자 명단 | personal_performances |
| participant_file_path | 참여자명단 원본파일 | personal_performances |
| cert_pdf_path | 실적증명PDF | 공통 |
| phases (jsonb) | 분담사업 단계 | similar_services |
| is_private, is_under_90days, is_lh_completion, is_progress, is_dual_participation | 플래그 | similar_services |
| participation_rate | 적용건수(기성건수 등) | similar_services |
| notes | 비고 | 공통 |
| created_by | RLS owner | 공통 |

기존 `personal_performances`, `similar_services` 테이블은 **유지** (안전을 위해 백업 역할). 단, 두 페이지의 모든 등록/수정/삭제 로직은 마스터 테이블을 보도록 전환.

## 마이그레이션 단계

1. **DB 마이그레이션** (`supabase--migration`)
   - `performance_records` 테이블 + RLS 정책 (소유자 only) + updated_at 트리거 생성.
   - `personal_performances` 행 → `performance_records`로 INSERT (필드 1:1 매핑, source='performance' 플래그 안 둠 — 통합).
   - `similar_services` 행 → `performance_records`로 INSERT (evaluation_type/service_type 단일값을 배열로 변환, 콤마 분리).
   - 기존 두 테이블은 그대로 둠 (롤백 안전망).

2. **새 페이지** `src/pages/PerformanceDatabase.tsx`
   - 라우트: `/performance-database` (사이드바 첫 번째 항목으로 추가, 아이콘 `Database`).
   - 좌측 목록 + 우측 상세/등록 폼 (또는 전체 폭 테이블 + 다이얼로그).
   - 모든 필드 입력: 사업명/개요/발주처, 다중 계약기간, 공고일/준공일, 금액·지분율·지분금액 자동계산, 평가종류·사업종류 다중선택, 각사지분율, 분담사업 단계, 참여 기술자 명단(파일업로드+자동추출 — 기존 edge function 재사용), 실적증명PDF 업로드, 플래그 체크박스 5개, 비고.
   - 검색, 엑셀 가져오기/내보내기, PDF 일괄생성 등 기존 두 페이지의 핵심 기능 흡수.

3. **기존 페이지 전환**
   - **Performances.tsx**: 데이터 소스를 `performance_records`로 교체. 등록/수정/삭제 버튼 제거 (또는 "마스터 DB에서 관리" 안내 + 마스터 페이지로 이동 링크). 기술자별 필터/분석/엑셀 추출/PDF 일괄생성은 그대로 유지.
   - **SimilarServices.tsx**: 동일 — 데이터 소스 교체, 등록/수정/삭제 제거, 회사실적 PQ 적용계산·엑셀 추출·필터·분담사업 토글 등 분석 기능만 유지.

4. **사이드바** (`AppSidebar.tsx`)
   - "실적 데이터베이스 관리" 항목을 대시보드 다음에 추가.

## 기술 메모

- 기존 `parse-participant-list` edge function, `performance-certs` / `participant-lists` 스토리지 버킷 그대로 재사용.
- 분담사업(phases) 구조: SimilarServices의 jsonb 형태 그대로 유지.
- 엑셀 가져오기 매핑: 기존 두 페이지의 컬럼 라벨을 합집합으로 지원.
- 기존 두 페이지의 자동계산 로직(지분금액=계약금액×지분율, 적용계수, 분담사업 합산 등)은 분석 단계에서 그대로 사용 — 마스터 데이터는 raw로만 저장.

## 영향 범위

- 신규: `performance_records` 테이블, `src/pages/PerformanceDatabase.tsx`
- 수정: `src/App.tsx` (라우트), `src/components/AppSidebar.tsx`, `src/pages/Performances.tsx`, `src/pages/SimilarServices.tsx`
- 데이터: 기존 두 테이블의 모든 행을 마스터로 복사 (기존 테이블 보존)

## 확인 사항

규모가 큰 변경입니다(약 4~5개 파일 수정 + 1500줄 분량 신규 페이지 + DB 마이그레이션). 이 방향으로 진행할까요? 아니면 우선 **1단계: 마스터 테이블 생성 + 데이터 마이그레이션 + 빈 신규 페이지 골격**까지만 하고 폼/뷰 전환은 다음 단계로 나눌까요?
