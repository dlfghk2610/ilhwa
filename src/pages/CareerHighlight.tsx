import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BlendMode, PDFDocument, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Highlighter, Loader2 } from "lucide-react";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type Row = { name: string; project: string; start: string; end: string };
type Box = { page: number; x: number; y: number; w: number; h: number };

const norm = (s: string) => String(s ?? "").replace(/[\s·ㆍ.,()\[\]\-_~'"“”]/g, "").toLowerCase();

const toDate = (v: any): string => {
  if (v == null || v === "") return "";
  if (v instanceof Date) return `${v.getFullYear()}.${String(v.getMonth() + 1).padStart(2, "0")}.${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}.${String(d.m).padStart(2, "0")}.${String(d.d).padStart(2, "0")}`;
  }
  const m = String(v).match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  return m ? `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}` : "";
};

const DATE_RE = /^\s*(19|20)\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/;

async function readExcel(file: File): Promise<Row[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const out: Row[] = [];
  const seen = new Set<string>();
  const push = (r: Row) => {
    const k = `${norm(r.project)}|${r.start}|${r.end}`;
    if (seen.has(k)) return;
    seen.add(k); out.push(r);
  };
  for (const sn of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: "" });
    const hi = grid.slice(0, 15).findIndex((row) => row.some((c) => /사업명|용역명|공사명|프로젝트/.test(String(c).replace(/\s/g, ""))));
    if (hi >= 0) {
      const head = grid[hi].map((c) => String(c).replace(/\s/g, ""));
      const col = (re: RegExp) => head.findIndex((h) => re.test(h));
      const cp = col(/사업명|용역명|공사명|프로젝트/), cn = col(/기술자|성명|이름/);
      const cs = col(/착수|시작|From/i), ce = col(/준공|종료|완료|To/i), cperiod = col(/참여기간|기간/);
      for (const row of grid.slice(hi + 1)) {
        const project = String(row[cp] ?? "").trim();
        if (!project) continue;
        let start = cs >= 0 ? toDate(row[cs]) : "", end = ce >= 0 ? toDate(row[ce]) : "";
        if (!start && cperiod >= 0) {
          const ds = String(row[cperiod]).match(/(19|20)\d{2}\D*\d{1,2}\D*\d{1,2}/g) || [];
          start = toDate(ds[0] || ""); end = toDate(ds[1] || "");
        }
        push({ name: cn >= 0 ? String(row[cn] ?? "").trim() : "", project, start, end });
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
      push({ name: "", project, start: dates[0], end: dates[1] || "" });
    }
  }
  return out;
}

/** 2글자 조각 (오타·띄어쓰기 무시 유사도용) */
const bigrams = (s: string) => { const r = new Set<string>(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r; };
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; a.forEach((x) => { if (b.has(x)) n++; }); return n; };

type Line = { page: number; y: number; items: any[] };

