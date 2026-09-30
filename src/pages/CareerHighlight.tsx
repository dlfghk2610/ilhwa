import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { BlendMode, PDFDocument, rgb } from "pdf-lib";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Highlighter, Loader2 } from "lucide-react";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

import { readWorkbook, extractLines, detectName, matchRows, type Box } from "@/lib/career-highlight";

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
  const [stat, setStat] = useState<{ c: number; p: number; both: number; cr: number; pr: number; person: string; cs: string[]; ps: string[] } | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const run = async () => {
    if (!careerFile || !perfFile || !pdfFile) { toast.error("파일 3개를 모두 업로드하세요."); return; }
    setBusy(true);
    try {
      const [cBuf, pBuf, bytes] = await Promise.all([careerFile.arrayBuffer(), perfFile.arrayBuffer(), pdfFile.arrayBuffer()]);
      const lines = await extractLines(pdfjsLib, bytes);
      const person = detectName(lines);
      const cw = readWorkbook(cBuf, person), pw = readWorkbook(pBuf, person);
      const cRows = cw.rows, pRows = pw.rows;
      const cHits = matchRows(lines, cRows);
      const pHits = matchRows(lines, pRows);
      const cBoxes = cHits.flatMap((h) => h.boxes), pBoxes = pHits.flatMap((h) => h.boxes);
      const pKeys = new Set(pHits.map((h) => h.key));
      const bothN = cHits.filter((h) => pKeys.has(h.key)).length;
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
      setStat({ c: cHits.length, p: pHits.length, both: bothN, cr: cRows.length, pr: pRows.length, person, cs: cw.sheets, ps: pw.sheets });
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
              {stat && (
                <span className="text-sm text-muted-foreground">
                  {stat.person && <>기술자: <b className="text-foreground">{stat.person}</b> (시트: {stat.cs.join(", ")} / {stat.ps.join(", ")}) · </>}
                  엑셀 인식: 경력 {stat.cr}건 · 실적 {stat.pr}건 → 표시: 경력 {stat.c}곳 · 실적 {stat.p}곳 · 중복(반반) {stat.both}곳
                </span>
              )}
            </div>
            <p className="md:col-span-3 text-xs text-muted-foreground">
              사업명(띄어쓰기만 무시, 글자는 정확히 일치)과 착수일을 기준으로 찾되, 형광펜은 사업명 글자에만 칠합니다. 경력·실적에 모두 있는 사업은 사업명의 위쪽 절반은 경력 색, 아래쪽 절반은 실적 색으로 칠해집니다. 저장된 색상은 클릭으로 골라 쓰고 우클릭으로 삭제할 수 있습니다.
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
