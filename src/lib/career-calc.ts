// PQ 개인별 경력관리 계산 로직

export const ENV_CATEGORIES = [
  "환경영향평가",
  "사전환경성검토",
  "소규모환경영향평가",
  "전략환경영향평가",
  "사후환경영향조사",
];

export type EvalGroup = "환경" | "기타";
export type CalcStandard = "건설기술인협회" | "환경영향평가"; // 계산 기준 타입 추가

export const classifyEval = (raw?: string | null): EvalGroup => {
  const v = (raw || "").trim();
  return ENV_CATEGORIES.some((c) => v.includes(c)) ? "환경" : "기타";
};

export const evalWeight = (g: EvalGroup): number => (g === "환경" ? 1.0 : 0.6);

export const isWorkingNow = (periodEnd?: string | null): boolean => {
  if (!periodEnd) return true;
  const t = String(periodEnd).replace(/\s/g, "");
  return /근무중|재직중|현재|진행중/.test(t);
};

// "YYYY-MM-DD" 또는 "YYYY.MM.DD" → Date | null
export const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const t = String(s).replace(/\./g, "-").replace(/\//g, "-").trim();
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

export const dateDiffDaysInclusive = (a?: string | null, b?: string | null): number => {
  const s = parseDate(a);
  const e = parseDate(b);
  if (!s || !e) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
};

export const daysToYearMonth = (days: number): string => {
  const d = Math.max(0, Math.round(days));
  const y = Math.floor(d / 365);
  const m = Math.floor((d % 365) / 30);
  return `${y}년 ${m}개월`;
};

// [개선] 발주처명 기반 민간/공공 판독 로직 (AI 휴리스틱)
//   판독 우선순위:
//     1) 회사 법인격 마커((주)/㈜/주식회사/유한회사/합자회사/Co., Ltd. 등) → 무조건 민간
//     2) 명시적 학교·병원·아파트·조합 등 민간 키워드 → 민간
//     3) 행정구역(시/군/구/도/읍/면/동/리) 토큰 → 관공서
//     4) 명시적 공공기관 키워드 → 관공서
//     5) 2~4자 한글 단독 → 민간 (개인 이름 추정)
export const isPrivateClient = (clientName?: string | null): boolean => {
  if (!clientName) return false;
  const raw = clientName.trim();
  if (!raw) return false;
  // 공백·전각/반각 괄호 정규화
  const name = raw
    .replace(/\s/g, "")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")");

  // 1) 회사 법인격 마커 — 항상 최우선 (예: "(주)한국토지개발" 같이 공공 키워드가 섞여도 민간으로 처리)
  if (/\(주\)|\(유\)|\(합\)|㈜|㈔|㈐|㈜?주식회사|주식회사|유한회사|유한책임회사|합자회사|합명회사|협동조합|영농조합법인|영어조합법인/.test(name)) return true;
  if (/Co\.,?Ltd|Corporation|Corp\.|Inc\.|LLC|Ltd\./i.test(name)) return true;

  // 2) 명시적 민간/학교/병원 키워드
  if (/대학교|대학|학원|병원|의원|치과|한의원|아파트|입주자대표회|재건축조합|재개발조합|엔지니어링|건축사|건축사사무소|기술사사무소|컨설팅|컨설턴트|로펌|법무법인|회계법인|세무법인|특허법인|감정평가법인|연합회|협회|단체|재단법인|사단법인|학교법인|의료법인/.test(name)) return true;

  // 3) 공백으로 분리된 토큰 중 행정구역(시/군/구/도/읍/면/동/리)으로 끝나면 관공서
  const tokens = raw.split(/\s+/).filter(Boolean);
  const adminTokenRe = /^[가-힣]{1,6}(특별시|광역시|특별자치시|특별자치도|시|군|구|도|읍|면|동|리)$/;
  if (tokens.some((t) => adminTokenRe.test(t))) return false;

  // 4) 공백 없는 결합형 행정구역
  if (/^[가-힣]{2,8}(특별시|광역시|특별자치시|특별자치도)$/.test(name)) return false;
  if (/^[가-힣]{2,8}(시청|도청|군청|구청|시|군|구|도)$/.test(name)) return false;

  // 5) 명시적 공공기관 키워드
  if (/시청|도청|군청|구청|읍사무소|면사무소|동사무소|주민센터|행정복지센터|청사|국토관리|환경관리|환경청|환경부|문화재청|기상청|경찰청|소방청|소방서|보건소|교육청|교육지원청|국립|공립|공사|공단|본부|위원회|관리소|관리공단|관리원|연구원|연구소|진흥원|진흥공단|개발원|한국토지주택|수자원공사|도로공사|철도공사|공항공사|군부대|사단|여단|부대|정부|국방부|행정안전부|국토교통부|산업통상자원부|보건복지부|농림축산식품부|해양수산부|문화체육관광부|교육부|과학기술정보통신부|외교부|통일부|법무부|국세청|관세청|특허청|병무청|조달청|통계청|검찰청|감사원|국회|법원|선거관리위원회/.test(name)) return false;

  // 6) 개인 이름 추정
  if (/^[가-힣]{2,4}$/.test(name)) return true;

  return false;
};

