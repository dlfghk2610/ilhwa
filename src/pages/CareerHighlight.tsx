import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, rgb } from "pdf-lib";
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

async function readExcel(file: File): Promise<Row[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const out: Row[] = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sn], { defval: "" });
    for (const r of rows) {
      const keys = Object.keys(r);
      const pick = (re: RegExp) => { const k = keys.find((k) => re.test(k.replace(/\s/g, ""))); return k ? r[k] : ""; };
      const project = String(pick(/사업명|용역명|공사명|프로젝트/) || "").trim();
      if (!project) continue;
      out.push({
        name: String(pick(/기술자|성명|이름/) || "").trim(),
        project,
        start: toDate(pick(/착수|시작|참여시작|From/i)),
        end: toDate(pick(/준공|종료|완료|참여종료|To/i)),
      });
    }
  }
  return out;
}

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

function matchRows(lines: Line[], rows: Row[], pdfName: string): Box[] {
  const boxes: Box[] = [];
  for (const r of rows) {
    if (pdfName && r.name && norm(r.name) !== norm(pdfName)) continue;
    const t = norm(r.project);
    if (t.length < 2) continue;
    for (const line of lines) {
      const found = findInLine(line, t);
      if (!found.length) continue;
      const near = lines.filter((l) => l.page === line.page && Math.abs(l.y - line.y) < 40);
      const dateBoxes: Box[] = [];
      let ok = !r.start && !r.end;
      for (const d of [r.start, r.end].filter(Boolean)) {
        for (const l of near) {
          const b = findInLine(l, norm(d));
          if (b.length) { ok = true; dateBoxes.push(...b); }
        }
      }
      if (!ok) continue;
      boxes.push(...found, ...dateBoxes);
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
  const [techName, setTechName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [stat, setStat] = useState<{ c: number; p: number; both: number } | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const run = async () => {
    if (!careerFile || !perfFile || !pdfFile) { toast.error("파일 3개를 모두 업로드하세요."); return; }
    setBusy(true);
    try {
      const [cRows, pRows, bytes] = await Promise.all([readExcel(careerFile), readExcel(perfFile), pdfFile.arrayBuffer()]);
      const lines = await extractLines(bytes);
      let name = techName.trim();
      if (!name) {
        for (const l of lines) {
          const m = l.items.map((i) => i.str).join("").match(/성명\s*[:：]\s*([가-힣]{2,5})/);
          if (m) { name = m[1]; break; }
        }
      }
      const cBoxes = matchRows(lines, cRows, name);
      const pBoxes = matchRows(lines, pRows, name);
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
          pg.drawRectangle({ x: b.x, y: b.y + b.h / 2, width: b.w, height: b.h / 2, color: cc, opacity: 0.45 });
          pg.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h / 2, color: pc, opacity: 0.45 });
        } else pg.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: cc, opacity: 0.45 });
      }
      for (const [k, b] of pMap) {
        if (cMap.has(k)) continue;
        pages[b.page].drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: pc, opacity: 0.45 });
      }
      const out = await doc.save();
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" })));
      setStat({ c: cMap.size, p: pMap.size, both });
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
              <div className="flex items-center gap-2 text-sm"><span>실적 색상</span>
                <input type="color" value={perfColor} onChange={(e) => setPerfColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border" /></div>
            </div>
            <div className="space-y-2">
              <Label>③ 경력증명서 (.pdf)</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
              <Input placeholder="기술자 이름 (비우면 PDF 성명 자동 인식)" value={techName} onChange={(e) => setTechName(e.target.value)} />
            </div>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Highlighter className="h-4 w-4" />} 형광펜 표시 실행
              </Button>
              <Button variant="outline" onClick={download} disabled={!url}><Download className="h-4 w-4" /> PDF 다운로드</Button>
              {stat && <span className="text-sm text-muted-foreground">경력 {stat.c}곳 · 실적 {stat.p}곳 · 중복(반반) {stat.both}곳</span>}
            </div>
            <p className="md:col-span-3 text-xs text-muted-foreground">
              엑셀 열 이름 예: 기술자명/성명, 사업명, 착수일/시작일, 준공일/종료일. 사업명과 참여기간(날짜)이 함께 일치하는 항목만 표시됩니다. 경력·실적에 모두 있는 사업은 위쪽 절반은 경력 색, 아래쪽 절반은 실적 색으로 칠해집니다.
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
