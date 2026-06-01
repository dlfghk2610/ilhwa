## PQ 작성양식관리 페이지 수정

`src/pages/PqForms.tsx` 한 파일만 수정합니다.

### 1. 샘플 데이터 제거
- `MOCK` 배열과 `buildMockItem`, `makePlaceholderThumb` 헬퍼 제거
- `useState<PqItem[]>(MOCK)` → `useState<PqItem[]>([])`
- 목록이 비어있을 때 안내 카드 문구를 "등록된 PQ가 없습니다. 우측 상단 [새 사업 PQ 등록] 버튼으로 추가하세요."로 변경

### 2. 삭제 기능 추가
- 갤러리 카드 우측 상단에 휴지통 아이콘 버튼(호버 시 표시) 추가
- 클릭 시 카드 클릭 이벤트는 `stopPropagation`으로 막고, `AlertDialog`로 삭제 확인 후 해당 항목을 목록에서 제거
- 삭제 시 `URL.revokeObjectURL`로 PDF/HWP object URL 정리하고 toast로 안내

### 3. 뷰어 모달 X 버튼 중복 수정
- 현재 `DialogContent`가 기본으로 우측 상단 X 버튼을 렌더링하는데, 상단 바에도 직접 X 버튼을 두어 2개가 겹쳐 보임
- 상단 바에 직접 둔 `<Button>` (X 아이콘) 제거 → 기본 X 1개만 남김
- 기본 X 버튼이 상단 바 텍스트와 겹치지 않도록 `DialogTitle` 영역에 우측 패딩(`pr-10`)만 살짝 추가

### 기술 메모
- 데이터는 여전히 클라이언트 메모리에만 존재합니다(새로고침 시 사라짐). 영구 저장이 필요하면 별도 요청으로 Lovable Cloud 연동을 추가할 수 있습니다.