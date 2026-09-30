import * as XLSX from "xlsx";

export type Row = { project: string; start: string; end: string };
export type Box = { page: number; x: number; y: number; w: number; h: number };
export type Line = { page: number; y: number; items: any[] };

export const norm = (s: string) =>
  String(s ?? "").replace(/[\s·ㆍ.,()\[\]{}\-_~'"“”‘’:;/\\&+㈜]/g, "").replace(/\(주\)|주식회사/g, "").toLowerCase();

export const toDate = (v: any): string => {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    // 한국 시간대에서는 엑셀 날짜가 하루 전 23시대로 읽히는 문제 → 반나절 더해 가장 가까운 날짜로 보정
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y > 1900) return `${d.y}.${String(d.m).padStart(2, "0")}.${String(d.d).padStart(2, "0")}`;
    return "";
  }
  const m = String(v).match(/((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  return m ? `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}` : "";
};

const DATE_RE = /^\s*(19|20)\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/;
const PROJECT_HEAD = /사업명|용역명|공사명|프로젝트/;

/** 시트 이름에 기술자 이름이 들어간 시트만 사용 (없으면 전체) */
export function pickSheets(names: string[], person: string): string[] {
  const p = person.replace(/\s/g, "");
  if (p) {
    const hit = names.filter((n) => n.replace(/\s/g, "").includes(p));
    if (hit.length) return hit;
  }
  // 이름 시트가 없으면 '총괄/집계' 성격 시트를 제외하지 않고 모두 사용
  return names;
}

export function readWorkbook(buf: ArrayBuffer, person: string): { rows: Row[]; sheets: string[] } {
  const wb = XLSX.read(buf, { cellDates: true });
  const out: Row[] = [];
  const seen = new Set<string>();
  const push = (r: Row) => {
    const k = `${norm(r.project)}|${r.start}|${r.end}`;
    if (seen.has(k)) return;
    seen.add(k); out.push(r);
  };
  const sheets = pickSheets(wb.SheetNames, person);
  for (const sn of sheets) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: "" });
    const hi = grid.slice(0, 15).findIndex((row) => row.some((c) => PROJECT_HEAD.test(String(c).replace(/\s/g, ""))));
    if (hi >= 0) {
      // 병합된 2줄 헤더(참여기간 → 착수일/준공일) 합치기
      const width = Math.max(grid[hi].length, (grid[hi + 1] || []).length);
      const head: string[] = [];
      for (let i = 0; i < width; i++) head.push((String(grid[hi][i] ?? "") + String(grid[hi + 1]?.[i] ?? "")).replace(/\s/g, ""));
      const col = (re: RegExp) => head.findIndex((h) => re.test(h));
      const cp = col(PROJECT_HEAD);
      const cs = col(/착수|시작|From/i), ce = col(/준공|종료|완료|To/i), cperiod = col(/참여기간|기간/);
      let last = "";
      for (const row of grid.slice(hi + 1)) {
        let project = String(row[cp] ?? "").trim();
        let start = cs >= 0 ? toDate(row[cs]) : "", end = ce >= 0 ? toDate(row[ce]) : "";
        if (!start && cperiod >= 0) {
          const v = row[cperiod];
          if (v instanceof Date) start = toDate(v);
          else {
            const ds = String(v).match(/(19|20)\d{2}\D*\d{1,2}\D*\d{1,2}/g) || [];
            start = toDate(ds[0] || ""); end = end || toDate(ds[1] || "");
          }
        }
        if (/^(계|합계|소계|총계)$/.test(project.replace(/\s/g, ""))) { last = ""; continue; }
        // 사업명이 빈 줄 = 위 사업의 추가 참여기간
        if (!project && start && last) project = last;
        if (!project || norm(project).length < 4) continue;
        last = project;
        push({ project, start, end });
      }
      continue;
    }
    // 헤더 없는 시트: 날짜 셀 + 가장 긴 한글 텍스트를 사업명으로 추정
    for (const row of grid) {
      const dates: string[] = [];
      let project = "";
      for (const c of row) {
        if (c instanceof Date || (typeof c === "string" && DATE_RE.test(c))) { const d = toDate(c); if (d) dates.push(d); continue; }
        const s = String(c ?? "").trim();
        if (/[가-힣]/.test(s) && s.length >= 6 && s.length > project.length && !/^\(?[주자]\)/.test(s)) project = s;
      }
      if (!dates.length || !project) continue;
      push({ project, start: dates[0], end: dates[1] || "" });
    }
  }
  return { rows: out, sheets };
}

export async function extractLines(pdfjs: any, bytes: ArrayBuffer): Promise<Line[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const lines: Line[] = [];
  for (let pi = 1; pi <= pdf.numPages; pi++) {
    const page = await pdf.getPage(pi);
    const tc = await page.getTextContent();
    const pageLines: Line[] = [];
    for (const it of tc.items as any[]) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const y = it.transform[5];
      const l = pageLines.find((l) => Math.abs(l.y - y) < 3);
      if (l) l.items.push(it); else pageLines.push({ page: pi - 1, y, items: [it] });
    }
    pageLines.forEach((l) => l.items.sort((a, b) => a.transform[4] - b.transform[4]));
    lines.push(...pageLines);
  }
  return lines;
}

/** 첫 페이지의 '성명' 뒤 이름 */
export function detectName(lines: Line[]): string {
  for (const l of lines.filter((l) => l.page === 0).sort((a, b) => b.y - a.y)) {
    const t = l.items.map((i) => i.str).join(" ");
    const m = t.match(/성\s*명\s*(?:\(\s*한\s*글\s*\))?\s*[:：]?\s*([가-힣]{2,5})/);
    if (m) return m[1];
  }
  return "";
}

