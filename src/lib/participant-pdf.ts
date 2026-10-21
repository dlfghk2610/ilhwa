/**
 * 참여자 명단 PDF(글자 인식 가능한 PDF)에서 참여 인력(성명·역할·참여시작일·참여제외일)을 읽어온다.
 * 표 머리글(성명/역할/참여기간 등)의 가로 위치로 칸을 나누고, 머리글이 없으면 등록된 기술자 이름으로 찾는다.
 */

export type PdfTextItem = { x: number; w: number; str: string };
export type PdfLine = { page: number; y: number; items: PdfTextItem[] };
export type ParsedParticipant = { name: string; role?: string; start_date: string; end_date: string };

type Col = "name" | "role" | "start" | "end" | "period" | "birth" | "no";

const HEADER_WORDS: Record<Col, string[]> = {
  name: ["기술자명", "참여자명", "성명", "이름"],
  role: ["담당업무", "참여분야", "담당분야", "직책", "직위", "역할", "담당", "분야", "등급"],
  start: ["참여시작일", "참여개시일", "참여일자", "투입일자", "투입일", "배치일", "시작일", "참여일", "시작", "부터"],
  end: ["참여제외일", "참여종료일", "철수일", "해제일", "제외일", "종료일", "종료", "제외", "까지", "철수"],
  period: ["참여기간", "투입기간", "기간"],
  birth: ["생년월일", "주민등록번호", "주민번호", "생년"],
  no: ["순번", "번호", "연번"],
};

const NOT_NAMES = new Set([
  "성명", "이름", "합계", "소계", "총계", "비고", "책임", "참여", "현재", "준공", "준공시", "계속", "기술자", "분야", "담당",
  "사업책임", "분야책임", "참여기술자", "명단", "참여자", "기간", "역할", "직위", "직책", "등급", "특급", "고급", "중급", "초급",
  "도로", "구조", "토목", "건축", "기계", "전기", "소방", "조경", "통신", "품질", "측량", "지질", "교통", "환경", "안전",
  "수자원", "상하수도", "상수도", "하수도", "도시계획", "단지", "철도", "교량", "터널", "항만", "감리", "설계", "시공",
  "사업", "관리", "총괄", "보조", "상주", "비상주", "기술사", "기사", "산업기사", "책임자", "담당자", "대표", "대표이사",
  "회사", "주식회사", "인원", "총원", "순번", "번호", "서명", "날인", "확인", "위와", "이상", "별첨", "첨부", "기술",
  "예정", "공란", "없음", "해당없음", "소속", "직급", "자격", "자격증", "면허", "경력", "학력", "연락처", "전화", "주소",
  "발주처", "용역명", "사업명", "계약", "착수", "변경", "당초", "신규", "교체", "철수", "투입", "제외", "업무",
  "부장", "차장", "과장", "대리", "사원", "이사", "상무", "전무", "사장", "부사장", "실장", "팀장", "소장", "단장", "본부장",
  "수석", "책임연구원", "선임", "주임", "전문", "일반", "건설", "기술인", "엔지니어", "계속중", "진행중", "참여중",
]);
// 이름 안에 이런 낱말이 들어 있으면 이름이 아니다 (예: 도로분야, 참여기술자명단)
const NOT_NAME_PARTS = ["분야", "책임", "기술", "명단", "합계", "소계", "담당", "참여", "기간", "업무", "회사", "사업", "용역", "계약"];

// 흔한 한국 성씨 (복성은 첫 글자로 포함)
const SURNAMES = new Set(
  ("김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁국어은편용예경봉사부가견계단담당대동두려로뢰림매묵미범빈삼상순승시아애야엽영옹요운웅음저점종좌증초태판팽평포피필학해형호화환후흥독근" +
    "개빙즙").split(""),
);