async function extractLines(bytes: ArrayBuffer): Promise<Line[]> {
  const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
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

/** 줄 안에서 target(정규화) 문자열에 해당하는 영역 박스 */
function findInLine(line: Line, target: string): Box[] {
  if (!target) return [];
  let joined = "";
  const owner: { it: any; frac: number }[] = [];
  for (const it of line.items) {
    const chars = [...String(it.str)];
    chars.forEach((ch, i) => {
      const n = norm(ch);
      if (!n) return;
      joined += n;
      owner.push({ it, frac: i / chars.length });
    });
  }
  const res: Box[] = [];
  let from = 0;
  while (true) {
    const idx = joined.indexOf(target, from);
    if (idx < 0) break;
    const a = owner[idx], b = owner[idx + target.length - 1];
    const ax = a.it.transform[4] + a.it.width * a.frac;
    const bLen = [...String(b.it.str)].length;
    const bx = b.it.transform[4] + b.it.width * (b.frac + 1 / bLen);
    const h = a.it.height || Math.abs(a.it.transform[3]) || 9;
    res.push({ page: line.page, x: ax - 1, y: line.y - h * 0.25, w: bx - ax + 2, h: h * 1.35 });
    from = idx + target.length;
  }
  return res;
}

const itemBox = (line: Line, it: any): Box => {
  const h = it.height || Math.abs(it.transform[3]) || 9;
  return { page: line.page, x: it.transform[4] - 1, y: line.y - h * 0.25, w: it.width + 2, h: h * 1.35 };
};

/** 줄 안에서 사업명과 비슷한 텍스트 조각들 + 유사도 점수 */
function fuzzyInLine(line: Line, rb: Set<string>): { score: number; boxes: Box[] } {
  const all = bigrams(norm(line.items.map((i) => i.str).join("")));
  const score = rb.size ? overlap(rb, all) / rb.size : 0;
  const candidates: { box: Box; score: number }[] = [];
  for (const it of line.items) {
    const n = norm(it.str);
    if (n.length < 4) continue;
    const ib = bigrams(n);
    const shared = overlap(ib, rb);
    const itemScore = ib.size && rb.size ? shared / Math.max(ib.size, rb.size) : 0;
    if (itemScore >= 0.3) candidates.push({ box: itemBox(line, it), score: itemScore });
  }
  const best = Math.max(0, ...candidates.map((c) => c.score));
  const boxes = candidates.filter((c) => c.score >= Math.max(0.3, best * 0.85)).map((c) => c.box);
  return { score, boxes };
}

function matchRows(lines: Line[], rows: Row[]): Box[] {
  const boxes: Box[] = [];
  for (const r of rows) {
    const t = norm(r.project);
    if (t.length < 3) continue;
    const rb = bigrams(t);
    const sd = norm(r.start);
    let hit = false;
    if (sd) {
      // 착수일을 기준점으로 근처 줄에서 비슷한 사업명 찾기
      for (const dl of lines) {
        const sBox = findInLine(dl, sd);
        if (!sBox.length) continue;
        const cand = lines.filter((l) => l.page === dl.page && l.y - dl.y > -6 && l.y - dl.y < 36);
        let best = { score: 0, boxes: [] as Box[] };
        for (const l of cand) { const f = fuzzyInLine(l, rb); if (f.score > best.score && f.boxes.length) best = f; }
        if (best.score < 0.55) continue;
        hit = true;
        boxes.push(...best.boxes);
      }
    }
    // 날짜로 못 찾으면 사업명만으로 (더 엄격한 기준)
    if (!hit) {
      for (const l of lines) { const f = fuzzyInLine(l, rb); if (f.score >= 0.8) boxes.push(...f.boxes); }
    }
  }
  return boxes;
}

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const key = (b: Box) => `${b.page}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}`;

export default function CareerHighlight() {
  const [careerFile, setCareerFile] = useState<File | null>(null);
  const [perfFile, setPerfFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [careerColor, setCareerColor] = useState(() => localStorage.getItem("hl_career_color") || "#ffeb3b");
  const [perfColor, setPerfColor] = useState(() => localStorage.getItem("hl_perf_color") || "#7fdbff");
  useEffect(() => { localStorage.setItem("hl_career_color", careerColor); }, [careerColor]);
  useEffect(() => { localStorage.setItem("hl_perf_color", perfColor); }, [perfColor]);
  const [palette, setPalette] = useState<string[]>(() => {
    try {
      const p = JSON.parse(localStorage.getItem("hl_palette") || "");
      if (Array.isArray(p) && p.length) return p;
    } catch { /* ignore */ }
    return ["#ffeb3b", "#7fdbff", "#a2f5a2", "#ffb3ba", "#ffd8a8", "#d0bfff", "#f9a8d4", "#9be7e4"];
  });
  useEffect(() => { localStorage.setItem("hl_palette", JSON.stringify(palette)); }, [palette]);

  /** 팔레트에 색상 추가 (중복 시 무시, 최대 24개) */
  const addToPalette = (color: string) => {
    setPalette((p) => {
      if (p.includes(color)) { toast.info("이미 저장된 색상입니다."); return p; }
      toast.success("팔레트에 색상이 저장되었습니다.");
      return [...p, color].slice(0, 24);
    });
  };

  /** 팔레트에서 색상 제거 */
  const removeFromPalette = (color: string) => {
    setPalette((p) => (p.length <= 1 ? p : p.filter((c) => c !== color)));
  };
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [stat, setStat] = useState<{ c: number; p: number; both: number; cr: number; pr: number } | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const run = async () => {
    if (!careerFile || !perfFile || !pdfFile) { toast.error("파일 3개를 모두 업로드하세요."); return; }
    setBusy(true);
    try {
      const [cRows, pRows, bytes] = await Promise.all([readExcel(careerFile), readExcel(perfFile), pdfFile.arrayBuffer()]);
      const lines = await extractLines(bytes);
      const cBoxes = matchRows(lines, cRows);
      const pBoxes = matchRows(lines, pRows);
      const cMap = new Map(cBoxes.map((b) => [key(b), b]));
      const pMap = new Map(pBoxes.map((b) => [key(b), b]));
      const doc = await PDFDocument.load(bytes);
      const pages = doc.getPages();
      const cc = hex(careerColor), pc = hex(perfColor);
      let both = 0;
      for (const [k, b] of cMap) {
        const pg = pages[b.page];
        if (pMap.has(k)) {
          both++;
          pg.drawRectangle({ x: b.x, y: b.y + b.h / 2, width: b.w, height: b.h / 2, color: cc, opacity: 0.45, blendMode: BlendMode.Multiply });
          pg.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h / 2, color: pc, opacity: 0.45, blendMode: BlendMode.Multiply });
        } else pg.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: cc, opacity: 0.45, blendMode: BlendMode.Multiply });
      }
      for (const [k, b] of pMap) {
        if (cMap.has(k)) continue;
        pages[b.page].drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: pc, opacity: 0.45, blendMode: BlendMode.Multiply });
      }
      const out = await doc.save();
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" })));
      setStat({ c: cMap.size, p: pMap.size, both, cr: cRows.length, pr: pRows.length });
      if (!cMap.size && !pMap.size) toast.warning("일치하는 항목을 찾지 못했습니다. (스캔본 PDF는 인식 불가)");
      else toast.success("형광펜 표시 완료");
    } catch (e: any) {
      toast.error("처리 실패: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!url || !pdfFile) return;
    const a = document.createElement("a");
    a.href = url; a.download = pdfFile.name.replace(/\.pdf$/i, "") + "_형광펜.pdf"; a.click();
  };

  return (
    <AppLayout title="경력증명서 형광펜 표시">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">파일 업로드 및 색상 설정</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>① 경력 엑셀 (.xlsx, .xls)</Label>
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => setCareerFile(e.target.files?.[0] || null)} />
              <div className="flex flex-wrap items-center gap-2 text-sm"><span>경력 색상</span>
                <input type="color" value={careerColor} onChange={(e) => setCareerColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border" />
                <Button type="button" variant="outline" size="sm" onClick={() => addToPalette(careerColor)}>＋ 팔레트 저장</Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {palette.map((c) => (
                  <button key={c} type="button" title={`${c} — 클릭: 적용, 우클릭: 삭제`}
                    onClick={() => setCareerColor(c)}
                    onContextMenu={(e) => { e.preventDefault(); removeFromPalette(c); }}
                    className={`h-7 w-7 shrink-0 rounded border-2 ${c === careerColor ? "border-foreground" : "border-border"} cursor-pointer transition-transform hover:scale-110`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>② 실적 엑셀 (.xlsx, .xls)</Label>
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => setPerfFile(e.target.files?.[0] || null)} />
              <div className="flex flex-wrap items-center gap-2 text-sm"><span>실적 색상</span>
                <input type="color" value={perfColor} onChange={(e) => setPerfColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border" />
                <Button type="button" variant="outline" size="sm" onClick={() => addToPalette(perfColor)}>＋ 팔레트 저장</Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {palette.map((c) => (
                  <button key={c} type="button" title={`${c} — 클릭: 적용, 우클릭: 삭제`}
                    onClick={() => setPerfColor(c)}
                    onContextMenu={(e) => { e.preventDefault(); removeFromPalette(c); }}
                    className={`h-7 w-7 shrink-0 rounded border-2 ${c === perfColor ? "border-foreground" : "border-border"} cursor-pointer transition-transform hover:scale-110`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>③ 경력증명서 (.pdf)</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
            </div>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Highlighter className="h-4 w-4" />} 형광펜 표시 실행
              </Button>
              <Button variant="outline" onClick={download} disabled={!url}><Download className="h-4 w-4" /> PDF 다운로드</Button>
              {stat && <span className="text-sm text-muted-foreground">엑셀 인식: 경력 {stat.cr}건 · 실적 {stat.pr}건 → 표시: 경력 {stat.c}곳 · 실적 {stat.p}곳 · 중복(반반) {stat.both}곳</span>}
            </div>
            <p className="md:col-span-3 text-xs text-muted-foreground">
              사업명(띄어쓰기·오타 무시)과 착수일을 기준으로 찾되, 형광펜은 사업명 글자에만 칠합니다. 경력·실적에 모두 있는 사업은 사업명의 위쪽 절반은 경력 색, 아래쪽 절반은 실적 색으로 칠해집니다. 저장된 색상은 클릭으로 골라 쓰고 우클릭으로 삭제할 수 있습니다.
            </p>
          </CardContent>
        </Card>
        {url && (
          <Card>
            <CardHeader><CardTitle className="text-base">미리보기</CardTitle></CardHeader>
            <CardContent><iframe src={url} title="미리보기" className="w-full h-[80vh] rounded border" /></CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
