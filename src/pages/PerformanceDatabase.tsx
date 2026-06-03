import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, X, Upload, Sparkles, FileText, Download, ChevronDown, ChevronRight, Copy } from "lucide-react";
import * as XLSX from "xlsx";

type Period = { start?: string; end?: string };
type Participant = {
  name: string;
  birth_date?: string;
  periods?: Period[];
  specialty?: string;
  position?: string;
  responsibility?: string;
};
type Phase = { label: string; amount: number | null; contract_amount?: number | null; share_rate?: number | null; share_amount?: number | null; contract_date?: string | null; start_date?: string | null; end_date?: string | null; pdf_path?: string | null; cert_pdf_path?: string | null; participant_file_path?: string | null; cert_pdf_file?: File | null; participant_file?: File | null; participants?: Participant[] };

type Row = {
  id: string;
  project_name: string;
  service_overview: string | null;
  client: string | null;
  contract_periods: Period[];
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_date: string | null;
  completion_date: string | null;
  contract_amount: number | null;
  share_rate: number | null;
  share_amount: number | null;
  company_share_rate: string | null;
  evaluation_types: string[];
  service_types: string[];
  participation_rate: number | null;
  participants: Participant[];
  participant_file_path: string | null;
  cert_pdf_path: string | null;
  phases: Phase[];
  is_private: boolean;
  is_under_90days: boolean;
  is_lh_completion: boolean;
  is_progress: boolean;
  is_dual_participation: boolean;
  is_external_company?: boolean;
  external_company_name?: string | null;
  notes: string | null;
};

const EVAL_OPTIONS = ["평가", "전략", "사후", "소규모", "기후"];

const isoToDisplay = (v?: string | null) => (v ? v.replace(/-/g, ".") : "");
const displayToIso = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};
const formatDate = (v: string) => {
  const d = (v || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
};

function DateInput({ value, onChange, className, placeholder = "YYYY.MM.DD" }: { value: string; onChange: (iso: string) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState<string>(isoToDisplay(value));
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);
  return (
    <Input className={className} value={text} placeholder={placeholder} maxLength={10} inputMode="numeric"
      onChange={(e) => { const f = formatDate(e.target.value); setText(f); onChange(displayToIso(f)); }} />
  );
}

const fmt = (n: number | null | undefined) => n == null || isNaN(Number(n)) ? "" : Number(n).toLocaleString();

// 숫자 입력 시 천단위 콤마 자동 적용
function NumberInput({ value, onChange, className, placeholder }: { value: string; onChange: (raw: string) => void; className?: string; placeholder?: string }) {
  const display = value === "" || value == null ? "" : Number(String(value).replace(/[^\d.-]/g, "")).toLocaleString();
  return (
    <Input
      className={className}
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(raw);
      }}
    />
  );
}