/** 2~4글자 한글이면서 성씨로 시작하고, 표 머리글·분야·직급 같은 낱말이 아니면 사람 이름으로 본다. */
export function isLikelyName(s: string): boolean {
  const t = (s || "").replace(/\s+/g, "");
  if (!/^[가-힣]{2,4}$/.test(t)) return false;
  if (!SURNAMES.has(t[0])) return false;
  if (NOT_NAMES.has(t)) return false;
  if (NOT_NAME_PARTS.some((w) => t.includes(w))) return false;
  return true;
}

/** 성명 칸의 글자에서 이름을 고른다. 칸에 다른 문장이 섞여 있으면 이름으로 보지 않는다. */
function pickName(cell: string): string {
  const s = cell.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^가-힣\s]/g, " ").trim();
  if (!s) return "";
  const joined = s.replace(/\s+/g, "");
  if (isLikelyName(joined)) return joined; // "김 철 수"처럼 띄어 쓴 경우
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2 && isLikelyName(tokens[0])) return tokens[0]; // "홍길동 특급"
  return "";
}

const DATE_RE = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;

const pad = (n: string) => n.padStart(2, "0");

/** 한 줄 안의 날짜들을 글자 위치와 함께 찾는다. */
function datesIn(items: PdfTextItem[]): { iso: string; x: number }[] {
  const out: { iso: string; x: number }[] = [];
  // 같은 줄의 글자를 이어 붙여(날짜가 여러 조각으로 나뉜 경우 대비) 위치를 기억한다
  let joined = "";
  const xs: number[] = [];
  for (const it of items) {
    const s = it.str;
    const step = s.length ? it.w / s.length : 0;
    for (let i = 0; i < s.length; i++) { joined += s[i]; xs.push(it.x + step * i); }
    joined += " "; xs.push(it.x + it.w);
  }
  for (const m of joined.matchAll(DATE_RE)) {
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const a = m.index ?? 0;
    const b = a + m[0].trimEnd().length - 1;
    out.push({ iso: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, x: ((xs[a] ?? 0) + (xs[b] ?? xs[a] ?? 0)) / 2 });
  }
  return out;
}

/** 머리글 줄에서 각 칸의 가운데 x 위치를 찾는다 (글자가 한 자씩 떨어져 있어도 인식). */
function headerColumns(line: PdfLine): Partial<Record<Col, number>> {
  let joined = "";
  const xs: number[] = [];
  for (const it of line.items) {
    const s = it.str.replace(/\s+/g, "");
    const step = s.length ? it.w / s.length : 0;
    for (let i = 0; i < s.length; i++) { joined += s[i]; xs.push(it.x + step * (i + 0.5)); }
  }
  const cols: Partial<Record<Col, number>> = {};
  const used = new Array(joined.length).fill(false);
  // 긴 낱말부터 찾아 '참여시작일' 안의 '시작'이 따로 잡히지 않게 한다
  const all = (Object.keys(HEADER_WORDS) as Col[])
    .flatMap((c) => HEADER_WORDS[c].map((w) => ({ c, w })))
    .sort((a, b) => b.w.length - a.w.length);
  for (const { c, w } of all) {
    if (cols[c] !== undefined) continue;
    let from = 0;
    while (true) {
      const idx = joined.indexOf(w, from);
      if (idx < 0) break;
      const span = used.slice(idx, idx + w.length);
      if (span.every((u) => !u)) {
        for (let i = idx; i < idx + w.length; i++) used[i] = true;
        cols[c] = (xs[idx] + xs[idx + w.length - 1]) / 2;
        break;
      }
      from = idx + 1;
    }
  }
  return cols;
}

const isHeader = (cols: Partial<Record<Col, number>>) =>
  cols.name !== undefined && (cols.role !== undefined || cols.start !== undefined || cols.period !== undefined || cols.birth !== undefined || cols.end !== undefined);

