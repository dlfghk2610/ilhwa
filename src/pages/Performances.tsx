import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Loader2, X, FileText, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportToExcel } from "@/lib/excel";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - vite worker url import
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type Period = { start?: string; end?: string };
type Participant = {
  name: string;
  birth_date?: string;
  period_start?: string;
  period_end?: string;
  periods?: Period[];
  specialty?: string;
  duties?: string;
  position?: string;
  responsibility?: string;
};

const formatBirth = (v: string) => {
  const d = (v || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
};
const isoToDisplay = (v?: string | null) => (v ? v.replace(/-/g, ".") : "");
const displayToIso = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};

function DateInput({ value, onChange, className, placeholder = "YYYY.MM.DD" }: { value: string; onChange: (iso: string) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState<string>(isoToDisplay(value));
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);
  return (
    <Input className={className} value={text} placeholder={placeholder} maxLength={10} inputMode="numeric"
      onChange={(e) => { const f = formatBirth(e.target.value); setText(f); onChange(displayToIso(f)); }} />
  );
}

const getPeriods = (p: Participant): Period[] => {
  if (Array.isArray(p.periods) && p.periods.length > 0) return p.periods;
  if (p.period_start || p.period_end) return [{ start: p.period_start, end: p.period_end }];
  return [];
};

type Row = {
  id: string;
  project_name: string;
  service_overview: string | null;
  client: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_periods: Period[];
  contract_amount: number | null;
  share_rate: number | null;
  share_amount: number | null;
  evaluation_types: string[];
  service_types: string[];
  company_share_rate: string | null;
  notes: string | null;
  participants: Participant[];
  participant_file_path: string | null;
  cert_pdf_path: string | null;
  is_private: boolean;
};

const EVAL_OPTIONS = ["평가", "전략", "사후", "소규모"];

const getContractPeriods = (r: { contract_periods?: Period[]; contract_start_date?: string | null; contract_end_date?: string | null }): Period[] => {
  if (Array.isArray(r.contract_periods) && r.contract_periods.length > 0) return r.contract_periods;
  if (r.contract_start_date || r.contract_end_date) return [{ start: r.contract_start_date || undefined, end: r.contract_end_date || undefined }];
  return [];
};

const daysBetween = (a: string, b: string) => {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (isNaN(d1) || isNaN(d2)) return 0;
  return Math.floor((d2 - d1) / 86400000) + 1;
};

const overlapDays = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const s = new Date(Math.max(new Date(aStart).getTime(), new Date(bStart).getTime()));
  const e = new Date(Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime()));
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
};