export type CareerEntry = {
  id: string;
  technician_id: string;
  project_name?: string | null;
  client?: string | null;
  service_field?: string | null;
  specialty?: string | null;
  duties?: string | null;
  evaluation_category?: string | null;
  participation_company?: string | null;
  participation_position?: string | null;
  period_start?: string | null;
  period_end_text?: string | null;
  recognized_days?: number | null;
  notes?: string | null;
};

export type RecognitionRow = {
  entry: CareerEntry;
  evalGroup: EvalGroup;
  weight: number;
  recognizedDays: number; 
  convertedDays: number; 
  isPrivate: boolean; // 화면에 표시하기 위해 추가
};

// [수정됨] 파라미터에 excludePrivate (민간제외 여부) 추가
export const computeRecognition = (
  entry: CareerEntry,
  techSpecialty?: string | null,
  excludePrivate: boolean = false
): RecognitionRow => {
  const evalGroup = classifyEval(entry.evaluation_category);
  const weight = evalWeight(evalGroup);
  const working = isWorkingNow(entry.period_end_text);
  const specialtyMatch =
    !!techSpecialty &&
    !!entry.specialty &&
    entry.specialty.trim() === techSpecialty.trim();
  
  const isPrivate = isPrivateClient(entry.client);

  // 민간 제외가 체크되어 있고, 해당 발주처가 민간이면 인정일을 0으로 처리
  if (excludePrivate && isPrivate) {
    return {
      entry,
      evalGroup,
      weight,
      recognizedDays: 0,
      convertedDays: 0,
      isPrivate
    };
  }

  const base = working || !specialtyMatch ? 0 : Number(entry.recognized_days || 0);
  return {
    entry,
    evalGroup,
    weight,
    recognizedDays: base,
    convertedDays: +(base * weight).toFixed(2),
    isPrivate
  };
};

export type OverlapItem = {
  row: RecognitionRow;
  start: Date;
  end: Date;
  participationDays: number;
};

export type ShiftItem = {
  row: RecognitionRow;
  origStart: Date;
  origEnd: Date;
  adjStart: Date;
  adjEnd: Date;
  participationDays: number;
  convertedDays: number;
};

export const computeShifted = (rows: RecognitionRow[]): ShiftItem[] => {
  const parsed = rows
    .map((r) => {
      const s = parseDate(r.entry.period_start);
      const e = parseDate(r.entry.period_end_text);
      if (!s || !e) return null;
      return { r, s, e };
    })
    .filter((x): x is { r: RecognitionRow; s: Date; e: Date } => x !== null)
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  const out: ShiftItem[] = [];
  let prevEnd: Date | null = null;
  for (const { r, s, e } of parsed) {
    let adjStart = s;
    if (prevEnd && s.getTime() <= prevEnd.getTime()) {
      adjStart = new Date(prevEnd.getTime() + 86400000);
    }
    const days = Math.max(0, Math.round((e.getTime() - adjStart.getTime()) / 86400000) + 1);
    out.push({
      row: r,
      origStart: s,
      origEnd: e,
      adjStart,
      adjEnd: e,
      participationDays: days,
      // convertedDays가 0으로 세팅된 민간 프로젝트는 계산에서도 0으로 유지
      convertedDays: r.convertedDays > 0 ? +(days * r.weight).toFixed(2) : 0,
    });
    prevEnd = e;
  }
  return out;
};

export const fmtDate = (d: Date): string => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${dd}`;
};

export const selectOptimal = (rows: RecognitionRow[]): OverlapItem[] => {
  const items: OverlapItem[] = rows
    .map((r) => {
      const s = parseDate(r.entry.period_start);
      const e = parseDate(r.entry.period_end_text);
      // 민간 제외 등으로 convertedDays가 0이 된 항목은 자동 탈락
      if (!s || !e || r.convertedDays <= 0) return null;
      return {
        row: r,
        start: s,
        end: e,
        participationDays: dateDiffDaysInclusive(r.entry.period_start, r.entry.period_end_text),
      };
    })
    .filter((x): x is OverlapItem => x !== null)
    .sort((a, b) => a.end.getTime() - b.end.getTime());

  const n = items.length;
  if (n === 0) return [];

  const p: number[] = items.map((it, idx) => {
    let lo = 0, hi = idx - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].end.getTime() < it.start.getTime()) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  });

  const dp: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const incl = items[i].row.convertedDays + (p[i] >= 0 ? dp[p[i]] : 0);
    const excl = i > 0 ? dp[i - 1] : 0;
    dp[i] = Math.max(incl, excl);
  }

  const chosen: OverlapItem[] = [];
  let i = n - 1;
  while (i >= 0) {
    const incl = items[i].row.convertedDays + (p[i] >= 0 ? dp[p[i]] : 0);
    const excl = i > 0 ? dp[i - 1] : 0;
    if (incl >= excl) {
      chosen.push(items[i]);
      i = p[i];
    } else {
      i -= 1;
    }
  }
  return chosen.reverse();
};