function nearestCol(x: number, cols: Partial<Record<Col, number>>): Col | null {
  let best: Col | null = null;
  let bestD = Infinity;
  for (const [c, cx] of Object.entries(cols) as [Col, number][]) {
    const d = Math.abs(cx - x);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}


function findKnownName(text: string, known: string[]): string {
  const t = text.replace(/\s+/g, "");
  let best = "";
  for (const n of known) if (n && t.includes(n) && n.length > best.length) best = n;
  return best;
}

/** 날짜 목록에서 참여시작일·참여제외일을 고른다 (생년월일로 보이는 날짜는 뺀다). */
function pickPeriod(dates: string[]): { start: string; end: string } {
  let ds = dates;
  if (ds.length > 2) ds = ds.filter((d) => Number(d.slice(0, 4)) >= 2000);
  return { start: ds[0] || "", end: ds[1] || "" };
}

export function parseParticipantLines(lines: PdfLine[], knownNames: string[] = []): ParsedParticipant[] {
  const known = [...new Set(knownNames.map((n) => n.replace(/\s+/g, "")).filter((n) => n.length >= 2))];
  const sorted = [...lines].sort((a, b) => a.page - b.page || b.y - a.y);
  const out: ParsedParticipant[] = [];
  let cols: Partial<Record<Col, number>> | null = null;
  let headerPage = -1;
  let headerY = 0;

  for (let li = 0; li < sorted.length; li++) {
    const line = sorted[li];
    const hc = headerColumns(line);
    if (isHeader(hc)) {
      cols = hc; headerPage = line.page; headerY = line.y;
      continue;
    }
    // 두 줄짜리 머리글 (예: 참여기간 아래 시작/종료)
    if (cols && line.page === headerPage && headerY - line.y < 30 && !datesIn(line.items).length) {
      const extra = headerColumns(line);
      const hasNewCols = (Object.keys(extra) as Col[]).some((c) => c === "start" || c === "end");
      if (hasNewCols) { cols = { ...cols, ...extra, name: cols.name }; if (extra.start !== undefined || extra.end !== undefined) delete cols.period; continue; }
    }

    const text = line.items.map((i) => i.str).join(" ");
    let name = "";
    let role = "";
    let dates: { iso: string; x: number }[] = datesIn(line.items);

    if (cols) {
      const byCol: Partial<Record<Col, string[]>> = {};
      for (const it of line.items) {
        const c = nearestCol(it.x + it.w / 2, cols);
        if (!c) continue;
        (byCol[c] ||= []).push(it.str);
      }
      const nameCell = (byCol.name || []).join(" ");
      role = (byCol.role || []).join(" ").replace(/\s+/g, " ").trim();
      if (cols.birth !== undefined) dates = dates.filter((d) => nearestCol(d.x, cols!) !== "birth");
      // 1) 성명 칸에 등록된 기술자 이름 → 그대로 인정
      const knownInCell = findKnownName(nameCell, known);
      if (knownInCell) name = knownInCell;
      else {
        // 2) 성명 칸이 사람 이름 모양이고, 같은 줄에 참여 날짜가 있어야 인정 (머리글·합계·안내문 제외)
        const guess = pickName(nameCell);
        if (guess && dates.length) name = guess;
        // 3) 칸이 어긋난 경우: 같은 줄에 등록된 기술자 이름과 날짜가 함께 있으면 인정
        else if (dates.length) name = findKnownName(text, known);
      }
      if (!name) continue;
      let start = "";
      let end = "";
      if (cols.start !== undefined || cols.end !== undefined) {
        for (const d of dates) {
          const c = nearestCol(d.x, cols);
          if (c === "start" && !start) start = d.iso;
          else if (c === "end" && !end) end = d.iso;
        }
        if (!start && !end) ({ start, end } = pickPeriod(dates.map((d) => d.iso)));
      } else {
        ({ start, end } = pickPeriod(dates.map((d) => d.iso)));
      }
      if (/^\d+$/.test(role) || dates.some((d) => role.includes(d.iso.slice(0, 4)))) role = "";
      out.push({ name, role: role || undefined, start_date: start, end_date: end });
    } else {
      name = findKnownName(text, known);
      if (!name) continue;
      const { start, end } = pickPeriod(dates.map((d) => d.iso));
      out.push({ name, start_date: start, end_date: end });
    }
  }

  // 같은 사람·같은 시작일은 한 번만
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.name}|${p.start_date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** PDF 글자를 줄 단위로 읽는다. 글자가 없으면(스캔본) 빈 배열. */
export async function extractPdfLines(bytes: ArrayBuffer): Promise<PdfLine[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    cMapUrl: `${import.meta.env.BASE_URL}cmaps/`,
    cMapPacked: true,
  }).promise;
  const lines: PdfLine[] = [];
  for (let pi = 1; pi <= pdf.numPages; pi++) {
    const page = await pdf.getPage(pi);
    const tc = await page.getTextContent();
    const pageLines: PdfLine[] = [];
    for (const it of tc.items as any[]) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const y = it.transform[5];
      const item = { x: it.transform[4], w: it.width || 0, str: it.str };
      const l = pageLines.find((l) => Math.abs(l.y - y) < 4);
      if (l) l.items.push(item); else pageLines.push({ page: pi - 1, y, items: [item] });
    }
    pageLines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    lines.push(...pageLines);
  }
  return lines;
}

