// PQ 개인별 경력관리 계산 로직

export const ENV_CATEGORIES = [
  "환경영향평가",
  "사전환경성검토",
  "소규모환경영향평가",
  "전략환경영향평가",
  "사후환경영향조사",
];

export type EvalGroup = "환경" | "기타";

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
  recognizedDays: number; // 적용된 인정일 (전문분야/근무중 룰 반영)
  convertedDays: number; // 환산일수
};

export const computeRecognition = (
  entry: CareerEntry,
  techSpecialty?: string | null,
): RecognitionRow => {
  const evalGroup = classifyEval(entry.evaluation_category);
  const weight = evalWeight(evalGroup);
  const working = isWorkingNow(entry.period_end_text);
  const specialtyMatch =
    !!techSpecialty &&
    !!entry.specialty &&
    entry.specialty.trim() === techSpecialty.trim();
  const base = working || !specialtyMatch ? 0 : Number(entry.recognized_days || 0);
  return {
    entry,
    evalGroup,
    weight,
    recognizedDays: base,
    convertedDays: +(base * weight).toFixed(2),
  };
};

// 가중 구간 스케줄링: 같은 전문분야 내 겹치지 않는 부분집합 중 환산일수 합 최대
export type OverlapItem = {
  row: RecognitionRow;
  start: Date;
  end: Date;
  participationDays: number;
};

export const selectOptimal = (rows: RecognitionRow[]): OverlapItem[] => {
  const items: OverlapItem[] = rows
    .map((r) => {
      const s = parseDate(r.entry.period_start);
      const e = parseDate(r.entry.period_end_text);
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

  // p[i] = 가장 큰 j < i 이면서 items[j].end < items[i].start
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