const lineText = (l: Line) => norm(l.items.map((i) => i.str).join(""));
/** 줄 안의 날짜들을 yyyy.mm.dd로 통일 (2016.5.4 / 2016-05-04 / 2016년 5월 4일 / 16.05.04 모두 인식) */
const lineDates = (l: Line): string[] => {
  const t = l.items.map((i) => i.str).join("");
  const out: string[] = [];
  for (const m of t.matchAll(/((?:19|20)?\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)) {
    let y = m[1]; if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    out.push(`${y}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`);
  }
  return out;
};
const hasDate = (l: Line, d: string) => !!d && (lineDates(l).includes(d) || lineText(l).includes(norm(d)));

const bigrams = (s: string) => { const r = new Set<string>(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r; };
/** Dice 유사도 (띄어쓰기·부호 무시, 오타 일부 허용) */
const dice = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0; a.forEach((x) => { if (b.has(x)) n++; });
  return (2 * n) / (a.size + b.size);
};

const itemBox = (line: Line, it: any): Box => {
  const h = it.height || Math.abs(it.transform[3]) || 9;
  return { page: line.page, x: it.transform[4] - 1, y: line.y - h * 0.25, w: it.width + 2, h: h * 1.35 };
};

/** 사업명 끝의 차수 (예: (1차), 2차분, 제3차) — 없으면 "" */
export const phaseOf = (s: string): string => {
  const m = [...norm(s).matchAll(/(\d+)차(?!년)/g)];
  return m.length ? String(Number(m[m.length - 1][1])) : "";
};

/** 줄에서 연속된 글자 조각(최대 4개)을 이어 붙여 사업명과 가장 비슷한 구간 */
function bestSpan(line: Line, rb: Set<string>, ph = ""): { score: number; boxes: Box[] } {
  let best = { score: 0, boxes: [] as Box[] };
  const its = line.items;
  for (let i = 0; i < its.length; i++) {
    let s = "";
    for (let j = i; j < Math.min(its.length, i + 4); j++) {
      if (j > i) {
        const prev = its[j - 1];
        const gap = its[j].transform[4] - (prev.transform[4] + prev.width);
        const fh = prev.height || Math.abs(prev.transform[3]) || 9;
        if (gap > fh * 1.2) break; // 다른 칸(직무분야·담당업무 등)은 사업명에 포함하지 않음
      }
      s += norm(its[j].str);
      if (s.length < 4) continue;
      const sp = phaseOf(s);
      if (ph && sp && ph !== sp) continue; // 1차와 2차는 서로 다른 사업
      const sc = dice(bigrams(s), rb);
      if (sc > best.score) best = { score: sc, boxes: its.slice(i, j + 1).map((it) => itemBox(line, it)) };
    }
  }
  return best;
}

type Hit = { score: number; boxes: Box[]; lineKey: string };

/**
 * 경력증명서 구조: 사업명 줄 바로 아래에 착수일, 그 아래 '~' 와 준공일.
 * 착수일 줄을 기준점으로 바로 위/같은 줄의 사업명을 비교하고,
 * 준공일까지 맞으면 기준을 낮추고, 안 맞으면 더 엄격하게 본다.
 */
export function matchRows(lines: Line[], rows: Row[]): Box[] {
  const byPage = new Map<number, Line[]>();
  lines.forEach((l) => { if (!byPage.has(l.page)) byPage.set(l.page, []); byPage.get(l.page)!.push(l); });
  const claimed = new Map<string, number>(); // 사업명 줄별 최고 점수 (여러 행이 같은 줄을 차지하지 않게)
  const hits: Hit[] = [];

  for (const r of rows) {
    const t = norm(r.project);
    if (t.length < 4) continue;
    const rb = bigrams(t);
    const ph = phaseOf(r.project);
    let found = false;
    if (r.start) {
      for (const dl of lines) {
        if (!hasDate(dl, r.start)) continue;
        const pl = byPage.get(dl.page)!;
        const endOk = !!r.end && pl.some((l) => l.y < dl.y + 2 && dl.y - l.y < 45 && hasDate(l, r.end) && l !== dl)
          || (!!r.end && hasDate(dl, r.end) && lineText(dl).indexOf(norm(r.end)) !== lineText(dl).indexOf(norm(r.start)));
        const cand = pl.filter((l) => l.y - dl.y > -2 && l.y - dl.y < 24);
        let best: Hit = { score: 0, boxes: [], lineKey: "" };
        for (const l of cand) {
          const f = bestSpan(l, rb);
          if (f.score > best.score) best = { ...f, lineKey: `${l.page}|${Math.round(l.y)}` };
        }
        const need = endOk ? 0.5 : r.end ? 0.92 : 0.72; // 준공일이 다르면 거의 똑같은 이름만 인정
        if (best.score < need || !best.boxes.length) continue;
        found = true;
        hits.push(best);
      }
    }
    // 날짜로 못 찾으면 사업명만으로 (아주 엄격)
    if (!found && !r.start) { // 참여기간이 있는데 날짜가 안 맞으면 같은 이름이라도 칠하지 않음
      for (const l of lines) {
        const f = bestSpan(l, rb);
        if (f.score >= 0.9) hits.push({ ...f, lineKey: `${l.page}|${Math.round(l.y)}` });
      }
    }
  }
  for (const h of hits) claimed.set(h.lineKey, Math.max(claimed.get(h.lineKey) ?? 0, h.score));
  return hits.filter((h) => h.score >= (claimed.get(h.lineKey) ?? 0) - 1e-9).flatMap((h) => h.boxes);
}
