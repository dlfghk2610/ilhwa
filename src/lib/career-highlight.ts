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

const ws = (s: string) => String(s ?? "").replace(/\s/g, "");

const lev = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let mn = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      mn = Math.min(mn, cur[j]);
    }
    if (mn > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/** 사업명과 가장 가까운 구간 (띄어쓰기 무시, 오타·추가 글자 최대 2자 허용) */
function exactSpan(line: Line, t: string): Box[] | null {
  const its = line.items;
  const MAX = 2;
  let best: { d: number; b: Box[] } | null = null;
  for (let i = 0; i < its.length; i++) {
    let s = "";
    for (let j = i; j < its.length; j++) {
      if (j > i) {
        const prev = its[j - 1];
        const gap = its[j].transform[4] - (prev.transform[4] + prev.width);
        if (gap > (prev.height || Math.abs(prev.transform[3]) || 9) * 1.2) break;
      }
      s += ws(its[j].str);
      if (s.length > t.length + MAX) break;
      if (s.length < t.length - MAX) continue;
      const d = lev(s, t, MAX);
      if (d <= MAX && (!best || d < best.d)) best = { d, b: its.slice(i, j + 1).map((it) => itemBox(line, it)) };
    }
  }
  return best ? best.b : null;
}

export type Hit = { boxes: Box[]; key: string; row: number };

/** 착수일 줄 바로 위/같은 줄에서 사업명이 정확히 일치하는 곳 — 엑셀 1행당 최대 1곳 */
export function matchRows(lines: Line[], rows: Row[]): Hit[] {
  const byPage = new Map<number, Line[]>();
  lines.forEach((l) => { if (!byPage.has(l.page)) byPage.set(l.page, []); byPage.get(l.page)!.push(l); });
  const used = new Set<string>();
  const hits: Hit[] = [];
  for (const [ri, r] of rows.entries()) {
    const t = ws(r.project);
    if (t.length < 2) continue;
    const tryLines = (cands: Line[]) => {
      for (const l of cands) {
        const b = exactSpan(l, t);
        if (!b) continue;
        const txt = l.items.map((i: any) => i.str).join("");
        const ph = phaseOf(t), sp = phaseOf(txt);
        if (ph && sp && ph !== sp) continue; // 1차·2차는 다른 사업
        const key = `${l.page}|${Math.round(l.y)}|${Math.round(b[0].x)}`;
        if (used.has(key)) continue;
        used.add(key); hits.push({ boxes: b, key, row: ri }); return true;
      }
      return false;
    };
    if (r.start) {
      for (const dl of lines) {
        if (!hasDate(dl, r.start)) continue;
        // 준공일까지 확인 (같은 줄 또는 바로 아래)
        if (r.end && !byPage.get(dl.page)!.some((l) => (l === dl || (l.y < dl.y + 2 && dl.y - l.y < 45)) && hasDate(l, r.end))) continue;
        const cand = byPage.get(dl.page)!.filter((l) => l.y - dl.y > -2 && l.y - dl.y < 24).sort((a, b) => a.y - b.y);
        if (tryLines(cand)) break;
      }
    } else tryLines(lines);
  }
  return hits;
}
