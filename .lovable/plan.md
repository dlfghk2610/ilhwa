# PQ 개인별 실적관리 개편 계획

## 1. 데이터베이스 변경

기존 `personal_performances` 테이블에 컬럼을 추가하고, 참여자 정보는 JSON으로 저장합니다.

추가 컬럼:
- `service_overview` (사업개요)
- `contract_start_date`, `contract_end_date` (계약 시작/종료)
- `contract_amount` (계약금액)
- `share_rate` (지분율 %), `share_amount` (지분금액 - 자동계산 + 수기수정)
- `evaluation_types` (text[], 평가종류 복수선택)
- `service_types` (text[], 사업종류 복수선택 - 자유입력)
- `company_share_rate` (각사지분율, text)
- `participants` (jsonb, 참여자 배열)
- `participant_file_path` (참여자명단 PDF/DOCX 경로)

참여자 JSON 구조:
```json
{ "name": "홍길동", "birth_date": "1980-01-01", "period_start": "...", "period_end": "...",
  "specialty": "도로", "duties": "설계", "position": "책임", "responsibility": "100%" }
```

새 Storage 버킷: `participant-lists` (비공개, 본인만 접근).

## 2. 사업 등록/수정 화면 (메인 변경)

기존 DataManager 대체 - 전용 폼 컴포넌트 신규 작성.

필드:
- 사업명, 사업개요(textarea), 발주처
- 계약시작일 / 계약종료일 (date picker)
- 계약금액, 지분율(%) → 지분금액 = 계약금액 × 지분율 (자동, 수기 덮어쓰기 가능)
- 평가종류: 체크박스 그룹 (평가 / 전략 / 사후 / 소규모 - 복수선택)
- 사업종류: 칩 입력 방식 (자유 추가/삭제, 복수선택)
- 각사지분율 (text), 비고 (textarea)
- 참여자명단 파일 업로드 (PDF/DOCX) → "AI 자동 추출" 버튼 → 참여자 표 자동 채움 + 수기 수정 가능

## 3. 참여자명단 자동 추출

신규 Edge Function `parse-participant-list`:
- 업로드된 PDF/DOCX를 받아 Lovable AI Gateway (`google/gemini-2.5-flash`)로 표 추출
- 반환: 참여자 배열 JSON
- 프론트에서 참여자 표에 채워넣고 사용자가 수정 후 저장

## 4. 기술자별 건수 계산 화면

새 탭/섹션 "기술자별 실적조회":
- 등록된 모든 참여자 이름을 dedup하여 select
- 기술자 선택 + 평가종류 필터(복수) + 사업종류 필터(복수)
- 해당 기술자가 참여한 사업만 표시

각 사업별 계산:
- `평가가중치` = (평가종류 필터 중 하나라도 사업의 평가종류에 포함) ? 1.0 : 0.6 / 평가는 무조건 1.0 적용
- `사업가중치` = (사업종류 필터 중 하나라도 사업의 사업종류에 포함) ? 1.0 : 0.6
- `단순건수` = 평가가중치 × 사업가중치
- `기간비율` = max(0, min(계약종료, 참여종료) - max(계약시작, 참여시작)) / (계약종료 - 계약시작)
- `기간대비건수` = 기간비율 × 평가가중치 × 사업가중치

표 하단: 단순건수 합계, 기간대비건수 합계.

## 5. 엑셀 내보내기

기존 패턴 유지하되 새 필드 반영, 지분율은 `%` 표시.

## 기술 세부사항

- 마이그레이션: `ALTER TABLE personal_performances ADD COLUMN ...` + storage bucket 생성 + RLS
- 신규 컴포넌트: `src/pages/Performances.tsx` 전면 재작성, `src/components/PerformanceForm.tsx`, `src/components/TechnicianAnalysis.tsx`
- Edge function: `supabase/functions/parse-participant-list/index.ts` (verify_jwt = true 기본)
- HWP는 직접 미지원 → 사용자가 PDF/DOCX로 변환 후 업로드 (안내 문구 표시)

승인하시면 마이그레이션부터 진행합니다.
