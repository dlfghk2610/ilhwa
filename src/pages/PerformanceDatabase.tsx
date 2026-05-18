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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, X, Upload, Sparkles, FileText, Download } from "lucide-react";
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
type Phase = { label: string; amount: number | null; contract_amount?: number | null; share_rate?: number | null; share_amount?: number | null; contract_date?: string | null; start_date?: string | null; end_date?: string | null; pdf_path?: string | null; participants?: Participant[] };

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

const EVAL_OPTIONS = ["평가", "전략", "사후", "소규모"];

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

  useEffect(() => { fetchRows(); }, []);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("performance_records")
      .select("*")
      .eq("is_external_company", external)
      .order("created_at", { ascending: false });
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
      phases: Array.isArray(r.phases) ? r.phases : [],
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

  async function handleExtractParticipants() {
    if (!form.participant_file) { toast.error("먼저 파일을 선택하세요"); return; }
    setExtracting(true);
    try {
      const file = form.participant_file;
      const name = file.name.toLowerCase();
      // 엑셀 양식이면 로컬에서 즉시 파싱
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        const participants: Participant[] = rows
          .map((r) => {
            const nm = String(r["성명"] ?? r["이름"] ?? r["name"] ?? "").trim();
            if (!nm) return null;
            const birthRaw = r["생년월일"];
            const birth = typeof birthRaw === "number"
              ? new Date(Math.round((birthRaw - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
              : normalizeIsoFromText(String(birthRaw ?? ""));
            const periodText = String(r["참여기간"] ?? "").trim();
            const period = parsePeriodText(periodText);
            return {
              name: nm,
              birth_date: birth || undefined,
              specialty: String(r["전문분야"] ?? "").trim() || undefined,
              position: String(r["직위"] ?? "").trim() || undefined,
              responsibility: String(r["책임정도"] ?? "").trim() || undefined,
              periods: [{ start: period.start, end: period.end }],
            } as Participant;
          })
          .filter(Boolean) as Participant[];
        if (participants.length === 0) { toast.error("엑셀에서 참여자를 찾지 못했습니다"); return; }
        setForm((f) => ({ ...f, participants }));
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
      const participants: Participant[] = data?.participants ?? [];
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

      const cleanedPeriods = form.contract_periods.filter((p) => p.start || p.end);
      const earliestStart = cleanedPeriods.map((p) => p.start).filter(Boolean).sort()[0] || null;
      const latestEnd = cleanedPeriods.map((p) => p.end).filter(Boolean).sort().slice(-1)[0] || null;

      const payload: any = {
        project_name: form.project_name.trim(),
        service_overview: form.service_overview || null,
        client: form.client || null,
        contract_periods: cleanedPeriods,
        contract_start_date: earliestStart,
        contract_end_date: latestEnd,
        contract_date: form.contract_date || null,
        completion_date: latestEnd,
        contract_amount: form.contract_amount ? Number(form.contract_amount) : null,
        share_rate: form.share_rate ? Number(form.share_rate) : null,
        share_amount: form.share_amount ? Number(form.share_amount) : null,
        company_share_rate: form.company_share_rate || null,
        evaluation_types: form.evaluation_types,
        service_types: form.service_types,
        participation_rate: form.participation_rate ? Number(form.participation_rate) : null,
        participants: form.participants,
        participant_file_path,
        cert_pdf_path,
        phases: form.phases,
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
          participation_rate: payload.participation_rate,
          share_amount: payload.share_amount,
          company_share_rate: payload.company_share_rate,
          phases: payload.phases,
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
    // PQ유사용역(similar_services) 동기 삭제: 사업명 일치
    if (target?.project_name) {
      await supabase.from("similar_services").delete().eq("project_name", target.project_name);
    }
    toast.success("삭제 완료");
    fetchRows();
    setDeleteId(null);
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
    if (!q) return rows;
    return rows.filter((r) =>
      [r.project_name, r.client, (r as any).external_company_name, ...(r.participants?.map((p) => p.name) ?? []), ...r.service_types, ...r.evaluation_types]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    );
  }, [rows, search]);

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
    if (targetNames.length > 0) {
      await supabase.from("similar_services").delete().in("project_name", targetNames);
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

  function addPhase() {
    setForm((f) => {
      const isPost = f.evaluation_types.includes("사후");
      const label = isPost ? `${f.phases.length + 1}차` : `${f.phases.length + 1}단계`;
      return { ...f, phases: [...f.phases, { label, amount: null, contract_amount: null, share_rate: null, share_amount: null, contract_date: null, start_date: null, end_date: null, pdf_path: null, participants: [] }] };
    });
  }
  function updatePhase(idx: number, patch: Partial<Phase>) {
    setForm((f) => ({ ...f, phases: f.phases.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  }
  function removePhase(idx: number) {
    setForm((f) => ({ ...f, phases: f.phases.filter((_, i) => i !== idx) }));
  }
  function updatePhaseParticipant(phIdx: number, partIdx: number, key: keyof Participant, val: string) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => j === partIdx ? { ...p, [key]: val } : p) }) }));
  }
  function addPhaseParticipant(phIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: [...(ph.participants || []), { name: "", periods: [{ start: "", end: "" }] }] }) }));
  }
  function removePhaseParticipant(phIdx: number, partIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).filter((_, j) => j !== partIdx) }) }));
  }
  function updatePhaseParticipantPeriod(phIdx: number, partIdx: number, prdIdx: number, key: "start" | "end", v: string) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => {
      if (j !== partIdx) return p;
      const periods = (p.periods && p.periods.length > 0) ? [...p.periods] : [{ start: "", end: "" }];
      periods[prdIdx] = { ...periods[prdIdx], [key]: v };
      return { ...p, periods };
    }) }) }));
  }
  function addPhaseParticipantPeriod(phIdx: number, partIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => j !== partIdx ? p : { ...p, periods: [...(p.periods || []), { start: "", end: "" }] }) }) }));
  }

  function updateParticipant(idx: number, key: keyof Participant, val: string) {
    setForm((f) => ({ ...f, participants: f.participants.map((p, i) => i === idx ? { ...p, [key]: val } : p) }));
  }
  function removeParticipant(idx: number) { setForm((f) => ({ ...f, participants: f.participants.filter((_, i) => i !== idx) })); }
  function addParticipant() { setForm((f) => ({ ...f, participants: [...f.participants, { name: "", periods: [{ start: "", end: "" }] }] })); }
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
      const records: any[] = [];
      for (const r of rows) {
        const project_name = String(r["사업명"] ?? "").trim();
        if (!project_name) continue;
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
        const share_rate = num(r["지분율"]);
        let share_amount = num(r["지분금액"]);
        if (share_amount == null && contract_amount != null && share_rate != null) {
          share_amount = Math.round(contract_amount * share_rate / 100);
        }
        records.push({
          created_by: user.id,
          project_name,
          service_overview: String(r["사업개요"] ?? "").trim() || null,
          client: String(r["발주처"] ?? "").trim() || null,
          contract_periods: periods,
          contract_start_date: earliestStart,
          contract_end_date: latestEnd,
          contract_date: dateExcelToIso(r["계약일자"]),
          completion_date: latestEnd,
          contract_amount,
          share_rate,
          share_amount,
          company_share_rate: String(r["각사지분율"] ?? "").trim() || null,
          evaluation_types: splitList(r["평가종류"]),
          service_types: splitList(r["사업종류"]),
          participation_rate: null,
          participants: [],
          phases: [],
          is_private: false,
          is_under_90days: false,
          is_lh_completion: false,
          is_progress: false,
          is_dual_participation: false,
          is_external_company: external,
          external_company_name: external ? (String(r["타회사명"] ?? "").trim() || null) : null,
          notes: String(r["비고"] ?? "").trim() || null,
        });
      }
      if (records.length === 0) { toast.error("유효한 행이 없습니다 (사업명 필수)"); return; }
      const { error } = await supabase.from("performance_records").insert(records);
      if (error) throw error;
      if (!external) {
        const simRecords = records.map((p) => ({
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
          participation_rate: p.participation_rate,
          share_amount: p.share_amount,
          company_share_rate: p.company_share_rate,
          notes: p.notes,
        }));
        const names = simRecords.map((s) => s.project_name);
        const { data: existing } = await supabase.from("similar_services").select("project_name").eq("created_by", user.id).in("project_name", names);
        const existingNames = new Set((existing || []).map((x: any) => x.project_name));
        const toInsert = simRecords.filter((s) => !existingNames.has(s.project_name));
        if (toInsert.length > 0) await supabase.from("similar_services").insert(toInsert);
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

        <Card className="overflow-x-auto">
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
                {external && <TableHead>타회사명</TableHead>}
                <TableHead>사업명</TableHead>
                <TableHead>발주처</TableHead>
                <TableHead>계약기간</TableHead>
                <TableHead className="text-right">계약금액</TableHead>
                <TableHead className="text-right">지분금액</TableHead>
                <TableHead>평가</TableHead>
                <TableHead>사업종류</TableHead>
                <TableHead>참여인원</TableHead>
                <TableHead>파일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={external ? 12 : 11} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={external ? 12 : 11} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const noCompletion = !r.completion_date;
                return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(c) => toggleRowSelection(r.id, !!c)}
                    />
                  </TableCell>
                  {external && <TableCell className="font-medium">{(r as any).external_company_name ?? "-"}</TableCell>}
                  <TableCell className="font-medium">
                    {r.project_name}
                    {r.is_private && <Badge variant="outline" className="ml-2">민간</Badge>}
                  </TableCell>
                  <TableCell>{r.client ?? "-"}</TableCell>
                  <TableCell className="whitespace-pre">{r.contract_periods.map((p) => `${isoToDisplay(p.start)} ~ ${isoToDisplay(p.end)}`).join("\n") || "-"}</TableCell>
                  <TableCell className="text-right">{fmt(r.contract_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.share_amount)}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></TableCell>
                  <TableCell>{r.participants.length}명</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.cert_pdf_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("performance-certs", r.cert_pdf_path!)} title="실적증명PDF"><FileText className="h-4 w-4" /></Button>}
                      {r.participant_file_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("participant-lists", r.participant_file_path!)} title="참여자명단"><Download className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
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
                { k: "is_under_90days", l: "90일미만 포함" },
                { k: "is_lh_completion", l: "LH기성실적" },
                { k: "is_progress", l: "기성실적 포함" },
                { k: "is_dual_participation", l: "분담사업 포함" },
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
                  <Input type="file" accept=".pdf,.docx,.xlsx,.xls" className="max-w-xs" onChange={(e) => setForm({ ...form, participant_file: e.target.files?.[0] || null })} />
                  <Button type="button" size="sm" variant="outline" disabled={!form.participant_file || extracting} onClick={handleExtractParticipants}>
                    {extracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}자동추출
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addParticipant}><Plus className="h-3 w-3 mr-1" />수동추가</Button>
                </div>
              </div>
              {form.participant_file_path && !form.participant_file && (
                <div className="text-xs text-muted-foreground">기존 파일: {form.participant_file_path.split("/").pop()}</div>
              )}
              {form.participants.map((p, i) => (
                <div key={i} className="border rounded p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input className="max-w-[140px]" placeholder="성명" value={p.name} onChange={(e) => updateParticipant(i, "name", e.target.value)} />
                    <Input className="max-w-[120px]" placeholder="생년월일" value={p.birth_date || ""} onChange={(e) => updateParticipant(i, "birth_date", formatDate(e.target.value))} />
                    <Input className="max-w-[120px]" placeholder="전문분야" value={p.specialty || ""} onChange={(e) => updateParticipant(i, "specialty", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="직위" value={p.position || ""} onChange={(e) => updateParticipant(i, "position", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="책임정도" value={p.responsibility || ""} onChange={(e) => updateParticipant(i, "responsibility", e.target.value)} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeParticipant(i)}><X className="h-4 w-4" /></Button>
                  </div>
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
              ))}
            </div>

            {/* 차수/분담사업 단계 */}
            {(form.is_dual_participation || form.evaluation_types.includes("사후")) && (
              <div className="space-y-2 p-3 rounded-md bg-background border">
                <div className="flex items-center justify-between">
                  <Label>{form.evaluation_types.includes("사후") ? "사후 차수별 정보" : "분담사업 단계"}</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addPhase}><Plus className="h-3 w-3 mr-1" />{form.evaluation_types.includes("사후") ? "차수 추가" : "단계 추가"}</Button>
                </div>
                {form.phases.map((p, i) => (
                  <div key={i} className="border rounded p-2 space-y-2 bg-muted/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Input placeholder="차수/단계명" value={p.label} onChange={(e) => updatePhase(i, { label: e.target.value })} />
                      <Input type="number" placeholder="계약금액" value={p.contract_amount ?? ""} onChange={(e) => updatePhase(i, { contract_amount: e.target.value ? Number(e.target.value) : null })} />
                      <Input type="number" placeholder="지분율(%)" value={p.share_rate ?? ""} onChange={(e) => updatePhase(i, { share_rate: e.target.value ? Number(e.target.value) : null })} />
                      <Input type="number" placeholder="지분금액" value={p.share_amount ?? p.amount ?? ""} onChange={(e) => updatePhase(i, { share_amount: e.target.value ? Number(e.target.value) : null, amount: e.target.value ? Number(e.target.value) : null })} />
                      <DateInput value={p.contract_date || ""} onChange={(v) => updatePhase(i, { contract_date: v || null })} placeholder="계약일" />
                      <DateInput value={p.start_date || ""} onChange={(v) => updatePhase(i, { start_date: v || null })} placeholder="착수일" />
                      <DateInput value={p.end_date || ""} onChange={(v) => updatePhase(i, { end_date: v || null })} placeholder="종료일" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => removePhase(i)}><X className="h-4 w-4 mr-1" />삭제</Button>
                    </div>

                    {/* 차수별 참여 기술자 */}
                    <div className="border-t pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">참여 기술자</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => addPhaseParticipant(i)}><Plus className="h-3 w-3 mr-1" />기술자 추가</Button>
                      </div>
                      {(p.participants || []).map((pt, j) => (
                        <div key={j} className="border rounded p-2 space-y-2 bg-background">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input className="max-w-[140px]" placeholder="성명" value={pt.name} onChange={(e) => updatePhaseParticipant(i, j, "name", e.target.value)} />
                            <Input className="max-w-[120px]" placeholder="생년월일" value={pt.birth_date || ""} onChange={(e) => updatePhaseParticipant(i, j, "birth_date", formatDate(e.target.value))} />
                            <Input className="max-w-[120px]" placeholder="전문분야" value={pt.specialty || ""} onChange={(e) => updatePhaseParticipant(i, j, "specialty", e.target.value)} />
                            <Input className="max-w-[100px]" placeholder="직위" value={pt.position || ""} onChange={(e) => updatePhaseParticipant(i, j, "position", e.target.value)} />
                            <Input className="max-w-[100px]" placeholder="책임정도" value={pt.responsibility || ""} onChange={(e) => updatePhaseParticipant(i, j, "responsibility", e.target.value)} />
                            <Button type="button" size="icon" variant="ghost" onClick={() => removePhaseParticipant(i, j)}><X className="h-4 w-4" /></Button>
                          </div>
                          <div className="space-y-1">
                            {(pt.periods && pt.periods.length > 0 ? pt.periods : [{ start: "", end: "" }]).map((pd, k) => (
                              <PeriodTextInput
                                key={k}
                                className="max-w-[280px]"
                                start={pd.start}
                                end={pd.end}
                                onChange={(s, e) => { updatePhaseParticipantPeriod(i, j, k, "start", s); updatePhaseParticipantPeriod(i, j, k, "end", e); }}
                              />
                            ))}
                            <Button type="button" size="sm" variant="ghost" onClick={() => addPhaseParticipantPeriod(i, j)}><Plus className="h-3 w-3 mr-1" />참여기간 추가</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                    <Input type="file" accept=".pdf,.docx,.xlsx,.xls" onChange={(e) => setForm({ ...form, participant_file: e.target.files?.[0] || null })} />
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