// "25.01.15" / "2025.01.15" / "250115" / "20250115" 등을 ISO로 변환
const normalizeIsoFromText = (s: string): string => {
  const digits = (s || "").replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (digits.length === 6) return `20${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  return "";
};
// "YY.MM.DD~YY.MM.DD" 또는 "YYYY.MM.DD" 등의 텍스트를 시작/종료 ISO로 파싱
const parsePeriodText = (s: string): { start: string; end: string } => {
  if (!s) return { start: "", end: "" };
  const parts = String(s).split(/[~–—]/).map((x) => x.trim()).filter(Boolean);
  return { start: normalizeIsoFromText(parts[0] || ""), end: normalizeIsoFromText(parts[1] || "") };
};
const formatPeriodDisplay = (start?: string, end?: string) => {
  const s = isoToDisplay(start);
  const e = isoToDisplay(end);
  if (s && e) return `${s}~${e}`;
  return s || e || "";
};

// 참여기간 단일 텍스트 입력 (자유 형식 → ISO 자동 반영)
function PeriodTextInput({ start, end, onChange, className }: { start?: string; end?: string; onChange: (start: string, end: string) => void; className?: string }) {
  const [text, setText] = useState<string>(formatPeriodDisplay(start, end));
  useEffect(() => { setText(formatPeriodDisplay(start, end)); }, [start, end]);
  return (
    <Input
      className={className}
      value={text}
      placeholder="예: 25.01.15~25.06.30"
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const p = parsePeriodText(v);
        onChange(p.start, p.end);
      }}
    />
  );
}

const emptyForm = {
  project_name: "",
  service_overview: "",
  client: "",
  contract_periods: [{ start: "", end: "" }] as Period[],
  contract_date: "",
  completion_date: "",
  contract_amount: "",
  share_rate: "",
  share_amount: "",
  company_share_rate: "",
  evaluation_types: [] as string[],
  service_types: [] as string[],
  service_type_input: "",
  participation_rate: "",
  participants: [] as Participant[],
  participant_file: null as File | null,
  participant_file_path: "",
  cert_pdf_file: null as File | null,
  cert_pdf_path: "",
  phases: [] as Phase[],
  is_private: false,
  is_under_90days: false,
  is_lh_completion: false,
  is_progress: false,
  is_dual_participation: false,
  external_company_name: "",
  notes: "",
};
type FormState = typeof emptyForm;

export default function PerformanceDatabase({ external = false }: { external?: boolean } = {}) {
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [missingPdfOnly, setMissingPdfOnly] = useState(false);
  const toggleExpand = (id: string) => setExpanded((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const [techSpecMap, setTechSpecMap] = useState<Map<string, string>>(new Map());

  useEffect(() => { fetchRows(); fetchTechSpecialties(); }, []);

  async function fetchTechSpecialties() {
    const { data } = await supabase.from("personal_profiles").select("technician_name,birth_date,specialty");
    const map = new Map<string, string>();
    (data || []).forEach((p: any) => {
      const sp = (p.specialty || "").trim();
      if (!sp) return;
      const name = (p.technician_name || "").trim();
      if (name) map.set(name, sp);
      if (p.birth_date) map.set(`${name}|${p.birth_date}`, sp);
    });
    setTechSpecMap(map);
  }

  function getRegisteredSpecialty(p: Participant): string | null {
    const name = (p.name || "").trim();
    if (!name) return null;
    const bd = (p.birth_date || "").replace(/\./g, "-").trim();
    if (bd && techSpecMap.has(`${name}|${bd}`)) return techSpecMap.get(`${name}|${bd}`)!;
    return techSpecMap.get(name) || null;
  }

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("performance_records")
      .select("*")
      .eq("is_external_company", external)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else {
      const list = (data as any[]).map(normalize);
      setRows(list);
      // 고아 유사용역 정리: 자사 실적 화면에서만 수행
      if (!external && user) {
        const { data: allOwn } = await supabase
          .from("performance_records")
          .select("project_name")
          .eq("created_by", user.id)
          .eq("is_external_company", false);
        const validNames = new Set((allOwn || []).map((r: any) => r.project_name).filter(Boolean));
        const { data: sims } = await supabase
          .from("similar_services")
          .select("id,project_name")
          .eq("created_by", user.id);
        const orphanIds = (sims || []).filter((s: any) => !validNames.has(s.project_name)).map((s: any) => s.id);
        if (orphanIds.length > 0) {
          await supabase.from("similar_services").delete().in("id", orphanIds);
        }
      }
    }
    setLoading(false);
  }

  function normalize(r: any): Row {
    return {
      ...r,
      evaluation_types: Array.isArray(r.evaluation_types) ? r.evaluation_types : [],
      service_types: Array.isArray(r.service_types) ? r.service_types : [],
      participants: Array.isArray(r.participants) ? r.participants : [],
      contract_periods: Array.isArray(r.contract_periods) ? r.contract_periods : [],
      phases: Array.isArray(r.phases) ? r.phases : [],
    };
  }

  const scrollPosRef = useRef(0);

  function openCreate() {
    scrollPosRef.current = window.scrollY;
    setEditing(null);
    setForm(emptyForm);
    setShareAmountTouched(false);
    setOpen(true);
  }

  function openEdit(r: Row) {
    scrollPosRef.current = window.scrollY;
    setEditing(r);
    setForm({
      project_name: r.project_name || "",
      service_overview: r.service_overview || "",
      client: r.client || "",
      contract_periods: r.contract_periods.length > 0 ? r.contract_periods : [{ start: "", end: "" }],
      contract_date: (r as any).contract_date || "",
      completion_date: r.completion_date || "",
      contract_amount: r.contract_amount?.toString() ?? "",
      share_rate: r.share_rate?.toString() ?? "",
      share_amount: r.share_amount?.toString() ?? "",
      company_share_rate: r.company_share_rate || "",
      evaluation_types: r.evaluation_types,
      service_types: r.service_types,
      service_type_input: "",
      participation_rate: r.participation_rate?.toString() ?? "",
      participants: r.participants,
      participant_file: null,
      participant_file_path: r.participant_file_path || "",
      cert_pdf_file: null,
      cert_pdf_path: r.cert_pdf_path || "",
      phases: r.phases,
      is_private: r.is_private,
      is_under_90days: r.is_under_90days,
      is_lh_completion: r.is_lh_completion,
      is_progress: r.is_progress,
      is_dual_participation: r.is_dual_participation,
      external_company_name: (r as any).external_company_name || "",
      notes: r.notes || "",
    });
    setShareAmountTouched(true);
    setOpen(true);
  }

  // 지분금액 자동계산 (계약금액·지분율 변경 시 항상 갱신)
  useEffect(() => {
    const amt = Number(form.contract_amount);
    const rate = Number(form.share_rate);
    if (!isNaN(amt) && !isNaN(rate) && form.contract_amount !== "" && form.share_rate !== "") {
      const computed = Math.round(amt * rate / 100).toString();
      setForm((f) => (f.share_amount === computed ? f : { ...f, share_amount: computed }));
    }
  }, [form.contract_amount, form.share_rate]);

  // 엑셀 파일에서 참여기술자 추출 (재사용 가능 헬퍼)
  async function parseParticipantsFromExcel(file: File): Promise<{ participants: Participant[]; completion: string | null }> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    let completionFromExcel: string | null = null;
    const participants: Participant[] = rows
      .map((r) => {
        const nmRaw = String(r["성명"] ?? r["이름"] ?? r["name"] ?? "").trim();
        const nm = nmRaw.replace(/\s+/g, "");
        if (!nm) return null;
        const birthRaw = r["생년월일"];
        const birth = typeof birthRaw === "number"
          ? new Date(Math.round((birthRaw - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
          : normalizeIsoFromText(String(birthRaw ?? ""));
        const periodRaw = r["참여기간"];
        const periodText = typeof periodRaw === "number"
          ? new Date(Math.round((periodRaw - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
          : String(periodRaw ?? "").trim();
        const periodLines = periodText.split(/[\n\r;]+/).map((s) => s.trim()).filter(Boolean);
        const periods: Period[] = periodLines
          .map((line) => {
            const p = parsePeriodText(line);
            return { start: p.start, end: p.end };
          })
          .filter((p) => p.start || p.end);
        const finalPeriods = periods.length > 0 ? periods : [{ start: "", end: "" }];
        const compRaw = r["준공일"] ?? r["완료일"];
        const compIso = typeof compRaw === "number"
          ? new Date(Math.round((compRaw - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
          : normalizeIsoFromText(String(compRaw ?? ""));
        if (compIso && (!completionFromExcel || compIso > completionFromExcel)) completionFromExcel = compIso;
        return {
          name: nm,
          birth_date: birth || undefined,
          specialty: String(r["전문분야"] ?? "").trim() || undefined,
          position: String(r["직위"] ?? "").trim() || undefined,
          responsibility: String(r["책임정도"] ?? "").trim() || undefined,
          periods: finalPeriods,
        } as Participant;
      })
      .filter(Boolean) as Participant[];
    return { participants, completion: completionFromExcel };
  }

  async function autoExtractFromExcel(file: File) {
    setExtracting(true);
    try {
      const { participants, completion } = await parseParticipantsFromExcel(file);
      if (participants.length === 0) { toast.error("엑셀에서 참여자를 찾지 못했습니다"); return; }
      setForm((f) => ({ ...f, participants, completion_date: completion || f.completion_date }));
      toast.success(`${participants.length}명 자동 추출 완료`);
    } catch (e: any) { toast.error(e?.message || "추출 실패"); }
    finally { setExtracting(false); }
  }

  function handleParticipantFileChange(file: File | null) {
    setForm((f) => ({ ...f, participant_file: file }));
    if (!file) return;
    const n = file.name.toLowerCase();
    if (n.endsWith(".xlsx") || n.endsWith(".xls")) {
      autoExtractFromExcel(file);
    }
  }

  async function handleExtractParticipants() {
    if (!form.participant_file) { toast.error("먼저 파일을 선택하세요"); return; }
    setExtracting(true);
    try {
      const file = form.participant_file;
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const { participants, completion } = await parseParticipantsFromExcel(file);
        if (participants.length === 0) { toast.error("엑셀에서 참여자를 찾지 못했습니다"); return; }
        setForm((f) => ({
          ...f,
          participants,
          completion_date: completion || f.completion_date,
        }));
        toast.success(`${participants.length}명 추출 완료`);
        return;
      }
      // PDF/DOCX는 AI 추출
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
      const participants: Participant[] = (data?.participants ?? []).map((p: Participant) => ({
        ...p,
        name: (p.name || "").replace(/\s+/g, ""),
      }));
      setForm((f) => ({ ...f, participants }));
      toast.success(`${participants.length}명 추출 완료`);
    } catch (e: any) { toast.error(e.message || "추출 실패"); }
    finally { setExtracting(false); }
  }


  async function downloadFromBucket(bucket: "performance-certs" | "participant-lists", path: string) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = path.split("/").pop() || "download";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "다운로드 실패"); }
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
        const { error } = await supabase.storage.from("participant-lists").upload(path, form.participant_file, { upsert: false });
        if (error) throw error;
        participant_file_path = path;
      }
      let cert_pdf_path = form.cert_pdf_path;
      if (form.cert_pdf_file) {
        const path = `${user.id}/${Date.now()}_cert.pdf`;
        const { error } = await supabase.storage.from("performance-certs").upload(path, form.cert_pdf_file, { contentType: "application/pdf", upsert: true });
        if (error) throw error;
        cert_pdf_path = path;
      }

      // 차수별 첨부파일 업로드
      const phasesUploaded: Phase[] = await Promise.all(form.phases.map(async (p, i) => {
        let phCert = p.cert_pdf_path || null;
        if (p.cert_pdf_file) {
          const path = `${user.id}/${Date.now()}_phase${i}_cert.pdf`;
          const { error } = await supabase.storage.from("performance-certs").upload(path, p.cert_pdf_file, { contentType: "application/pdf", upsert: true });
          if (error) throw error;
          phCert = path;
        }
        let phPart = p.participant_file_path || null;
        if (p.participant_file) {
          const ext = p.participant_file.name.split(".").pop();
          const path = `${user.id}/${Date.now()}_phase${i}.${ext}`;
          const { error } = await supabase.storage.from("participant-lists").upload(path, p.participant_file, { upsert: false });
          if (error) throw error;
          phPart = path;
        }
        const { cert_pdf_file, participant_file, ...rest } = p;
        return { ...rest, cert_pdf_path: phCert, participant_file_path: phPart };
      }));

      let cleanedPeriods = form.contract_periods
        .filter((p) => p.start || p.end)
        .sort((a, b) => (a.start || a.end || "").localeCompare(b.start || b.end || "") || (a.end || "").localeCompare(b.end || ""));
      let earliestStart = cleanedPeriods.map((p) => p.start).filter(Boolean).sort()[0] || null;
      let latestEnd = cleanedPeriods.map((p) => p.end).filter(Boolean).sort().slice(-1)[0] || null;
      // 차수가 입력된 경우 첫 차수의 착수일/마지막 차수의 준공일/금액 합산을 대표값으로
      let phaseContractTotal: number | null = null;
      let phaseShareTotal: number | null = null;
      if (form.phases.length > 0) {
        const phasePeriods = form.phases
          .filter((p) => p.start_date || p.end_date)
          .map((p) => ({ start: p.start_date || "", end: p.end_date || "" }));
        if (phasePeriods.length > 0) cleanedPeriods = phasePeriods;
        const firstPhaseStart = form.phases.find((p) => p.start_date)?.start_date || null;
        const lastPhaseEnd = [...form.phases].reverse().find((p) => p.end_date)?.end_date || null;
        if (firstPhaseStart) earliestStart = firstPhaseStart;
        if (lastPhaseEnd) latestEnd = lastPhaseEnd;
        const cSum = form.phases.reduce((s, p) => s + (Number(p.contract_amount) || 0), 0);
        const sSum = form.phases.reduce((s, p) => s + (Number(p.share_amount) || 0), 0);
        if (cSum > 0) phaseContractTotal = cSum;
        if (sSum > 0) phaseShareTotal = sSum;
      }

      const payload: any = {
        project_name: form.project_name.trim(),
        service_overview: form.service_overview || null,
        client: form.client || null,
        contract_periods: cleanedPeriods,
        contract_start_date: earliestStart,
        contract_end_date: latestEnd,
        contract_date: form.contract_date || null,
        completion_date: form.completion_date || latestEnd,
        contract_amount: phaseContractTotal != null ? phaseContractTotal : (form.contract_amount ? Number(form.contract_amount) : null),
        share_rate: form.share_rate ? Number(form.share_rate) : null,
        share_amount: phaseShareTotal != null ? phaseShareTotal : (form.share_amount ? Number(form.share_amount) : null),
        company_share_rate: form.company_share_rate || null,
        evaluation_types: form.evaluation_types,
        service_types: form.service_types,
        participation_rate: form.participation_rate ? Number(form.participation_rate) : null,
        participants: form.participants,
        participant_file_path,
        cert_pdf_path,
        phases: phasesUploaded,
        is_private: form.is_private,
        is_under_90days: form.is_under_90days,
        is_lh_completion: form.is_lh_completion,
        is_progress: form.is_progress,
        is_dual_participation: form.is_dual_participation,
        is_external_company: external,
        external_company_name: external ? (form.external_company_name || null) : null,
        notes: form.notes || null,
      };

      if (editing) {
        const { error } = await supabase.from("performance_records").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료");
      } else {
        const { error } = await supabase.from("performance_records").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료");
      }

      // PQ유사용역(similar_services) 동기화: 자사 실적만 반영
      if (!external) {
        const simPhases = (payload.phases || []).map((p: any) => ({
          ...p,
          amount: p.amount ?? p.share_amount ?? null,
          pdf_path: p.pdf_path || p.cert_pdf_path || cert_pdf_path || null,
        }));
        const simPayload: any = {
          project_name: payload.project_name,
          client: payload.client,
          contract_amount: payload.contract_amount,
          contract_date: payload.contract_date,
          completion_date: payload.completion_date,
          start_date: earliestStart,
          service_overview: payload.service_overview,
          service_type: (form.service_types || []).join(", ") || null,
          evaluation_type: (form.evaluation_types || []).join(", ") || null,
          participation_rate: payload.share_rate,
          share_amount: payload.share_amount,
          company_share_rate: payload.company_share_rate,
          phases: simPhases,
          cert_pdf_path,
          is_private: payload.is_private,
          is_under_90days: payload.is_under_90days,
          is_lh_completion: payload.is_lh_completion,
          is_progress: payload.is_progress,
          is_dual_participation: payload.is_dual_participation,
          notes: payload.notes,
        };
        const prevName = editing?.project_name;
        const matchName = prevName || payload.project_name;
        const { data: existing } = await supabase
          .from("similar_services")
          .select("id")
          .eq("created_by", user.id)
          .eq("project_name", matchName)
          .maybeSingle();
        if (existing?.id) {
          await supabase.from("similar_services").update(simPayload).eq("id", existing.id);
        } else {
          await supabase.from("similar_services").insert({ ...simPayload, created_by: user.id });
        }
      }

      setOpen(false);
      fetchRows();
    } catch (e: any) { toast.error(e.message || "저장 실패"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const target = rows.find((r) => r.id === deleteId);
    const { error } = await supabase.from("performance_records").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); setDeleteId(null); return; }
    // PQ유사용역(similar_services) 동기 삭제: 자사 실적만
    if (!external && target?.project_name && user) {
      await supabase.from("similar_services").delete()
        .eq("created_by", user.id)
        .eq("project_name", target.project_name);
    }
    toast.success("삭제 완료");
    fetchRows();
    setDeleteId(null);
  }

  async function handleCopy(r: Row) {
    if (!user) return;
    const { id, ...rest } = r as any;
    // 차수 자동 증가: 1차, (2차), 1차년도, 1차분, 1~2차, 1-2차 등 모두 인식해서 마지막 숫자+1로 변경
    function bumpPhase(name: string): string {
      const phaseRegex = /(\d+)(\s*[-~]\s*(\d+))?\s*(차년도|차년차|차분|차|단계)/g;
      let lastMatch: { idx: number; len: number; num: number; suffix: string } | null = null;
      let m: RegExpExecArray | null;
      while ((m = phaseRegex.exec(name)) !== null) {
        const num = parseInt(m[3] || m[1], 10);
        lastMatch = { idx: m.index, len: m[0].length, num, suffix: m[4] };
      }
      if (lastMatch) {
        const next = lastMatch.num + 1;
        const replacement = `${next}${lastMatch.suffix}`;
        return name.slice(0, lastMatch.idx) + replacement + name.slice(lastMatch.idx + lastMatch.len);
      }
      return `${name} (복사)`;
    }
    const newName = bumpPhase(r.project_name);
    const payload = {
      ...rest,
      project_name: newName,
      created_by: user.id,
    };
    delete (payload as any).created_at;
    delete (payload as any).updated_at;
    const { error } = await supabase.from("performance_records").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("복사 완료");
    fetchRows();
  }

  function toggleRowSelection(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = rows;
    if (q) {
      base = base.filter((r) =>
        [r.project_name, r.client, (r as any).external_company_name, ...(r.participants?.map((p) => p.name) ?? []), ...r.service_types, ...r.evaluation_types]
          .filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
      );
    }
    if (missingPdfOnly) {
      base = base.filter((r) => {
        const phases: any[] = Array.isArray((r as any).phases) ? (r as any).phases : [];
        const hasCert = !!r.cert_pdf_path || phases.some((p) => p?.cert_pdf_path);
        const hasPart = !!r.participant_file_path || phases.some((p) => p?.participant_file_path);
        return !hasCert || !hasPart;
      });
    }
    return base;
  }, [rows, search, missingPdfOnly]);


  const bulkDeletableIds = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)).map((r) => r.id),
    [filtered, selectedIds]
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach((r) => next.add(r.id));
      else filtered.forEach((r) => next.delete(r.id));
      return next;
    });
  }

  async function handleBulkDelete() {
    if (bulkDeletableIds.length === 0) return;
    const targetNames = rows.filter((r) => bulkDeletableIds.includes(r.id)).map((r) => r.project_name).filter(Boolean);
    const { error } = await supabase.from("performance_records").delete().in("id", bulkDeletableIds);
    if (error) { toast.error(error.message); setBulkDeleteOpen(false); return; }
    if (!external && targetNames.length > 0 && user) {
      await supabase.from("similar_services").delete()
        .eq("created_by", user.id)
        .in("project_name", targetNames);
    }
    toast.success(`${bulkDeletableIds.length}건 삭제 완료`);
    setSelectedIds(new Set());
    fetchRows();
    setBulkDeleteOpen(false);
  }

  function addServiceType() {
    const v = form.service_type_input.trim();
    if (!v || form.service_types.includes(v)) { setForm({ ...form, service_type_input: "" }); return; }
    setForm({ ...form, service_types: [...form.service_types, v], service_type_input: "" });
  }

  function updateContractPeriod(idx: number, key: "start" | "end", v: string) {
    setForm((f) => ({ ...f, contract_periods: f.contract_periods.map((p, i) => i === idx ? { ...p, [key]: v } : p) }));
  }
  function addContractPeriod() { setForm((f) => ({ ...f, contract_periods: [...f.contract_periods, { start: "", end: "" }] })); }
  function removeContractPeriod(idx: number) {
    setForm((f) => ({ ...f, contract_periods: f.contract_periods.length === 1 ? [{ start: "", end: "" }] : f.contract_periods.filter((_, i) => i !== idx) }));
  }


  function updateParticipant(idx: number, key: keyof Participant, val: string) {
    setForm((f) => ({ ...f, participants: f.participants.map((p, i) => i === idx ? { ...p, [key]: val } : p) }));
  }
  function removeParticipant(idx: number) { setForm((f) => ({ ...f, participants: f.participants.filter((_, i) => i !== idx) })); }
  function addParticipant() {
    setForm((f) => {
      const defStart = (f.contract_periods.find((p) => p.start)?.start) || "";
      const defEnd = ([...f.contract_periods].reverse().find((p) => p.end)?.end) || f.completion_date || "";
      return { ...f, participants: [...f.participants, { name: "", periods: [{ start: defStart, end: defEnd }] }] };
    });
  }
  function updateParticipantPeriod(pIdx: number, prdIdx: number, key: "start" | "end", v: string) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => {
        if (i !== pIdx) return p;
        const periods = (p.periods && p.periods.length > 0) ? [...p.periods] : [{ start: "", end: "" }];
        periods[prdIdx] = { ...periods[prdIdx], [key]: v };
        return { ...p, periods };
      }),
    }));
  }
  function addParticipantPeriod(pIdx: number) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => i === pIdx ? { ...p, periods: [...(p.periods || []), { start: "", end: "" }] } : p),
    }));
  }

  function downloadImportTemplate() {
    const headers = external
      ? ["타회사명", "사업명", "사업개요", "발주처", "계약일자", "계약기간", "계약금액", "지분율", "지분금액", "각사지분율", "평가종류", "사업종류", "비고"]
      : ["사업명", "사업개요", "발주처", "계약일자", "계약기간", "계약금액", "지분율", "지분금액", "각사지분율", "평가종류", "사업종류", "비고"];
    const sample = external
      ? ["○○건축사사무소", "예시사업명", "사업개요 요약", "○○공사", "2025.01.15", "25.01.15~25.06.30 | 25.07.01~25.12.31", "1000000000", "30", "300000000", "A사 50, B사 30, C사 20", "평가, 사후", "건축설계, 감리", ""]
      : ["예시사업명", "사업개요 요약", "○○공사", "2025.01.15", "25.01.15~25.06.30 | 25.07.01~25.12.31", "1000000000", "30", "300000000", "A사 50, B사 30, C사 20", "평가, 사후", "건축설계, 감리", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "실적");
    XLSX.writeFile(wb, external ? "타회사실적_가져오기양식.xlsx" : "실적_가져오기양식.xlsx");
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (rows.length === 0) { toast.error("가져올 데이터가 없습니다"); return; }
      const dateExcelToIso = (v: any): string | null => {
        if (v == null || v === "") return null;
        if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
        return normalizeIsoFromText(String(v)) || null;
      };
      const num = (v: any): number | null => {
        if (v == null || v === "") return null;
        const n = Number(String(v).replace(/[^\d.-]/g, ""));
        return isNaN(n) ? null : n;
      };
      const splitList = (v: any): string[] => String(v ?? "").split(/[,;|\/]/).map((s) => s.trim()).filter(Boolean);
      const recordMap = new Map<string, any>();
      for (const r of rows) {
        const rawName = String(r["사업명"] ?? "").trim();
        if (!rawName) continue;
        const phaseMatch = rawName.match(/[\(\[（【]\s*(\d+)\s*(차|단계)\s*[\)\]）】]\s*$/);
        // 차수/단계가 표기된 행은 각각 별도의 사업으로 등록 (사업명 그대로 유지)
        const project_name = rawName;
        const phaseLabel = phaseMatch ? `${phaseMatch[1]}${phaseMatch[2]}` : null;
        const periodsRaw = String(r["계약기간"] ?? "").trim();
        const periods = periodsRaw
          ? periodsRaw.split(/[|\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
              const p = parsePeriodText(s);
              return { start: p.start, end: p.end };
            }).filter((p) => p.start || p.end)
          : [];
        const earliestStart = periods.map((p) => p.start).filter(Boolean).sort()[0] || null;
        const latestEnd = periods.map((p) => p.end).filter(Boolean).sort().slice(-1)[0] || null;
        const contract_amount = num(r["계약금액"]);
        let share_rate = num(r["지분율"]);
        if (share_rate != null && share_rate > 0 && share_rate <= 1) {
          share_rate = share_rate * 100;
        }
        let share_amount = num(r["지분금액"]);
        if (share_amount == null && contract_amount != null && share_rate != null) {
          share_amount = Math.round(contract_amount * share_rate / 100);
        }
        const contract_date = dateExcelToIso(r["계약일자"]);
        const evaluation_types = splitList(r["평가종류"]);
        const externalName = external ? (String(r["타회사명"] ?? "").trim() || null) : null;
        // 차수가 있으면 사업명에 이미 차수가 포함되어 있으므로 항상 고유 키로 처리하여 별도 레코드로 등록
        const groupKey = phaseLabel
          ? `${externalName ?? ""}|${project_name}|__row${recordMap.size}__`
          : `${externalName ?? ""}|${project_name}`;

        const existing = recordMap.get(groupKey);
        if (existing) {
          const isPost = (existing.evaluation_types || []).includes("사후") || evaluation_types.includes("사후");
          const label = phaseLabel || (isPost ? `${existing.phases.length + 1}차` : `${existing.phases.length + 1}단계`);

          existing.phases.push({
            label,
            amount: null,
            contract_amount,
            share_rate,
            share_amount,
            contract_date,
            start_date: earliestStart,
            end_date: latestEnd,
            pdf_path: null,
            participants: [],
          });
          // aggregate totals/dates
          existing.contract_amount = (existing.contract_amount || 0) + (contract_amount || 0);
          existing.share_amount = (existing.share_amount || 0) + (share_amount || 0);
          existing.contract_periods = [...(existing.contract_periods || []), ...periods];
          if (earliestStart && (!existing.contract_start_date || earliestStart < existing.contract_start_date)) existing.contract_start_date = earliestStart;
          if (latestEnd && (!existing.contract_end_date || latestEnd > existing.contract_end_date)) {
            existing.contract_end_date = latestEnd;
            existing.completion_date = latestEnd;
          }
          if (evaluation_types.length) {
            existing.evaluation_types = Array.from(new Set([...(existing.evaluation_types || []), ...evaluation_types]));
          }
          continue;
        }

        const initialPhases: any[] = [];
        if (phaseLabel) {
          initialPhases.push({
            label: phaseLabel,
            amount: null,
            contract_amount,
            share_rate,
            share_amount,
            contract_date,
            start_date: earliestStart,
            end_date: latestEnd,
            pdf_path: null,
            participants: [],
          });
        }
        recordMap.set(groupKey, {
          created_by: user.id,
          project_name,
          service_overview: String(r["사업개요"] ?? "").trim() || null,
          client: String(r["발주처"] ?? "").trim() || null,
          contract_periods: periods,
          contract_start_date: earliestStart,
          contract_end_date: latestEnd,
          contract_date,
          completion_date: latestEnd,
          contract_amount,
          share_rate,
          share_amount,
          company_share_rate: String(r["각사지분율"] ?? "").trim() || null,
          evaluation_types,
          service_types: splitList(r["사업종류"]),
          participation_rate: null,
          participants: [],
          phases: initialPhases,
          is_private: false,
          is_under_90days: false,
          is_lh_completion: false,
          is_progress: false,
          is_dual_participation: false,
          is_external_company: external,
          external_company_name: externalName,
          notes: String(r["비고"] ?? "").trim() || null,
        });
      }
      const records: any[] = Array.from(recordMap.values());

      if (records.length === 0) { toast.error("유효한 행이 없습니다 (사업명 필수)"); return; }
      const { error } = await supabase.from("performance_records").insert(records);
      if (error) throw error;
      if (!external) {
        const simRecords = records.map((p) => {
          const simPhases = (p.phases || []).map((ph: any) => ({
            ...ph,
            amount: ph.amount ?? ph.share_amount ?? null,
            pdf_path: ph.pdf_path || ph.cert_pdf_path || p.cert_pdf_path || null,
          }));
          return {
          created_by: user.id,
          project_name: p.project_name,
          client: p.client,
          contract_amount: p.contract_amount,
          contract_date: p.contract_date,
          completion_date: p.completion_date,
          start_date: p.contract_start_date,
          service_overview: p.service_overview,
          service_type: (p.service_types || []).join(", ") || null,
          evaluation_type: (p.evaluation_types || []).join(", ") || null,
          participation_rate: p.share_rate,
          share_amount: p.share_amount,
          company_share_rate: p.company_share_rate,
          phases: simPhases,
          cert_pdf_path: null,
          is_private: p.is_private,
          is_under_90days: p.is_under_90days,
          is_lh_completion: p.is_lh_completion,
          is_progress: p.is_progress,
          is_dual_participation: p.is_dual_participation,
          notes: p.notes,
          };
        });
        const names = Array.from(new Set(simRecords.map((s) => s.project_name)));
        const { data: existing } = await supabase.from("similar_services").select("id,project_name").eq("created_by", user.id).in("project_name", names);
        const existingByName = new Map<string, string>();
        (existing || []).forEach((x: any) => existingByName.set(x.project_name, x.id));
        const toInsert = simRecords.filter((s) => !existingByName.has(s.project_name));
        const toUpdate = simRecords.filter((s) => existingByName.has(s.project_name));
        if (toInsert.length > 0) {
          const { error: simInsErr } = await supabase.from("similar_services").insert(toInsert);
          if (simInsErr) toast.error("PQ유사용역 동기화 실패: " + simInsErr.message);
        }
        for (const s of toUpdate) {
          const id = existingByName.get(s.project_name)!;
          await supabase.from("similar_services").update(s).eq("id", id);
        }
      }
      toast.success(`${records.length}건 가져오기 완료`);
      fetchRows();
    } catch (err: any) {
      toast.error("엑셀 처리 오류: " + (err?.message ?? ""));
    } finally {
      e.target.value = "";
    }
  }

  return (
    <AppLayout title={external ? "타회사 실적 데이터베이스 관리" : "실적 데이터베이스 관리"}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="사업명/발주처/기술자명/사업종류 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button
            variant={missingPdfOnly ? "default" : "outline"}
            onClick={() => setMissingPdfOnly((v) => !v)}
            title="실적증명서/참여자명단 PDF가 없는 실적만 보기"
          >
            <FileText className="h-4 w-4 mr-1" />PDF 미첨부만 {missingPdfOnly ? "해제" : "보기"}
          </Button>
          <Button
            variant="destructive"
            disabled={bulkDeletableIds.length === 0}
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />삭제 ({bulkDeletableIds.length}건)
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={downloadImportTemplate}>
              <Download className="h-4 w-4 mr-1" />가져오기 양식
            </Button>
            <label>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
              <Button type="button" variant="outline" asChild>
                <span className="cursor-pointer"><Upload className="h-4 w-4 mr-1" />엑셀 가져오기</span>
              </Button>
            </label>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />사업 등록</Button>
          </div>
        </div>

        <Card className="overflow-x-auto hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(c) => toggleSelectAll(!!c)}
                    aria-label="전체선택"
                  />
                </TableHead>
                <TableHead className="w-8 2xl:hidden" />
                {external && <TableHead>타회사명</TableHead>}
                <TableHead>사업명</TableHead>
                <TableHead>발주처</TableHead>
                <TableHead className="hidden lg:table-cell">계약기간</TableHead>
                <TableHead className="text-right hidden xl:table-cell">계약금액</TableHead>
                <TableHead className="text-right">지분금액</TableHead>
                <TableHead className="hidden xl:table-cell">평가</TableHead>
                <TableHead className="hidden 2xl:table-cell">사업종류</TableHead>
                <TableHead className="hidden lg:table-cell">참여인원</TableHead>
                <TableHead className="hidden xl:table-cell">파일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={external ? 13 : 12} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={external ? 13 : 12} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const noCompletion = !r.completion_date;
                const isOpen = expanded.has(r.id);
                const colSpan = external ? 13 : 12;
                return (
                <React.Fragment key={r.id}>
                <TableRow>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(c) => toggleRowSelection(r.id, !!c)}
                    />
                  </TableCell>
                  <TableCell className="2xl:hidden p-1">
                    <Button size="icon" variant="ghost" onClick={() => toggleExpand(r.id)} title={isOpen ? "접기" : "펼치기"}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  {external && <TableCell className="font-medium">{(r as any).external_company_name ?? "-"}</TableCell>}
                  <TableCell className="font-medium">
                    {r.project_name}
                    {r.is_private && <Badge variant="outline" className="ml-2">민간</Badge>}
                  </TableCell>
                  <TableCell>{r.client ?? "-"}</TableCell>
                  <TableCell className="whitespace-pre hidden lg:table-cell">{r.contract_periods.map((p) => `${isoToDisplay(p.start)} ~ ${isoToDisplay(p.end)}`).join("\n") || "-"}</TableCell>
                  <TableCell className="text-right hidden xl:table-cell">{fmt(r.contract_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.share_amount)}</TableCell>
                  <TableCell className="hidden xl:table-cell"><div className="flex flex-wrap gap-1">{r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div></TableCell>
                  <TableCell className="hidden 2xl:table-cell"><div className="flex flex-wrap gap-1">{r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></TableCell>
                  <TableCell className="hidden lg:table-cell">{r.participants.length}명</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex gap-1">
                      {r.cert_pdf_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("performance-certs", r.cert_pdf_path!)} title="실적증명PDF"><FileText className="h-4 w-4" /></Button>}
                      {r.participant_file_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("participant-lists", r.participant_file_path!)} title="참여자명단"><Download className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="수정"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleCopy(r)} title="복사"><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} title="삭제"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="2xl:hidden bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={colSpan}>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm px-2 py-1">
                        <div className="lg:hidden"><span className="text-muted-foreground mr-2">계약기간:</span><span className="whitespace-pre-line">{r.contract_periods.map((p) => `${isoToDisplay(p.start)} ~ ${isoToDisplay(p.end)}`).join("\n") || "-"}</span></div>
                        <div className="xl:hidden"><span className="text-muted-foreground mr-2">계약금액:</span>{fmt(r.contract_amount) || "-"}</div>
                        <div className="xl:hidden"><span className="text-muted-foreground mr-2">평가:</span><span className="inline-flex flex-wrap gap-1 align-middle">{r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</span></div>
                        <div className="2xl:hidden"><span className="text-muted-foreground mr-2">사업종류:</span><span className="inline-flex flex-wrap gap-1 align-middle">{r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</span></div>
                        <div className="lg:hidden"><span className="text-muted-foreground mr-2">참여인원:</span>{r.participants.length}명</div>
                        <div className="xl:hidden flex items-center gap-2 flex-wrap"><span className="text-muted-foreground">파일:</span>
                          {r.cert_pdf_path && <Button size="sm" variant="outline" onClick={() => downloadFromBucket("performance-certs", r.cert_pdf_path!)}><FileText className="h-3 w-3 mr-1" />실적증명</Button>}
                          {r.participant_file_path && <Button size="sm" variant="outline" onClick={() => downloadFromBucket("participant-lists", r.participant_file_path!)}><Download className="h-3 w-3 mr-1" />참여자</Button>}
                          {!r.cert_pdf_path && !r.participant_file_path && <span>-</span>}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>

        {/* Mobile card list */}
        <Card className="md:hidden overflow-hidden">
          <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/30">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={(c) => toggleSelectAll(!!c)}
              aria-label="모두선택"
            />
            <span className="text-sm text-muted-foreground">모두선택</span>
          </div>
          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">데이터가 없습니다.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <li key={r.id}>
                    <div className="flex items-start gap-2 px-3 py-3">
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(c) => toggleRowSelection(r.id, !!c)}
                      />
                      <button type="button" onClick={() => toggleExpand(r.id)} className="flex-1 min-w-0 flex items-start gap-2 text-left">
                        {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm break-words">
                            {r.project_name}
                            {r.is_private && <Badge variant="outline" className="ml-2">민간</Badge>}
                          </div>
                          {external && (r as any).external_company_name && (
                            <div className="text-xs text-muted-foreground mt-0.5">{(r as any).external_company_name}</div>
                          )}
                        </div>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pl-10 space-y-1 text-xs">
                        <div><span className="text-muted-foreground">발주처: </span>{r.client ?? "-"}</div>
                        <div className="whitespace-pre-wrap"><span className="text-muted-foreground">계약기간: </span>{r.contract_periods.map((p) => `${isoToDisplay(p.start)} ~ ${isoToDisplay(p.end)}`).join("\n") || "-"}</div>
                        <div><span className="text-muted-foreground">계약금액: </span>{fmt(r.contract_amount)}</div>
                        <div><span className="text-muted-foreground">지분금액: </span>{fmt(r.share_amount)}</div>
                        {r.evaluation_types.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center"><span className="text-muted-foreground">평가: </span>{r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                        )}
                        {r.service_types.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center"><span className="text-muted-foreground">사업종류: </span>{r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>
                        )}
                        <div><span className="text-muted-foreground">참여인원: </span>{r.participants.length}명</div>
                        {(r.cert_pdf_path || r.participant_file_path) && (
                          <div className="flex gap-1 items-center">
                            <span className="text-muted-foreground">파일: </span>
                            {r.cert_pdf_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("performance-certs", r.cert_pdf_path!)} title="실적증명PDF"><FileText className="h-4 w-4" /></Button>}
                            {r.participant_file_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("participant-lists", r.participant_file_path!)} title="참여자명단"><Download className="h-4 w-4" /></Button>}
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil className="h-3 w-3 mr-1" />수정</Button>
                          <Button size="sm" variant="outline" onClick={() => handleCopy(r)}><Copy className="h-3 w-3 mr-1" />복사</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 mr-1 text-destructive" />삭제</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-3 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { requestAnimationFrame(() => window.scrollTo({ top: scrollPosRef.current })); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "사업 수정" : "사업 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* 기본 정보 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              {external && (
                <div>
                  <Label>타회사명 *</Label>
                  <Input value={form.external_company_name} onChange={(e) => setForm({ ...form, external_company_name: e.target.value })} placeholder="예: ○○건축사사무소" />
                </div>
              )}
              <div>
                <Label>사업명 *</Label>
                <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div>
                <Label>사업개요</Label>
                <Textarea rows={2} value={form.service_overview} onChange={(e) => setForm({ ...form, service_overview: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>발주처</Label>
                  <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                </div>
                <div>
                  <Label>계약일자</Label>
                  <DateInput value={form.contract_date} onChange={(v) => setForm({ ...form, contract_date: v })} />
                </div>
              </div>
            </div>

            {/* 계약기간 (다중) */}
            <div className="space-y-2 p-3 rounded-md bg-background border">
              <div className="flex items-center justify-between">
                <Label>계약기간 (여러개 가능)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addContractPeriod}><Plus className="h-3 w-3 mr-1" />추가</Button>
              </div>
              {form.contract_periods.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DateInput value={p.start || ""} onChange={(v) => updateContractPeriod(i, "start", v)} />
                  <span>~</span>
                  <DateInput value={p.end || ""} onChange={(v) => updateContractPeriod(i, "end", v)} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeContractPeriod(i)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            {/* 금액/지분 */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-primary/10 border">
              <div>
                <Label>계약금액</Label>
                <NumberInput value={form.contract_amount} onChange={(v) => setForm({ ...form, contract_amount: v })} />
              </div>
              <div>
                <Label>지분율(%)</Label>
                <Input type="number" step="any" value={form.share_rate} onChange={(e) => setForm({ ...form, share_rate: e.target.value })} />
              </div>
              <div>
                <Label>지분금액 (자동)</Label>
                <NumberInput value={form.share_amount} onChange={(v) => { setShareAmountTouched(true); setForm({ ...form, share_amount: v }); }} />
              </div>
              <div>
                <Label>각사지분율</Label>
                <Input value={form.company_share_rate} onChange={(e) => setForm({ ...form, company_share_rate: e.target.value })} placeholder="예: A사 50, B사 30, C사 20" />
              </div>
            </div>

            {/* 평가/사업종류 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              <div>
                <Label>평가종류</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {EVAL_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5">
                      <Checkbox checked={form.evaluation_types.includes(opt)} onCheckedChange={(c) => setForm((f) => ({ ...f, evaluation_types: c ? [...f.evaluation_types, opt] : f.evaluation_types.filter((x) => x !== opt) }))} />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>사업종류</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.service_types.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, service_types: f.service_types.filter((x) => x !== t) }))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={form.service_type_input} onChange={(e) => setForm({ ...form, service_type_input: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addServiceType(); } }} placeholder="사업종류 입력 후 Enter 또는 추가" />
                  <Button type="button" variant="outline" onClick={addServiceType}>추가</Button>
                </div>
              </div>
            </div>

            {/* 플래그 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 rounded-md bg-background border">
              {[
                { k: "is_private", l: "민간사업" },
                { k: "is_lh_completion", l: "LH기성실적" },
                { k: "is_progress", l: "기성실적" },
                { k: "is_dual_participation", l: "분담사업" },
              ].map(({ k, l }) => (
                <label key={k} className="flex items-center gap-2">
                  <Checkbox checked={(form as any)[k]} onCheckedChange={(c) => setForm({ ...form, [k]: !!c } as any)} />
                  <span className="text-sm">{l}</span>
                </label>
              ))}
            </div>

            {/* 참여 기술자 */}
            <div className="space-y-2 p-3 rounded-md bg-background border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>참여 기술자</Label>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input type="file" accept=".pdf,.docx,.xlsx,.xls" className="max-w-xs" onChange={(e) => handleParticipantFileChange(e.target.files?.[0] || null)} />
                  <Button type="button" size="sm" variant="outline" disabled={!form.participant_file || extracting} onClick={handleExtractParticipants}>
                    {extracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}자동추출
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addParticipant}><Plus className="h-3 w-3 mr-1" />수동추가</Button>
                </div>
              </div>
              {form.participant_file_path && !form.participant_file && (
                <div className="text-xs text-muted-foreground">기존 파일: {form.participant_file_path.split("/").pop()}</div>
              )}
              {form.participants.map((p, i) => {
                const regSpec = getRegisteredSpecialty(p);
                const partSpec = (p.specialty || "").trim();
                const mismatch = !!regSpec && !!partSpec && regSpec !== partSpec;
                return (
                <div key={i} className={`border rounded p-2 space-y-2 ${mismatch ? "bg-purple-100 border-purple-400" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Input className="max-w-[140px]" placeholder="성명" value={p.name} onChange={(e) => updateParticipant(i, "name", e.target.value)} />
                    <Input className="max-w-[120px]" placeholder="생년월일" value={p.birth_date || ""} onChange={(e) => updateParticipant(i, "birth_date", formatDate(e.target.value))} />
                    <Input className={`max-w-[120px] ${mismatch ? "border-purple-500" : ""}`} placeholder="전문분야" value={p.specialty || ""} onChange={(e) => updateParticipant(i, "specialty", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="직위" value={p.position || ""} onChange={(e) => updateParticipant(i, "position", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="책임정도" value={p.responsibility || ""} onChange={(e) => updateParticipant(i, "responsibility", e.target.value)} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeParticipant(i)}><X className="h-4 w-4" /></Button>
                  </div>
                  {mismatch && (
                    <div className="text-xs text-purple-700 font-semibold">⚠ 이력사항 등록 전문분야({regSpec})와 일치하지 않습니다</div>
                  )}
                  <div className="space-y-1">
                    {(p.periods && p.periods.length > 0 ? p.periods : [{ start: "", end: "" }]).map((pd, j) => (
                      <PeriodTextInput
                        key={j}
                        className="max-w-[280px]"
                        start={pd.start}
                        end={pd.end}
                        onChange={(s, e) => { updateParticipantPeriod(i, j, "start", s); updateParticipantPeriod(i, j, "end", e); }}
                      />
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => addParticipantPeriod(i)}><Plus className="h-3 w-3 mr-1" />참여기간 추가</Button>
                  </div>
                </div>
                );
              })}
            </div>


            {/* 파일/비고 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>실적증명 PDF</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" accept="application/pdf" onChange={(e) => setForm({ ...form, cert_pdf_file: e.target.files?.[0] || null })} />
                    {form.cert_pdf_path && !form.cert_pdf_file && (
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadFromBucket("performance-certs", form.cert_pdf_path)}><Download className="h-3 w-3 mr-1" />다운로드</Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label>참여자명단 PDF</Label>
                  <div className="flex items-center gap-2">
                    <Input type="file" accept=".pdf,.docx,.xlsx,.xls" onChange={(e) => handleParticipantFileChange(e.target.files?.[0] || null)} />
                    {form.participant_file_path && !form.participant_file && (
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadFromBucket("participant-lists", form.participant_file_path)}><Download className="h-3 w-3 mr-1" />다운로드</Button>
                    )}
                  </div>
                  {form.participant_file_path && !form.participant_file && (
                    <div className="text-xs text-muted-foreground mt-1">기존 파일: {form.participant_file_path.split("/").pop()}</div>
                  )}
                </div>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다. 마스터 데이터베이스에서 영구 삭제됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkDeletableIds.length}건을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>선택한 항목이 영구 삭제됩니다. 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
