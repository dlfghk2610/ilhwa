import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Loader2, X, Upload, Sparkles, FileText } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";
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

// 생년월일/날짜 입력 → YYYY.MM.DD (4자리 입력 시 자동으로 . 삽입되어 월 칸으로 이동)
const formatBirth = (v: string) => {
  const d = (v || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
};

// ISO(YYYY-MM-DD) ↔ display(YYYY.MM.DD)
const isoToDisplay = (v?: string | null) => (v ? v.replace(/-/g, ".") : "");
const displayToIso = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};

// 텍스트 입력 기반 날짜 컴포넌트 (4자리 입력 시 . 자동 삽입 → 월 칸으로 이동 효과)
function DateInput({
  value,
  onChange,
  className,
  placeholder = "YYYY.MM.DD",
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState<string>(isoToDisplay(value));
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);
  return (
    <Input
      className={className}
      value={text}
      placeholder={placeholder}
      maxLength={10}
      inputMode="numeric"
      onChange={(e) => {
        const formatted = formatBirth(e.target.value);
        setText(formatted);
        onChange(displayToIso(formatted));
      }}
    />
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

// 계약기간 배열 (비어있으면 단일 contract_start/end_date로 폴백)
const getContractPeriods = (r: { contract_periods?: Period[]; contract_start_date?: string | null; contract_end_date?: string | null }): Period[] => {
  if (Array.isArray(r.contract_periods) && r.contract_periods.length > 0) return r.contract_periods;
  if (r.contract_start_date || r.contract_end_date) return [{ start: r.contract_start_date || undefined, end: r.contract_end_date || undefined }];
  return [];
};

const emptyForm = {
  project_name: "",
  service_overview: "",
  client: "",
  contract_periods: [{ start: "", end: "" }] as Period[],
  contract_amount: "",
  share_rate: "",
  share_amount: "",
  evaluation_types: [] as string[],
  service_types: [] as string[],
  service_type_input: "",
  company_share_rate: "",
  notes: "",
  participants: [] as Participant[],
  participant_file: null as File | null,
  participant_file_path: "",
  cert_pdf_file: null as File | null,
  cert_pdf_path: "",
  is_private: false,
};

type FormState = typeof emptyForm;

const fmt = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "" : Number(n).toLocaleString();

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
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [shareAmountTouched, setShareAmountTouched] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [addSeqNumbers, setAddSeqNumbers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  // 기술자별 분석 상태
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
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [expandedListRows, setExpandedListRows] = useState<Set<string>>(new Set());
  const toggleExpandedListRow = (id: string) => setExpandedListRows((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => { fetchRows(); }, []);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("personal_performances")
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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShareAmountTouched(false);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      project_name: r.project_name || "",
      service_overview: r.service_overview || "",
      client: r.client || "",
      contract_periods: getContractPeriods(r).length > 0 ? getContractPeriods(r) : [{ start: "", end: "" }],
      contract_amount: r.contract_amount?.toString() ?? "",
      share_rate: r.share_rate?.toString() ?? "",
      share_amount: r.share_amount?.toString() ?? "",
      evaluation_types: r.evaluation_types,
      service_types: r.service_types,
      service_type_input: "",
      company_share_rate: r.company_share_rate || "",
      notes: r.notes || "",
      participants: r.participants,
      participant_file: null,
      participant_file_path: r.participant_file_path || "",
      cert_pdf_file: null,
      cert_pdf_path: r.cert_pdf_path || "",
      is_private: (r as any).is_private ?? false,
    });
    setShareAmountTouched(true);
    setOpen(true);
  }

  // 지분금액 자동계산
  useEffect(() => {
    if (shareAmountTouched) return;
    const amt = Number(form.contract_amount);
    const rate = Number(form.share_rate);
    if (!isNaN(amt) && !isNaN(rate) && form.contract_amount && form.share_rate) {
      setForm((f) => ({ ...f, share_amount: Math.round(amt * rate / 100).toString() }));
    }
  }, [form.contract_amount, form.share_rate, shareAmountTouched]);

  async function handleExtractParticipants() {
    if (!form.participant_file) {
      toast.error("먼저 파일을 선택하세요");
      return;
    }
    setExtracting(true);
    try {
      const file = form.participant_file;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("parse-participant-list", {
        body: { fileBase64, mimeType: file.type || "application/pdf" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const participants: Participant[] = data?.participants ?? [];
      setForm((f) => ({ ...f, participants }));
      toast.success(`${participants.length}명 추출 완료`);
    } catch (e: any) {
      toast.error(e.message || "추출 실패");
    } finally {
      setExtracting(false);
    }
  }

  async function downloadFromBucket(bucket: "performance-certs" | "participant-lists", path: string, filename?: string) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || path.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "다운로드 실패");
    }
  }

  async function handleSubmit() {
    if (!user) return;
    if (!form.project_name.trim()) { toast.error("사업명을 입력하세요"); return; }
    setSubmitting(true);
    try {
      let participant_file_path = form.participant_file_path;
      if (form.participant_file) {
        const ext = form.participant_file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("participant-lists")
          .upload(path, form.participant_file, { upsert: false });
        if (upErr) throw upErr;
        participant_file_path = path;
      }

      let cert_pdf_path = form.cert_pdf_path;
      if (form.cert_pdf_file) {
        const path = `${user.id}/${Date.now()}_cert.pdf`;
        const { error: upErr } = await supabase.storage
          .from("performance-certs")
          .upload(path, form.cert_pdf_file, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        cert_pdf_path = path;
      }

      const cleanedPeriods = form.contract_periods.filter((p) => p.start || p.end);
      const earliestStart = cleanedPeriods.map((p) => p.start).filter(Boolean).sort()[0] || null;
      const latestEnd = cleanedPeriods.map((p) => p.end).filter(Boolean).sort().slice(-1)[0] || null;

      const payload = {
        project_name: form.project_name.trim(),
        service_overview: form.service_overview || null,
        client: form.client || null,
        contract_periods: cleanedPeriods as any,
        contract_start_date: earliestStart,
        contract_end_date: latestEnd,
        contract_amount: form.contract_amount ? Number(form.contract_amount) : null,
        share_rate: form.share_rate ? Number(form.share_rate) : null,
        share_amount: form.share_amount ? Number(form.share_amount) : null,
        evaluation_types: form.evaluation_types,
        service_types: form.service_types,
        company_share_rate: form.company_share_rate || null,
        notes: form.notes || null,
        participants: form.participants as any,
        participant_file_path,
        cert_pdf_path,
        is_private: form.is_private,
        // legacy required fields
        technician_name: form.participants[0]?.name || form.project_name,
        start_date: earliestStart,
        end_date: latestEnd,
      };

      if (editing) {
        const { error } = await supabase.from("personal_performances").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료");
      } else {
        const { error } = await supabase.from("personal_performances").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료");
      }
      setOpen(false);
      fetchRows();
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("personal_performances").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); fetchRows(); }
    setDeleteId(null);
  }

  // 검색
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.project_name, r.client, ...(r.participants?.map((p) => p.name) ?? [])]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [rows, search]);

  // 선택된 행 (없으면 전체 filtered) - 착수일 오름차순 정렬
  function getTargets(): Row[] {
    const base = selectedIds.size > 0 ? filtered.filter((r) => selectedIds.has(r.id)) : filtered;
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
        "계약기간일수": contractDays || "",
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
        if (includeParticipants && r.participant_file_path) {
          paths.push({ path: r.participant_file_path, bucket: "participant-lists" });
        }
        let stamped = false;
        const tech = selectedTech.trim();
        for (const { path, bucket } of paths) {
          const { data: blob, error } = await supabase.storage.from(bucket).download(path);
          if (error || !blob) continue;
          // 참여자명단이 PDF가 아닐 수도 있음 (DOCX) → PDF만 병합
          if (!path.toLowerCase().endsWith(".pdf")) continue;
          const bytes = await blob.arrayBuffer();
          const isParticipantList = bucket === "participant-lists";
          // 참여자명단이고 선택된 기술자가 있으면 이름 좌표 추출
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
                    const x = tr[4];
                    const y = tr[5];
                    const h = it.height || Math.abs(tr[3]) || 10;
                    nameMarks.push({ pageIndex: pi - 1, x, y, height: h });
                  }
                }
              }
            } catch { /* pdfjs 로드 실패 시 체크 표시 생략 */ }
          }
          try {
            const src = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((pg, idx) => {
              merged.addPage(pg);
              if (addSeqNumbers && seqFont && !stamped && idx === 0) {
                const { height } = pg.getSize();
                pg.drawText(String(pdfSeq), {
                  x: 30,
                  y: height - 50,
                  size: 40,
                  font: seqFont,
                  color: rgb(0, 0, 0),
                });
                stamped = true;
              }
              if (isParticipantList && tech) {
                const marks = nameMarks.filter((m) => m.pageIndex === idx);
                for (const m of marks) {
                  const size = Math.max(10, m.height);
                  // 이름 왼쪽에 ✔ 표시 (벡터 패스, SVG 좌표는 위→아래)
                  const cx = m.x - size * 1.6;
                  const cy = m.y + size; // 텍스트 상단 정렬
                  const s = size / 12;
                  pg.drawSvgPath(`M 0 6 L 4 0 L 12 10`, {
                    x: cx,
                    y: cy,
                    scale: s,
                    borderColor: rgb(0.85, 0.1, 0.1),
                    borderWidth: 2,
                  });
                }
              }
            });
            added++;
          } catch { /* 손상 PDF 건너뜀 */ }
        }
      }
      if (added === 0) { toast.message("등록된 PDF가 없어 병합 파일을 만들지 않았습니다"); return; }
      const out = await merged.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeParticipants ? "실적증명서_참여자명단_병합.pdf" : "실적증명서_병합.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`PDF 병합 완료 (${added}개)`);
    } catch (e: any) {
      toast.error("PDF 병합 오류: " + (e?.message ?? ""));
    } finally {
      setExportingPdf(false);
    }
  }


  // 사업종류 chip 추가
  function addServiceType() {
    const v = form.service_type_input.trim();
    if (!v) return;
    if (form.service_types.includes(v)) { setForm({ ...form, service_type_input: "" }); return; }
    setForm({ ...form, service_types: [...form.service_types, v], service_type_input: "" });
  }

  // 참여자 편집
  function updateParticipant(idx: number, key: keyof Participant, val: string) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => (i === idx ? { ...p, [key]: val } : p)),
    }));
  }
  function removeParticipant(idx: number) {
    setForm((f) => ({ ...f, participants: f.participants.filter((_, i) => i !== idx) }));
  }
  function addParticipant() {
    setForm((f) => ({ ...f, participants: [...f.participants, { name: "", periods: [{ start: "", end: "" }] }] }));
  }

  // 참여자명단 엑셀 내보내기 (현재 입력된 참여자 + 양식 헤더)
  function handleParticipantsExcelExport() {
    const data = (form.participants.length > 0 ? form.participants : [{ name: "", birth_date: "", periods: [] } as Participant]).map((p) => {
      const periods = getPeriods(p);
      const row: Record<string, any> = {
        성명: p.name || "",
        생년월일: p.birth_date || "",
      };
      for (let i = 0; i < 3; i++) {
        row[`참여시작${i + 1}`] = isoToDisplay(periods[i]?.start);
        row[`참여종료${i + 1}`] = isoToDisplay(periods[i]?.end);
      }
      row.전문분야 = p.specialty || "";
      row.직위 = p.position || "";
      row.책임정도 = p.responsibility || "";
      return row;
    });
    exportToExcel(data, `${form.project_name || "참여자명단"}-참여자명단`);
    toast.success("엑셀 양식 다운로드 완료");
  }

  async function handleParticipantsExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importFromExcel<Record<string, any>>(file);
      const parsed: Participant[] = data
        .map((r) => {
          const name = String(r["성명"] ?? r["이름"] ?? "").trim();
          if (!name) return null;
          const periods: Period[] = [];
          for (let i = 1; i <= 6; i++) {
            const s = r[`참여시작${i}`];
            const en = r[`참여종료${i}`];
            if (s == null && en == null) continue;
            const toIso = (v: any) => {
              if (v == null || v === "") return "";
              if (typeof v === "number") {
                const d = new Date(Math.round((v - 25569) * 86400 * 1000));
                return d.toISOString().slice(0, 10);
              }
              const str = String(v).trim();
              const digits = str.replace(/\D/g, "").slice(0, 8);
              if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
              return str.slice(0, 10);
            };
            const start = toIso(s);
            const end = toIso(en);
            if (start || end) periods.push({ start, end });
          }
          const birthRaw = r["생년월일"];
          let birth = "";
          if (birthRaw != null && birthRaw !== "") {
            if (typeof birthRaw === "number") {
              const d = new Date(Math.round((birthRaw - 25569) * 86400 * 1000));
              birth = d.toISOString().slice(0, 10).replace(/-/g, ".");
            } else {
              birth = formatBirth(String(birthRaw));
            }
          }
          return {
            name,
            birth_date: birth,
            periods: periods.length > 0 ? periods : [{ start: "", end: "" }],
            specialty: String(r["전문분야"] ?? "").trim() || undefined,
            position: String(r["직위"] ?? "").trim() || undefined,
            responsibility: String(r["책임정도"] ?? "").trim() || undefined,
          } as Participant;
        })
        .filter((p): p is Participant => !!p);
      if (parsed.length === 0) {
        toast.error("가져올 참여자 데이터가 없습니다");
        return;
      }
      setForm((f) => ({ ...f, participants: parsed }));
      toast.success(`${parsed.length}명 가져오기 완료`);
    } catch (err: any) {
      toast.error("엑셀 처리 오류: " + (err?.message ?? ""));
    } finally {
      e.target.value = "";
    }
  }
  const clampDate = (v: string) => {
    if (!v) return "";
    const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
    if (!m) return v;
    return `${m[1].slice(-4).padStart(4, "0")}-${m[2]}-${m[3]}`;
  };
  function updatePeriods(idx: number, fn: (periods: Period[]) => Period[]) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => {
        if (i !== idx) return p;
        const cur = getPeriods(p);
        const next = fn(cur);
        const { period_start, period_end, ...rest } = p;
        return { ...rest, periods: next };
      }),
    }));
  }

  // ===== 기술자별 분석 =====
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
        const validPeriods = periods.filter((p) => p.start && p.end).sort((a, b) => a.start.localeCompare(b.start));
        const validCps = cps.filter((c) => c.start && c.end).sort((a, b) => a.start.localeCompare(b.start));
        const fullCover =
          validPeriods.length > 0 &&
          validCps.length > 0 &&
          validPeriods[0].start === validCps[0].start &&
          validPeriods[validPeriods.length - 1].end === validCps[validCps.length - 1].end;
        const ratio = fullCover ? 1 : total > 0 ? Math.min(1, ovSum / total) : 0;
        const periodCount = ratio * evalW * svcW;

        const lastEnd = validCps.length > 0 ? validCps[validCps.length - 1].end : null;
        let expired = false;
        if (lastEnd && !isNaN(refTime)) {
          const endTime = new Date(lastEnd).getTime();
          const tenYearsMs = 10 * 365.25 * 86400000;
          expired = refTime - endTime > tenYearsMs;
        }

        // 사후 + (N차) 차수 인식
        const isPostEval = evalSet.has("사후");
        const phaseMatch = (r.project_name || "").match(/\(\s*(\d+)\s*차\s*\)\s*$/);
        const phaseNum = isPostEval && phaseMatch ? Number(phaseMatch[1]) : null;
        const baseName = phaseMatch
          ? r.project_name.replace(/\s*\(\s*\d+\s*차\s*\)\s*$/, "").trim()
          : r.project_name;
        const under90 = partDays > 0 && partDays < 90;

        return { row: r, part, evalW, svcW, simple, ratio, periodCount, expired, partDays, under90, isPostEval, phaseNum, baseName };
      })
      .filter(Boolean) as Array<{ row: Row; part: Participant; evalW: number; svcW: number; simple: number; ratio: number; periodCount: number; expired: boolean; partDays: number; under90: boolean; isPostEval: boolean; phaseNum: number | null; baseName: string }>;

    // 같은 사후 baseName 그룹 중 최대 차수 = 마지막 차
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

  // 기본 선택 = 미경과 + 90일 미만 제외(옵션) + 사후차수는 마지막 차만(LH차수제외 옵션 시 모두 제외)
  const isDefaultSelected = (t: typeof techRows[number]) => {
    if (t.expired) return false;
    if (!includeUnder90 && t.under90) return false;
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
          if (t.isPhase && (excludeLhPhases || !t.isLastPhase)) next.delete(t.row.id);
        });
        return next;
      });
      return;
    }
    setTechSelectedRowIds(new Set(techRows.filter(isDefaultSelected).map((t) => t.row.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techRows, techSelectionTouched, includeUnder90, excludeLhPhases]);

  const techTotals = useMemo(() => {
    const active = techRows.filter((t) => !t.expired && techSelectedRowIds.has(t.row.id));
    const simple = active.reduce((a, b) => a + b.simple, 0);
    const period = active.reduce((a, b) => a + b.periodCount, 0);
    return { simple, period };
  }, [techRows, techSelectedRowIds]);

  const techAllSelectableIds = useMemo(
    () => techRows.filter(isDefaultSelected).map((t) => t.row.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [techRows, includeUnder90, excludeLhPhases]
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
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">사업 목록</TabsTrigger>
          <TabsTrigger value="tech">기술자별 분석</TabsTrigger>
        </TabsList>

        {/* ====== 사업 목록 탭 ====== */}
        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="사업명/발주처/기술자명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="ml-auto">
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> 사업 등록
              </Button>
            </div>
          </div>

          <Card className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사업명</TableHead>
                  <TableHead>발주처</TableHead>
                  <TableHead>계약기간</TableHead>
                  <TableHead className="text-right">계약금액</TableHead>
                  <TableHead className="text-right">지분율</TableHead>
                  <TableHead className="text-right">지분금액</TableHead>
                  <TableHead>평가종류</TableHead>
                  <TableHead>사업종류</TableHead>
                  <TableHead className="text-right">참여자</TableHead>
                  <TableHead>첨부</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">데이터 없음</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.project_name}</TableCell>
                    <TableCell>{r.client}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {getContractPeriods(r).map((pd, pi) => (
                        <div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.contract_amount)}</TableCell>
                    <TableCell className="text-right">{r.share_rate != null ? `${r.share_rate}%` : ""}</TableCell>
                    <TableCell className="text-right">{fmt(r.share_amount)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{r.participants.length}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        {r.cert_pdf_path && <Badge variant="secondary" className="w-fit">실적증명</Badge>}
                        {r.participant_file_path && <Badge variant="outline" className="w-fit">참여자명단</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {loading ? (
              <Card className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></Card>
            ) : filtered.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">데이터 없음</Card>
            ) : filtered.map((r) => {
              const expanded = expandedListRows.has(r.id);
              return (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm flex-1 break-words">{r.project_name}</div>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => toggleExpandedListRow(r.id)}>
                      {expanded ? "접기" : "펼치기"}
                    </Button>
                  </div>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                      <div><span className="text-muted-foreground">발주처: </span>{r.client}</div>
                      <div>
                        <span className="text-muted-foreground">계약기간: </span>
                        {getContractPeriods(r).map((pd, pi) => (
                          <div key={pi} className="ml-2">{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                        ))}
                      </div>
                      <div><span className="text-muted-foreground">계약금액: </span>{fmt(r.contract_amount)}</div>
                      <div><span className="text-muted-foreground">지분율: </span>{r.share_rate != null ? `${r.share_rate}%` : ""}</div>
                      <div><span className="text-muted-foreground">지분금액: </span>{fmt(r.share_amount)}</div>
                      <div className="flex items-start gap-1 flex-wrap">
                        <span className="text-muted-foreground">평가종류: </span>
                        {r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                      </div>
                      <div className="flex items-start gap-1 flex-wrap">
                        <span className="text-muted-foreground">사업종류: </span>
                        {r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                      </div>
                      <div><span className="text-muted-foreground">참여자: </span>{r.participants.length}</div>
                      {(r.cert_pdf_path || r.participant_file_path) && (
                        <div className="flex flex-wrap gap-1">
                          {r.cert_pdf_path && <Badge variant="secondary">실적증명</Badge>}
                          {r.participant_file_path && <Badge variant="outline">참여자명단</Badge>}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(r)}><Pencil className="h-3 w-3 mr-1" />수정</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 mr-1" />삭제</Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ====== 기술자별 분석 탭 ====== */}
        <TabsContent value="tech" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div>
                  <Label>기술자 선택</Label>
                  <Select value={selectedTech} onValueChange={setSelectedTech}>
                    <SelectTrigger><SelectValue placeholder="기술자명을 선택" /></SelectTrigger>
                    <SelectContent>
                      {allTechnicians.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
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
                      <Checkbox
                        checked={techEvalFilter.includes(opt)}
                        onCheckedChange={(c) =>
                          setTechEvalFilter((p) => c ? [...p, opt] : p.filter((x) => x !== opt))
                        }
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>사업종류 필터 (복수)</Label>
                <div className="flex gap-1 mt-2">
                  <Input
                    value={techServiceFilterInput}
                    onChange={(e) => setTechServiceFilterInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTechServiceFilter(); } }}
                    placeholder="입력 후 Enter"
                  />
                  <Button type="button" size="sm" onClick={addTechServiceFilter}>추가</Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {techServiceFilter.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1">
                      {t}
                      <button onClick={() => setTechServiceFilter(techServiceFilter.filter((x) => x !== t))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2 border-t">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={includeUnder90}
                  onCheckedChange={(c) => { setIncludeUnder90(!!c); setTechSelectionTouched(false); }}
                />
                참여일수 90일 미만 포함
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox
                  checked={excludeLhPhases}
                  onCheckedChange={(c) => { setExcludeLhPhases(!!c); setTechSelectionTouched(false); }}
                />
                LH사업의 경우 차수분 제외
              </label>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">전체 대상</span>
            <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={addSeqNumbers} onCheckedChange={(v) => setAddSeqNumbers(!!v)} />
              <span className="text-xs">연번 기입 (착수일 오름차순)</span>
            </label>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-1" /> 엑셀
            </Button>
            <Button variant="outline" disabled={exportingPdf} onClick={() => exportMergedPdf(false)}>
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
              실적증명서 PDF
            </Button>
            <Button variant="outline" disabled={exportingPdf} onClick={() => exportMergedPdf(true)}>
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
              실적+참여자명단 PDF
            </Button>
          </div>

          {selectedTech && (
            <>
            <Card className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={techAllChecked}
                        disabled={techAllSelectableIds.length === 0}
                        onCheckedChange={(c) => toggleTechAll(!!c)}
                      />
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
                        <Checkbox
                          checked={!t.expired && techSelectedRowIds.has(t.row.id)}
                          disabled={t.expired}
                          onCheckedChange={(c) => toggleTechRow(t.row.id, !!c)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.row.project_name}
                        {t.expired && (
                          <div className="text-xs text-destructive mt-1">⚠ 공고일 기준 10년 경과 - 집계 제외</div>
                        )}
                        {!t.expired && t.under90 && !includeUnder90 && (
                          <div className="text-xs text-destructive mt-1">⚠ 참여일수 90일 미만 ({t.partDays}일) - 기본 집계 제외</div>
                        )}
                        {!t.expired && t.isPhase && !t.isLastPhase && (
                          <div className="text-xs text-destructive mt-1">⚠ 사후 차수({t.phaseNum}차) - 마지막 차수만 인정되어 집계 제외</div>
                        )}
                        {!t.expired && t.isPhase && t.isLastPhase && excludeLhPhases && (
                          <div className="text-xs text-destructive mt-1">⚠ LH 차수분 제외 옵션 - 집계 제외</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.row.evaluation_types.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.row.service_types.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {getContractPeriods(t.row).map((pd, pi) => (
                          <div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {getPeriods(t.part).map((pd, pi) => (
                          <div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                        ))}
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

            {/* 모바일 카드 뷰 */}
            <div className="md:hidden space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
                <Checkbox
                  checked={techAllChecked}
                  disabled={techAllSelectableIds.length === 0}
                  onCheckedChange={(c) => toggleTechAll(!!c)}
                />
                <span className="text-xs font-medium">전체 선택</span>
              </div>
              {techRows.length === 0 ? (
                <Card className="p-4 text-center text-sm text-muted-foreground">참여 사업이 없습니다</Card>
              ) : techRows.map((t) => {
                const expanded = expandedTechRows.has(t.row.id);
                return (
                  <Card key={t.row.id} className={`p-3 ${t.expired ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        className="mt-1"
                        checked={!t.expired && techSelectedRowIds.has(t.row.id)}
                        disabled={t.expired}
                        onCheckedChange={(c) => toggleTechRow(t.row.id, !!c)}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpandedTechRow(t.row.id)}
                        className="flex-1 text-left"
                      >
                        <div className="font-medium text-sm break-words">{t.row.project_name}</div>
                        {t.expired && (
                          <div className="text-xs text-destructive mt-1">⚠ 공고일 기준 10년 경과 - 집계 제외</div>
                        )}
                        {!t.expired && t.under90 && !includeUnder90 && (
                          <div className="text-xs text-destructive mt-1">⚠ 참여일수 90일 미만 ({t.partDays}일) - 기본 집계 제외</div>
                        )}
                        {!t.expired && t.isPhase && !t.isLastPhase && (
                          <div className="text-xs text-destructive mt-1">⚠ 사후 차수({t.phaseNum}차) - 마지막 차수만 인정</div>
                        )}
                        {!t.expired && t.isPhase && t.isLastPhase && excludeLhPhases && (
                          <div className="text-xs text-destructive mt-1">⚠ LH 차수분 제외 옵션 - 집계 제외</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleExpandedTechRow(t.row.id)}
                        className="text-xs px-2 py-1 rounded border bg-background shrink-0"
                      >
                        {expanded ? "접기" : "펼치기"}
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-3 space-y-2 text-xs border-t pt-2">
                        <div>
                          <div className="text-muted-foreground mb-1">평가종류</div>
                          <div className="flex flex-wrap gap-1">
                            {t.row.evaluation_types.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">사업종류</div>
                          <div className="flex flex-wrap gap-1">
                            {t.row.service_types.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">계약기간</div>
                          {getContractPeriods(t.row).map((pd, pi) => (
                            <div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                          ))}
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">참여기간</div>
                          {getPeriods(t.part).map((pd, pi) => (
                            <div key={pi}>{isoToDisplay(pd.start)} ~ {isoToDisplay(pd.end)}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div><span className="text-muted-foreground">평가건수: </span>{t.evalW.toFixed(2)}</div>
                          <div><span className="text-muted-foreground">사업건수: </span>{t.svcW.toFixed(2)}</div>
                          <div><span className="text-muted-foreground">단순건수: </span>{t.simple.toFixed(2)}</div>
                          <div><span className="text-muted-foreground">기간비율: </span>{(t.ratio * 100).toFixed(1)}%</div>
                          <div className="col-span-2"><span className="text-muted-foreground">기간대비건수: </span>{t.periodCount.toFixed(2)}</div>
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
        </TabsContent>
      </Tabs>

      {/* ====== 등록/수정 다이얼로그 ====== */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "사업 수정" : "사업 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>사업명 *</Label>
                <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>사업개요</Label>
                <Textarea value={form.service_overview} onChange={(e) => setForm({ ...form, service_overview: e.target.value })} />
              </div>
              <div>
                <Label>발주처</Label>
                <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
              </div>
              <div>
                <Label>각사지분율</Label>
                <Input value={form.company_share_rate} onChange={(e) => setForm({ ...form, company_share_rate: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>계약기간 (여러 차수 추가 가능)</Label>
                <div className="space-y-1">
                  {form.contract_periods.map((pd, pi) => (
                    <div key={pi} className="flex items-center gap-1">
                      <DateInput
                        value={pd.start || ""}
                        onChange={(iso) => setForm((f) => ({
                          ...f,
                          contract_periods: f.contract_periods.map((x, i) => i === pi ? { ...x, start: iso } : x),
                        }))}
                      />
                      <span className="text-xs">~</span>
                      <DateInput
                        value={pd.end || ""}
                        onChange={(iso) => setForm((f) => ({
                          ...f,
                          contract_periods: f.contract_periods.map((x, i) => i === pi ? { ...x, end: iso } : x),
                        }))}
                      />
                      {form.contract_periods.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setForm((f) => ({ ...f, contract_periods: f.contract_periods.filter((_, i) => i !== pi) }))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setForm((f) => ({ ...f, contract_periods: [...f.contract_periods, { start: "", end: "" }] }))}>
                    <Plus className="h-3 w-3 mr-1" />계약기간 추가
                  </Button>
                </div>
              </div>
              <div>
                <Label>계약금액</Label>
                <Input
                  inputMode="decimal"
                  value={form.contract_amount === "" ? "" : Number(form.contract_amount).toLocaleString()}
                  onChange={(e) => setForm({ ...form, contract_amount: e.target.value.replace(/[^\d.-]/g, "") })}
                />
              </div>
              <div>
                <Label>지분율 (%)</Label>
                <Input type="number" value={form.share_rate} onChange={(e) => setForm({ ...form, share_rate: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>지분금액 (자동계산, 수기수정 가능)</Label>
                <Input
                  inputMode="decimal"
                  value={form.share_amount === "" ? "" : Number(form.share_amount).toLocaleString()}
                  onChange={(e) => { setShareAmountTouched(true); setForm({ ...form, share_amount: e.target.value.replace(/[^\d.-]/g, "") }); }}
                />
              </div>

              <div className="md:col-span-2">
                <Label>평가종류 (복수선택)</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {EVAL_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={form.evaluation_types.includes(opt)}
                        onCheckedChange={(c) =>
                          setForm((f) => ({
                            ...f,
                            evaluation_types: c ? [...f.evaluation_types, opt] : f.evaluation_types.filter((x) => x !== opt),
                          }))
                        }
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <Label>사업종류 (자유입력 + 복수)</Label>
                <div className="flex gap-1">
                  <Input
                    value={form.service_type_input}
                    onChange={(e) => setForm({ ...form, service_type_input: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addServiceType(); } }}
                    placeholder="입력 후 Enter 또는 추가"
                  />
                  <Button type="button" onClick={addServiceType}>추가</Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.service_types.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1">
                      {t}
                      <button type="button" onClick={() => setForm({ ...form, service_types: form.service_types.filter((x) => x !== t) })}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <Label>비고</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="md:col-span-2">
                <Label>실적증명서 PDF</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="max-w-md"
                    onChange={(e) => setForm({ ...form, cert_pdf_file: e.target.files?.[0] ?? null })}
                  />
                  {(form.cert_pdf_path || form.cert_pdf_file) && (
                    <Badge variant="secondary">
                      {form.cert_pdf_file?.name ?? "기존 파일 등록됨"}
                    </Badge>
                  )}
                  {form.cert_pdf_path && !form.cert_pdf_file && (
                    <Button type="button" size="sm" variant="outline" onClick={() => downloadFromBucket("performance-certs", form.cert_pdf_path, `${form.project_name || "cert"}.pdf`)}>
                      <Download className="h-4 w-4 mr-1" />다운로드
                    </Button>
                  )}
                  {(form.cert_pdf_path || form.cert_pdf_file) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, cert_pdf_file: null, cert_pdf_path: "" })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 참여자명단 */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">참여자명단</h3>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input
                    type="file"
                    accept=".pdf,.docx,.doc,application/pdf"
                    className="max-w-xs"
                    onChange={(e) => setForm({ ...form, participant_file: e.target.files?.[0] ?? null })}
                  />
                  {form.participant_file_path && !form.participant_file && (
                    <>
                      <Badge variant="secondary">기존 파일 등록됨</Badge>
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadFromBucket("participant-lists", form.participant_file_path, `${form.project_name || "participants"}-참여자명단.${form.participant_file_path.split(".").pop() || "pdf"}`)}>
                        <Download className="h-4 w-4 mr-1" />다운로드
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="outline" disabled={!form.participant_file || extracting} onClick={handleExtractParticipants}>
                    {extracting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    AI 자동추출
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleParticipantsExcelExport}>
                    <Download className="h-4 w-4 mr-1" />엑셀양식
                  </Button>
                  <label>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleParticipantsExcelImport} />
                    <Button type="button" size="sm" variant="outline" asChild>
                      <span className="cursor-pointer"><Upload className="h-4 w-4 mr-1" />엑셀업로드</span>
                    </Button>
                  </label>
                  <Button type="button" size="sm" variant="ghost" onClick={addParticipant}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">HWP는 직접 지원되지 않습니다. PDF 또는 DOCX로 변환 후 업로드하세요.</p>

              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">성명</TableHead>
                      <TableHead className="w-[130px]">생년월일</TableHead>
                      <TableHead className="min-w-[340px]">참여기간</TableHead>
                      <TableHead className="w-[120px]">전문분야</TableHead>
                      <TableHead className="w-[110px]">직위</TableHead>
                      <TableHead className="w-[110px]">책임정도</TableHead>
                      <TableHead className="w-[44px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.participants.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">파일 업로드 후 AI 자동추출 또는 + 버튼으로 추가</TableCell></TableRow>
                    ) : form.participants.map((p, i) => {
                      const periods = getPeriods(p);
                      return (
                      <TableRow key={i}>
                        <TableCell className="p-1.5 align-top"><Input className="h-8" value={p.name || ""} onChange={(e) => updateParticipant(i, "name", e.target.value)} /></TableCell>
                        <TableCell className="p-1.5 align-top"><Input className="h-8" value={p.birth_date || ""} onChange={(e) => updateParticipant(i, "birth_date", formatBirth(e.target.value))} placeholder="YYYY.MM.DD" maxLength={10} /></TableCell>
                        <TableCell className="p-1.5 align-top">
                          <div className="space-y-1">
                            {(periods.length === 0 ? [{ start: "", end: "" }] : periods).map((pd, pi) => (
                              <div key={pi} className="flex items-center gap-1">
                                <DateInput className="h-8" value={pd.start || ""} onChange={(iso) => updatePeriods(i, (arr) => { const a = [...arr]; if (a.length === 0) a.push({}); a[pi] = { ...a[pi], start: iso }; return a; })} />
                                <span className="text-xs">~</span>
                                <DateInput className="h-8" value={pd.end || ""} onChange={(iso) => updatePeriods(i, (arr) => { const a = [...arr]; if (a.length === 0) a.push({}); a[pi] = { ...a[pi], end: iso }; return a; })} />
                                {periods.length > 1 && (
                                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => updatePeriods(i, (arr) => arr.filter((_, x) => x !== pi))}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button type="button" size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => updatePeriods(i, (arr) => [...arr, { start: "", end: "" }])}>
                              <Plus className="h-3 w-3 mr-1" />기간 추가
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="p-1.5 align-top"><Input className="h-8" value={p.specialty || ""} onChange={(e) => updateParticipant(i, "specialty", e.target.value)} /></TableCell>
                        <TableCell className="p-1.5 align-top"><Input className="h-8" value={p.position || ""} onChange={(e) => updateParticipant(i, "position", e.target.value)} /></TableCell>
                        <TableCell className="p-1.5 align-top"><Input className="h-8" value={p.responsibility || ""} onChange={(e) => updateParticipant(i, "responsibility", e.target.value)} /></TableCell>
                        <TableCell className="p-1.5 align-top"><Button size="icon" variant="ghost" onClick={() => removeParticipant(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