/** 읽어온 인력을 기존 목록에 합친다: 같은 이름(시작일이 같거나 비어 있음)은 갱신, 나머지는 추가. */
export function mergeParticipants<T extends { name: string; role?: string; start_date?: string | null; end_date?: string | null }>(
  existing: T[],
  parsed: ParsedParticipant[],
): { list: T[]; added: number; updated: number } {
  const list = existing.map((p) => ({ ...p }));
  let added = 0;
  let updated = 0;
  for (const p of parsed) {
    const idx = list.findIndex((e) => e.name.replace(/\s+/g, "") === p.name && (!e.start_date || !p.start_date || e.start_date === p.start_date));
    if (idx >= 0) {
      const cur = list[idx];
      const next = {
        ...cur,
        role: p.role || cur.role,
        start_date: p.start_date || cur.start_date || "",
        end_date: p.end_date || cur.end_date || "",
      };
      if (next.role !== cur.role || next.start_date !== (cur.start_date || "") || next.end_date !== (cur.end_date || "")) updated += 1;
      list[idx] = next;
    } else {
      list.push({ name: p.name, role: p.role, start_date: p.start_date, end_date: p.end_date } as T);
      added += 1;
    }
  }
  return { list, added, updated };
}

/**
 * 기준일(공고일 또는 오늘) 기준으로 참여중·제외·참여예정 인원을 센다.
 * 제외: '참여제외' 체크했거나 참여제외일이 기준일 이전(같은 날 포함). 참여예정: 참여시작일이 기준일 이후.
 */
export function countParticipants(
  list: { name?: string; start_date?: string | null; end_date?: string | null; excluded?: boolean }[],
  refDate: string,
): { active: number; excluded: number; upcoming: number; total: number } {
  let active = 0, excluded = 0, upcoming = 0;
  for (const p of list) {
    if (!(p.name || "").trim()) continue;
    if (p.excluded || (p.end_date && p.end_date <= refDate)) excluded += 1;
    else if (p.start_date && p.start_date > refDate) upcoming += 1;
    else active += 1;
  }
  return { active, excluded, upcoming, total: active + excluded + upcoming };
}

/** 예전 자동반영 때 잘못 들어간 항목(사람 이름 모양도 아니고 등록된 기술자도 아닌 것)을 걸러낸다. */
export function dropNonNames<T extends { name: string }>(list: T[], knownNames: string[] = []): { list: T[]; removed: number } {
  const known = new Set(knownNames.map((n) => n.replace(/\s+/g, "")));
  const kept = list.filter((p) => {
    const n = (p.name || "").replace(/\s+/g, "");
    return !n || known.has(n) || isLikelyName(n);
  });
  return { list: kept, removed: list.length - kept.length };
}