export default function Performances() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSeqNumbers, setAddSeqNumbers] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [selectedTech, setSelectedTech] = useState<string>("");
  const [techEvalFilter, setTechEvalFilter] = useState<string[]>([]);
  const [techServiceFilter, setTechServiceFilter] = useState<string[]>([]);
  const [techServiceFilterInput, setTechServiceFilterInput] = useState("");
  const [noticeDate, setNoticeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [techSelectedRowIds, setTechSelectedRowIds] = useState<Set<string>>(new Set());
  const [techSelectionTouched, setTechSelectionTouched] = useState(false);
  const [includeUnder90, setIncludeUnder90] = useState(false);
  const [excludeLhPhases, setExcludeLhPhases] = useState(false);
  const [excludePrivate, setExcludePrivate] = useState(false);
  const [expandedTechRows, setExpandedTechRows] = useState<Set<string>>(new Set());
  const toggleExpandedTechRow = (id: string) => setExpandedTechRows((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  useEffect(() => { fetchRows(); }, []);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("performance_records")
      .select("*")
      .order("contract_start_date", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as any[]).map(normalize));
    setLoading(false);
  }

  function normalize(r: any): Row {
    return {
      ...r,
      evaluation_types: Array.isArray(r.evaluation_types) ? r.evaluation_types : [],
      service_types: Array.isArray(r.service_types) ? r.service_types : [],
      participants: Array.isArray(r.participants) ? r.participants : [],
      contract_periods: Array.isArray(r.contract_periods) ? r.contract_periods : [],
    };
  }

  async function downloadFromBucket(bucket: "performance-certs" | "participant-lists", path: string, filename?: string) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || path.split("/").pop() || "download";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "다운로드 실패"); }
  }

  // 선택된 행 (착수일 오름차순)
  function getTargets(): Row[] {
    const base = rows.filter((r) => techSelectedRowIds.has(r.id));
    return [...base].sort((a, b) => {
      const av = a.contract_start_date ?? "";
      const bv = b.contract_start_date ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    });
  }

  function exportExcel() {
    const sorted = getTargets();
    const tech = selectedTech.trim();
    if (sorted.length === 0) { toast.error("선택된 사업이 없습니다"); return; }
    const data = sorted.map((r, i) => {
      const base: Record<string, any> = addSeqNumbers ? { 연번: i + 1 } : {};
      const cps = getContractPeriods(r);
      const contractDays = cps.reduce((s, pd) => s + (pd.start && pd.end ? daysBetween(pd.start, pd.end) : 0), 0);
      const row: Record<string, any> = {
        ...base,
        사업명: r.project_name,
        사업개요: r.service_overview ?? "",
        발주처: r.client ?? "",
        계약기간: cps.map((pd) => `${isoToDisplay(pd.start)} ~ ${isoToDisplay(pd.end)}`).join("\n"),
        계약기간일수: contractDays || "",
        계약금액: r.contract_amount ?? "",
        "지분율(%)": r.share_rate != null ? `${r.share_rate}%` : "",
        지분금액: r.share_amount ?? "",
        평가종류: r.evaluation_types.join(", "),
        사업종류: r.service_types.join(", "),
        각사지분율: r.company_share_rate ?? "",
      };
      if (tech) {
        const part = r.participants?.find((p) => p.name === tech);
        const periods = part ? getPeriods(part) : [];
        const partDays = cps.reduce((s, cp) =>
          s + periods.reduce((ss, pd) => ss + (cp.start && cp.end && pd.start && pd.end ? overlapDays(cp.start, cp.end, pd.start, pd.end) : 0), 0), 0);
        row["참여기간"] = periods.map((pd) => `${isoToDisplay(pd.start)} ~ ${isoToDisplay(pd.end)}`).join("\n");
        row["참여기간일수"] = part ? partDays : "";
        row["전문분야"] = part?.specialty ?? "";
        row["직위"] = part?.position ?? "";
        row["책임정도"] = part?.responsibility ?? "";
      }
      row["비고"] = r.notes ?? "";
      return row;
    });
    const filename = tech ? `PQ개인별실적 - ${tech}` : "PQ개인별실적";
    exportToExcel(data, filename);
  }

  async function exportMergedPdf(includeParticipants: boolean) {
    const targets = getTargets();
    if (targets.length === 0) { toast.error("내보낼 데이터가 없습니다"); return; }
    setExportingPdf(true);
    try {
      const merged = await PDFDocument.create();
      const seqFont = addSeqNumbers ? await merged.embedFont(StandardFonts.HelveticaBold) : null;
      let added = 0;
      let pdfSeq = 0;
      for (const r of targets) {
        pdfSeq++;
        const paths: { path: string; bucket: "performance-certs" | "participant-lists" }[] = [];
        if (r.cert_pdf_path) paths.push({ path: r.cert_pdf_path, bucket: "performance-certs" });
        if (includeParticipants && r.participant_file_path) paths.push({ path: r.participant_file_path, bucket: "participant-lists" });
        let stamped = false;
        const tech = selectedTech.trim();
        for (const { path, bucket } of paths) {
          const { data: blob, error } = await supabase.storage.from(bucket).download(path);
          if (error || !blob) continue;
          if (!path.toLowerCase().endsWith(".pdf")) continue;
          const bytes = await blob.arrayBuffer();
          const isParticipantList = bucket === "participant-lists";
          let nameMarks: { pageIndex: number; x: number; y: number; height: number }[] = [];
          if (isParticipantList && tech) {
            try {
              const loadingTask = (pdfjsLib as any).getDocument({ data: bytes.slice(0) });
              const pdfDoc = await loadingTask.promise;
              for (let pi = 1; pi <= pdfDoc.numPages; pi++) {
                const page = await pdfDoc.getPage(pi);
                const tc = await page.getTextContent();
                for (const it of tc.items as any[]) {
                  const s = String(it.str ?? "");
                  if (s && s.includes(tech)) {
                    const tr = it.transform as number[];
                    nameMarks.push({ pageIndex: pi - 1, x: tr[4], y: tr[5], height: it.height || Math.abs(tr[3]) || 10 });
                  }
                }
              }
            } catch {}
          }
          try {
            const src = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((pg, idx) => {
              merged.addPage(pg);
              if (addSeqNumbers && seqFont && !stamped && idx === 0) {
                const { height } = pg.getSize();
                pg.drawText(String(pdfSeq), { x: 30, y: height - 50, size: 40, font: seqFont, color: rgb(0, 0, 0) });
                stamped = true;
              }
              if (isParticipantList && tech) {
                const marks = nameMarks.filter((m) => m.pageIndex === idx);
                for (const m of marks) {
                  const size = Math.max(10, m.height);
                  const cx = m.x - size * 1.6;
                  const cy = m.y + size;
                  const s = size / 12;
                  pg.drawSvgPath(`M 0 6 L 4 0 L 12 10`, { x: cx, y: cy, scale: s, borderColor: rgb(0.85, 0.1, 0.1), borderWidth: 2 });
                }
              }
            });
            added++;
          } catch {}
        }
      }
      if (added === 0) { toast.message("등록된 PDF가 없어 병합 파일을 만들지 않았습니다"); return; }
      const out = await merged.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeParticipants ? "실적증명서_참여자명단_병합.pdf" : "실적증명서_병합.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`PDF 병합 완료 (${added}개)`);
    } catch (e: any) { toast.error("PDF 병합 오류: " + (e?.message ?? "")); }
    finally { setExportingPdf(false); }
  }

  // 데이터베이스에 등록된 참여자 기준 기술자 목록
  const allTechnicians = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.participants?.forEach((p) => p.name && s.add(p.name)));
    return Array.from(s).sort();
  }, [rows]);

  const techRows = useMemo(() => {
    if (!selectedTech) return [];
    const refDateStr = noticeDate || new Date().toISOString().slice(0, 10);
    const refTime = new Date(refDateStr).getTime();

    const base = rows
      .map((r) => {
        const part = r.participants?.find((p) => p.name === selectedTech);
        if (!part) return null;
        const evalSet = new Set(r.evaluation_types);
        let evalW = 0.6;
        if (evalSet.has("평가")) evalW = 1.0;
        else if (techEvalFilter.length > 0 && techEvalFilter.some((t) => evalSet.has(t))) evalW = 1.0;

        let svcW = 0.6;
        if (techServiceFilter.length > 0 && techServiceFilter.some((t) => r.service_types.includes(t))) svcW = 1.0;

        const simple = evalW * svcW;
        const cps = getContractPeriods(r);
        const total = cps.reduce((s, cp) => s + (cp.start && cp.end ? daysBetween(cp.start, cp.end) : 0), 0);
        const periods = getPeriods(part);
        const partDays = periods.reduce((s, pd) => s + (pd.start && pd.end ? daysBetween(pd.start, pd.end) : 0), 0);
        const ovSum = cps.reduce((s, cp) =>
          s + periods.reduce((ss, pd) => ss + (cp.start && cp.end && pd.start && pd.end ? overlapDays(cp.start, cp.end, pd.start, pd.end) : 0), 0), 0);
        const validPeriods = periods.filter((p) => p.start && p.end).sort((a, b) => a.start!.localeCompare(b.start!));
        const validCps = cps.filter((c) => c.start && c.end).sort((a, b) => a.start!.localeCompare(b.start!));
        const fullCover =
          validPeriods.length > 0 && validCps.length > 0 &&
          validPeriods[0].start === validCps[0].start &&
          validPeriods[validPeriods.length - 1].end === validCps[validCps.length - 1].end;
        const ratio = fullCover ? 1 : total > 0 ? Math.min(1, ovSum / total) : 0;
        const periodCount = ratio * evalW * svcW;

        // 10년 경과 판정: 준공일(completion_date) 우선, 없으면 마지막 계약 종료일
        const completion = (r as any).completion_date as string | null;
        const lastEnd = completion || (validCps.length > 0 ? validCps[validCps.length - 1].end : null);
        let expired = false;
        if (lastEnd && !isNaN(refTime)) {
          const endTime = new Date(lastEnd).getTime();
          const tenYearsMs = 10 * 365.25 * 86400000;
          expired = refTime - endTime > tenYearsMs;
        }

        const isPostEval = evalSet.has("사후");
        const phaseMatch = (r.project_name || "").match(/\(\s*(\d+)\s*차\s*\)\s*$/);
        const phaseNum = isPostEval && phaseMatch ? Number(phaseMatch[1]) : null;
        const baseName = phaseMatch ? r.project_name.replace(/\s*\(\s*\d+\s*차\s*\)\s*$/, "").trim() : r.project_name;
        const under90 = partDays > 0 && partDays < 90;

        return { row: r, part, evalW, svcW, simple, ratio, periodCount, expired, partDays, under90, isPostEval, phaseNum, baseName };
      })
      .filter(Boolean) as Array<{ row: Row; part: Participant; evalW: number; svcW: number; simple: number; ratio: number; periodCount: number; expired: boolean; partDays: number; under90: boolean; isPostEval: boolean; phaseNum: number | null; baseName: string }>;

    const lastPhaseByBase = new Map<string, number>();
    base.forEach((t) => {
      if (t.isPostEval && t.phaseNum != null) {
        const cur = lastPhaseByBase.get(t.baseName) ?? -1;
        if (t.phaseNum > cur) lastPhaseByBase.set(t.baseName, t.phaseNum);
      }
    });
    return base.map((t) => {
      const isPhase = t.isPostEval && t.phaseNum != null;
      const isLastPhase = isPhase && lastPhaseByBase.get(t.baseName) === t.phaseNum;
      return { ...t, isPhase, isLastPhase };
    });
  }, [rows, selectedTech, techEvalFilter, techServiceFilter, noticeDate]);

  const isDefaultSelected = (t: typeof techRows[number]) => {
    if (t.expired) return false;
    if (!includeUnder90 && t.under90) return false;
    if (excludePrivate && (t.row as any).is_private) return false;
    if (t.isPhase) {
      if (excludeLhPhases) return false;
      if (!t.isLastPhase) return false;
    }
    return true;
  };

  useEffect(() => {
    if (techSelectionTouched) {
      setTechSelectedRowIds((prev) => {
        const next = new Set(prev);
        techRows.forEach((t) => {
          if (t.expired) next.delete(t.row.id);
          if (!includeUnder90 && t.under90) next.delete(t.row.id);
          if (excludePrivate && (t.row as any).is_private) next.delete(t.row.id);
          if (t.isPhase && (excludeLhPhases || !t.isLastPhase)) next.delete(t.row.id);
        });
        return next;
      });
      return;
    }
    setTechSelectedRowIds(new Set(techRows.filter(isDefaultSelected).map((t) => t.row.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techRows, techSelectionTouched, includeUnder90, excludeLhPhases, excludePrivate]);

  const techTotals = useMemo(() => {
    const active = techRows.filter((t) => !t.expired && techSelectedRowIds.has(t.row.id));
    const simple = active.reduce((a, b) => a + b.simple, 0);
    const period = active.reduce((a, b) => a + b.periodCount, 0);
    return { simple, period };
  }, [techRows, techSelectedRowIds]);

  const techAllSelectableIds = useMemo(
    () => techRows.filter(isDefaultSelected).map((t) => t.row.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [techRows, includeUnder90, excludeLhPhases, excludePrivate]
  );
  const techAllChecked = techAllSelectableIds.length > 0 && techAllSelectableIds.every((id) => techSelectedRowIds.has(id));


  function toggleTechRow(id: string, checked: boolean) {
    setTechSelectionTouched(true);
    setTechSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleTechAll(checked: boolean) {
    setTechSelectionTouched(true);
    setTechSelectedRowIds(checked ? new Set(techAllSelectableIds) : new Set());
  }

  function addTechServiceFilter() {
    const v = techServiceFilterInput.trim();
    if (!v || techServiceFilter.includes(v)) { setTechServiceFilterInput(""); return; }
    setTechServiceFilter([...techServiceFilter, v]);
    setTechServiceFilterInput("");
  }

  return (
    <AppLayout title="PQ 개인별 실적관리">
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground">
          ※ 실적 데이터는 <strong>실적 데이터베이스 관리</strong>에서 등록한 참여자 명단을 기준으로 자동 표시됩니다.
        </div>

        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div>
                <Label>기술자 선택</Label>
                <Select value={selectedTech} onValueChange={(v) => { setSelectedTech(v); setTechSelectionTouched(false); }}>
                  <SelectTrigger><SelectValue placeholder="기술자명을 선택" /></SelectTrigger>
                  <SelectContent>
                    {allTechnicians.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">등록된 기술자가 없습니다</div>
                    ) : allTechnicians.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>공고일 (10년 경과 판정 기준)</Label>
                <DateInput value={noticeDate} onChange={(iso) => { setNoticeDate(iso); setTechSelectionTouched(false); }} />
              </div>
            </div>
            <div>
              <Label>평가종류 필터 (복수)</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {EVAL_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={techEvalFilter.includes(opt)} onCheckedChange={(c) => setTechEvalFilter((p) => c ? [...p, opt] : p.filter((x) => x !== opt))} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>사업종류 필터 (복수)</Label>
              <div className="flex gap-1 mt-2">
                <Input value={techServiceFilterInput} onChange={(e) => setTechServiceFilterInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTechServiceFilter(); } }}
                  placeholder="입력 후 Enter" />
                <Button type="button" size="sm" onClick={addTechServiceFilter}>추가</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {techServiceFilter.map((t) => (
                  <Badge key={t} variant="outline" className="gap-1">
                    {t}
                    <button onClick={() => setTechServiceFilter(techServiceFilter.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={includeUnder90} onCheckedChange={(c) => { setIncludeUnder90(!!c); setTechSelectionTouched(false); }} />
              참여일수 90일 미만 포함
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={excludeLhPhases} onCheckedChange={(c) => { setExcludeLhPhases(!!c); setTechSelectionTouched(false); }} />
              LH사업의 경우 차수분 제외
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={excludePrivate} onCheckedChange={(c) => { setExcludePrivate(!!c); setTechSelectionTouched(false); }} />
              민간사업 제외
            </label>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">선택 항목 내보내기</span>
          <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background cursor-pointer">
            <Checkbox checked={addSeqNumbers} onCheckedChange={(v) => setAddSeqNumbers(!!v)} />
            <span className="text-xs">연번 기입 (착수일 오름차순)</span>
          </label>
          <Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-1" /> 엑셀</Button>
          <Button variant="outline" disabled={exportingPdf} onClick={() => exportMergedPdf(false)}>
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            실적증명서 PDF
          </Button>
          <Button variant="outline" disabled={exportingPdf} onClick={() => exportMergedPdf(true)}>
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            실적+참여자명단 PDF
          </Button>
        </div>

        {loading ? (
          <Card className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></Card>
        ) : !selectedTech ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">기술자를 선택하세요</Card>
        ) : (
          <>
            <Card className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={techAllChecked} disabled={techAllSelectableIds.length === 0} onCheckedChange={(c) => toggleTechAll(!!c)} />
                    </TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>평가종류</TableHead>
                    <TableHead>사업종류</TableHead>
                    <TableHead>계약기간</TableHead>
                    <TableHead>참여기간</TableHead>
                    <TableHead className="text-right">평가건수</TableHead>
                    <TableHead className="text-right">사업건수</TableHead>
                    <TableHead className="text-right">단순건수</TableHead>
                    <TableHead className="text-right">기간비율</TableHead>
                    <TableHead className="text-right">기간대비건수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {techRows.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">참여 사업이 없습니다</TableCell></TableRow>
                  ) : techRows.map((t, i) => (
                    <TableRow key={i} className={t.expired ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox checked={!t.expired && techSelectedRowIds.has(t.row.id)} disabled={t.expired} onCheckedChange={(c) => toggleTechRow(t.row.id, !!c)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.row.project_name}
                        {t.expired && <div className="text-xs text-destructive mt-1">⚠ 공고일 기준 10년 경과 - 집계 제외</div>}
                        {!t.expired && t.under90 && !includeUnder90 && <div className="text-xs text-destructive mt-1">⚠ 참여일수 90일 미만 ({t.partDays}일) - 기본 집계 제외</div>}
                        {!t.expired && t.isPhase && !t.isLastPhase && <div className="text-xs text-destructive mt-1">⚠ 사후 차수({t.phaseNum}차) - 마지막 차수만 인정되어 집계 제외</div>}
                        {!t.expired && t.isPhase && t.isLastPhase && excludeLhPhases && <div className="text-xs text-destructive mt-1">⚠ LH 차수분 제외 옵션 - 집계 제외</div>}
                        {!t.expired && excludePrivate && (t.row as any).is_private && <div className="text-xs text-destructive mt-1">⚠ 민간사업 - 집계 제외</div>}
                      </TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{t.row.evaluation_types.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}</div></TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{t.row.service_types.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}</div></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {getContractPeriods(t.row).map((pd, pi) => (<div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>))}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {getPeriods(t.part).map((pd, pi) => (<div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>))}
                      </TableCell>
                      <TableCell className="text-right">{t.evalW.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{t.svcW.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{t.simple.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{(t.ratio * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{t.periodCount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {techRows.length > 0 && (
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell colSpan={8} className="text-right">합계 (선택 항목)</TableCell>
                      <TableCell className="text-right">{techTotals.simple.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{techTotals.period.toFixed(2)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            <div className="md:hidden space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
                <Checkbox checked={techAllChecked} disabled={techAllSelectableIds.length === 0} onCheckedChange={(c) => toggleTechAll(!!c)} />
                <span className="text-xs font-medium">전체 선택</span>
              </div>
              {techRows.length === 0 ? (
                <Card className="p-4 text-center text-sm text-muted-foreground">참여 사업이 없습니다</Card>
              ) : techRows.map((t) => {
                const expanded = expandedTechRows.has(t.row.id);
                return (
                  <Card key={t.row.id} className={`p-3 ${t.expired ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2">
                      <Checkbox className="mt-1" checked={!t.expired && techSelectedRowIds.has(t.row.id)} disabled={t.expired} onCheckedChange={(c) => toggleTechRow(t.row.id, !!c)} />
                      <button type="button" onClick={() => toggleExpandedTechRow(t.row.id)} className="flex-1 text-left">
                        <div className="font-medium text-sm break-words">{t.row.project_name}</div>
                      </button>
                      <button type="button" onClick={() => toggleExpandedTechRow(t.row.id)} className="text-xs px-2 py-1 rounded border bg-background shrink-0">
                        {expanded ? "접기" : "펼치기"}
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-3 space-y-2 text-xs border-t pt-2">
                        <div className="flex flex-wrap gap-1">{t.row.evaluation_types.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}</div>
                        <div className="flex flex-wrap gap-1">{t.row.service_types.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}</div>
                        <div>계약기간: {getContractPeriods(t.row).map((pd, pi) => (<div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>))}</div>
                        <div>참여기간: {getPeriods(t.part).map((pd, pi) => (<div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>))}</div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>평가 {t.evalW.toFixed(2)}</div>
                          <div>사업 {t.svcW.toFixed(2)}</div>
                          <div>단순 {t.simple.toFixed(2)}</div>
                          <div>비율 {(t.ratio * 100).toFixed(1)}%</div>
                          <div className="col-span-2">기간대비 {t.periodCount.toFixed(2)}</div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
              {techRows.length > 0 && (
                <Card className="p-3 bg-muted/40 font-semibold text-sm flex justify-between">
                  <span>합계 (선택)</span>
                  <span>단순 {techTotals.simple.toFixed(2)} / 기간대비 {techTotals.period.toFixed(2)}</span>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
