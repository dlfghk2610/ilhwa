import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, Loader2, CalendarIcon, ChevronDown, ChevronRight, Upload, FileDown, Download, Printer, FileText as FileTextIcon } from "lucide-react";
import { importFromExcel, exportToExcel } from "@/lib/excel";
import { PDFDocument } from "pdf-lib";

type Participant = { name: string; role?: string; start_date?: string | null; end_date?: string | null; excluded?: boolean };

type Amendment = {
  id: string;
  change_date: string | null;
  contract_amount_new: number | null;
  end_date_new: string | null;
  end_date_new_text?: string | null;
  pdf_path: string | null;
  note?: string | null;
};
type Suspension = {
  id: string;
  suspension_date: string | null;
  suspension_reason: string | null;
  resume_date: string | null;
  suspension_pdf_path: string | null;
  resume_pdf_path: string | null;
};

type OverlapRow = {
  id: string;
  project_name: string;
  client: string | null;
  contract_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  end_date_text: string | null;
  // legacy single-suspension fields (kept for back-compat reads)
  suspension_date: string | null;
  suspension_reason: string | null;
  agreement_date: string | null;
  absolute_period_days: number | null;
  is_lh: boolean;
  lh_main_contract_amount: number | null;
  lh_main_end_date: string | null;
  lh_main_end_text: string | null;
  lh_mgmt_contract_amount: number | null;
  lh_mgmt_end_date: string | null;
  lh_mgmt_end_text: string | null;
  participants: Participant[];
  notes: string | null;
  // legacy single-amendment fields (kept for back-compat reads)
  contract_amount_change_date: string | null;
  contract_amount_new: number | null;
  end_date_change_date: string | null;
  end_date_new: string | null;
  original_contract_pdf_path: string | null;
  contract_change_pdf_path: string | null;
  end_date_change_pdf_path: string | null;
  suspension_pdf_path: string | null;
  agreement_pdf_path: string | null;
  participant_list_pdf_path: string | null;
  // new array fields
  amendments: Amendment[];
  suspensions: Suspension[];
};

type Unit = "won" | "k" | "m";

const uid = () => Math.random().toString(36).slice(2, 10);
const blankAmendment = (): Amendment => ({ id: uid(), change_date: "", contract_amount_new: null, end_date_new: "", pdf_path: null, note: "" });
const blankSuspension = (): Suspension => ({ id: uid(), suspension_date: "", suspension_reason: "", resume_date: "", suspension_pdf_path: null, resume_pdf_path: null });

const toDisplayDate = (iso?: string | null) => (!iso ? "" : iso.replace(/-/g, "."));
const toISODate = (display?: string | null) => (!display ? "" : display.replace(/\./g, "-"));
const formatDateInput = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
};
const inputToISO = (v: string) => {
  const f = formatDateInput(v);
  return f.length === 10 ? f.replace(/\./g, "-") : f;
};
const parseDate = (s?: string | null) => {
  const iso = toISODate(s);
  return iso ? new Date(iso + "T00:00:00") : null;
};
const diffDays = (a?: string | null, b?: string | null) => {
  const s = parseDate(a), e = parseDate(b);
  if (!s || !e || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
};
const monthsBetween = (a?: string | null, b?: Date | null) => {
  const s = parseDate(a); if (!s || !b) return 0;
  return (b.getFullYear() - s.getFullYear()) * 12 + (b.getMonth() - s.getMonth()) - (b.getDate() < s.getDate() ? 1 : 0);
};
const isCivilianLike = (r: OverlapRow) => {
  const name = (r.project_name || "").toLowerCase();
  const client = (r.client || "").toLowerCase();
  return name.includes("민간") || name.includes("유사용역") || client.includes("민간") || client.includes("유사용역");
};
const fmtDateCell = (iso?: string | null) => (iso ? toDisplayDate(iso) : "-");

// announcement date >= effective date → 변경값 적용
const isAfterOrEqual = (announcement: string | null | undefined, effective: string | null | undefined) => {
  if (!announcement || !effective) return false;
  return announcement >= effective;
};

const ABSOLUTE_MAX_DAYS = 365;
const isISODate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isDateLikeInput = (v: string) => /^[\d.\s-]*$/.test(v);
const isParticipantActive = (p: Participant, announce?: string | null) => {
  if (!announce) return true;
  if (p.start_date && p.start_date > announce) return false;
  // 참여제외일이 공고일 이전(또는 같음)이면 이미 제외된 상태 → 집계/표시 제외
  if (p.end_date && p.end_date <= announce) return false;
  return true;
};


const emptyForm = (): Omit<OverlapRow, "id"> => ({
  project_name: "", client: "", contract_amount: null,
  start_date: "", end_date: "", end_date_text: null,
  suspension_date: "", suspension_reason: "", agreement_date: "",
  absolute_period_days: null, participants: [], notes: "",
  contract_amount_change_date: "", contract_amount_new: null,
  end_date_change_date: "", end_date_new: "",
  original_contract_pdf_path: null, contract_change_pdf_path: null,
  end_date_change_pdf_path: null, suspension_pdf_path: null,
  agreement_pdf_path: null, participant_list_pdf_path: null,
  amendments: [], suspensions: [],
  is_lh: false,
  lh_main_contract_amount: null, lh_main_end_date: "", lh_main_end_text: null,
  lh_mgmt_contract_amount: null, lh_mgmt_end_date: "", lh_mgmt_end_text: null,
});

export default function Overlaps() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OverlapRow[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string; specialty: string | null; status: string; selected_association: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfExcludedIds, setPdfExcludedIds] = useState<Set<string>>(new Set());
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [announcementDate, setAnnouncementDate] = useState("");
  const [unit, setUnit] = useState<Unit>("won");
  const [useAbsolute, setUseAbsolute] = useState(false);
  const [selectedTech, setSelectedTech] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [printSeq, setPrintSeq] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // 시트탭: 진행중 / 준공
  type Sheet = "진행중" | "준공";
  const [sheet, setSheet] = useState<Sheet>("진행중");
  const [dragOverSheet, setDragOverSheet] = useState<Sheet | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const statusOf = (r: OverlapRow): Sheet => ((r as any).project_status === "준공" ? "준공" : "진행중");
  const moveToSheet = async (id: string, target: Sheet) => {
    const row = rows.find((r) => r.id === id);
    if (!row || statusOf(row) === target) return;
    setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, project_status: target } as any) : r)));
    const { error } = await (supabase as any).from("technician_overlaps").update({ project_status: target }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
    else toast.success(`"${row.project_name}" → ${target}`);
  };


  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OverlapRow | null>(null);
  const [form, setForm] = useState<Omit<OverlapRow, "id">>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const participantFileRef = useRef<HTMLInputElement>(null);

  const [techOpen, setTechOpen] = useState(false);
  const [techEditing, setTechEditing] = useState<{ id: string; name: string; specialty: string | null; status?: string; selected_association?: string } | null>(null);
  const [techForm, setTechForm] = useState<{ name: string; specialty: string; status: string }>({ name: "", specialty: "", status: "재직중" });
  const [techDeleteId, setTechDeleteId] = useState<string | null>(null);
  const [techSubmitting, setTechSubmitting] = useState(false);
  const [activeParticipantIdx, setActiveParticipantIdx] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, techRes] = await Promise.all([
      (supabase as any).from("technician_overlaps").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("technicians").select("id, name, specialty, status, selected_association").order("name"),
    ]);
    if (error) toast.error(error.message);
    else setRows((data || []).map((r: any) => {
      let amendments: Amendment[] = Array.isArray(r.amendments) ? r.amendments : [];
      let suspensions: Suspension[] = Array.isArray(r.suspensions) ? r.suspensions : [];
      // back-compat: legacy single fields -> arrays (only when no array data exists yet)
      if (amendments.length === 0 && (r.contract_amount_change_date || r.end_date_change_date || r.contract_change_pdf_path || r.end_date_change_pdf_path)) {
        amendments = [{
          id: uid(),
          change_date: r.contract_amount_change_date || r.end_date_change_date || "",
          contract_amount_new: r.contract_amount_new ?? null,
          end_date_new: r.end_date_new || "",
          pdf_path: r.contract_change_pdf_path || r.end_date_change_pdf_path || null,
          note: "",
        }];
      }
      if (suspensions.length === 0 && (r.suspension_date || r.suspension_pdf_path)) {
        suspensions = [{
          id: uid(),
          suspension_date: r.suspension_date || "",
          suspension_reason: r.suspension_reason || "",
          resume_date: "",
          suspension_pdf_path: r.suspension_pdf_path || null,
          resume_pdf_path: null,
        }];
      }
      return { ...r, participants: Array.isArray(r.participants) ? r.participants : [], amendments, suspensions };
    }));
    if (!techRes.error) setTechnicians(techRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: OverlapRow) => {
    setEditing(r);
    setForm({
      project_name: r.project_name || "",
      client: r.client || "",
      contract_amount: r.contract_amount,
      start_date: r.start_date || "",
      end_date: r.end_date || "",
      end_date_text: (r as any).end_date_text || null,
      suspension_date: r.suspension_date || "",
      suspension_reason: r.suspension_reason || "",
      agreement_date: r.agreement_date || "",
      absolute_period_days: r.absolute_period_days ?? null,
      participants: r.participants || [],
      notes: r.notes || "",
      contract_amount_change_date: r.contract_amount_change_date || "",
      contract_amount_new: r.contract_amount_new,
      end_date_change_date: r.end_date_change_date || "",
      end_date_new: r.end_date_new || "",
      original_contract_pdf_path: r.original_contract_pdf_path || null,
      contract_change_pdf_path: r.contract_change_pdf_path || null,
      end_date_change_pdf_path: r.end_date_change_pdf_path || null,
      suspension_pdf_path: r.suspension_pdf_path || null,
      agreement_pdf_path: r.agreement_pdf_path || null,
      participant_list_pdf_path: r.participant_list_pdf_path || null,
      amendments: (r.amendments || []).map(a => ({ ...a, id: a.id || uid() })),
      suspensions: (r.suspensions || []).map(s => ({ ...s, id: s.id || uid() })),
      is_lh: !!(r as any).is_lh,
      lh_main_contract_amount: (r as any).lh_main_contract_amount ?? null,
      lh_main_end_date: (r as any).lh_main_end_date || "",
      lh_main_end_text: (r as any).lh_main_end_text ?? null,
      lh_mgmt_contract_amount: (r as any).lh_mgmt_contract_amount ?? null,
      lh_mgmt_end_date: (r as any).lh_mgmt_end_date || "",
      lh_mgmt_end_text: (r as any).lh_mgmt_end_text ?? null,
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name) { toast.error("사업명은 필수입니다"); return; }
    setSubmitting(true);
    const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
    const cleanAmendments = (form.amendments || []).filter(a => a.change_date || a.contract_amount_new !== null || a.end_date_new || a.end_date_new_text || a.pdf_path);
    const cleanSuspensions = (form.suspensions || []).filter(s => s.suspension_date || s.resume_date || s.suspension_pdf_path || s.resume_pdf_path);
    const payload: any = {
      project_name: form.project_name,
      client: form.client || null,
      contract_amount: num(form.contract_amount),
      start_date: form.start_date || null,
      end_date: isISODate(form.end_date) ? form.end_date : null,
      end_date_text: form.end_date_text || (form.end_date && !isISODate(form.end_date) ? form.end_date : null),
      suspension_date: form.suspension_date || null,
      suspension_reason: form.suspension_reason || null,
      agreement_date: form.agreement_date || null,
      absolute_period_days: num(form.absolute_period_days),
      participants: form.participants || [],
      notes: form.notes || null,
      technician_name: null,
      contract_amount_change_date: form.contract_amount_change_date || null,
      contract_amount_new: num(form.contract_amount_new),
      end_date_change_date: form.end_date_change_date || null,
      end_date_new: form.end_date_new || null,
      original_contract_pdf_path: form.original_contract_pdf_path || null,
      contract_change_pdf_path: form.contract_change_pdf_path || null,
      end_date_change_pdf_path: form.end_date_change_pdf_path || null,
      suspension_pdf_path: form.suspension_pdf_path || null,
      agreement_pdf_path: form.agreement_pdf_path || null,
      participant_list_pdf_path: form.participant_list_pdf_path || null,
      amendments: cleanAmendments,
      suspensions: cleanSuspensions,
      is_lh: !!form.is_lh,
      lh_main_contract_amount: num(form.lh_main_contract_amount),
      lh_main_end_date: isISODate(form.lh_main_end_date) ? form.lh_main_end_date : null,
      lh_main_end_text: form.lh_main_end_text || (form.lh_main_end_date && !isISODate(form.lh_main_end_date) ? form.lh_main_end_date : null),
      lh_mgmt_contract_amount: num(form.lh_mgmt_contract_amount),
      lh_mgmt_end_date: isISODate(form.lh_mgmt_end_date) ? form.lh_mgmt_end_date : null,
      lh_mgmt_end_text: form.lh_mgmt_end_text || (form.lh_mgmt_end_date && !isISODate(form.lh_mgmt_end_date) ? form.lh_mgmt_end_date : null),
    };
    if (editing) {
      const { error } = await (supabase as any).from("technician_overlaps").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else { toast.success("수정 완료"); setOpen(false); load(); }
    } else {
      const { error } = await (supabase as any).from("technician_overlaps").insert({ ...payload, created_by: user.id });
      if (error) toast.error(error.message); else { toast.success("등록 완료"); setOpen(false); load(); }
    }
    setSubmitting(false);
  };


  const doDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from("technician_overlaps").delete().eq("id", deleteId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const openTechCreate = () => { setTechEditing(null); setTechForm({ name: "", specialty: "", status: "재직중" }); setTechOpen(true); };
  const openTechEdit = (t: { id: string; name: string; specialty: string | null; status?: string }) => {
    setTechEditing(t); setTechForm({ name: t.name, specialty: t.specialty || "", status: t.status || "재직중" }); setTechOpen(true);
  };
  const saveTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!techForm.name.trim()) { toast.error("이름은 필수입니다"); return; }
    setTechSubmitting(true);
    const payload: any = { name: techForm.name.trim(), specialty: techForm.specialty.trim() || null, status: techForm.status };
    if (techEditing) {
      const { error } = await (supabase as any).from("technicians").update(payload).eq("id", techEditing.id);
      if (error) toast.error(error.message); else { toast.success("수정 완료"); setTechOpen(false); load(); }
    } else {
      const { error } = await (supabase as any).from("technicians").insert({ ...payload, created_by: user.id });
      if (error) toast.error(error.message); else { toast.success("등록 완료"); setTechOpen(false); load(); }
    }
    setTechSubmitting(false);
  };
  const doTechDelete = async () => {
    if (!techDeleteId) return;
    const { error } = await (supabase as any).from("technicians").delete().eq("id", techDeleteId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setTechDeleteId(null);
  };

  const updateTechAssociation = async (techName: string, value: string) => {
    const t = technicians.find((x) => x.name === techName);
    if (!t) return;
    setTechnicians((prev) => prev.map((x) => x.id === t.id ? { ...x, selected_association: value } : x));
    const { error } = await (supabase as any).from("technicians").update({ selected_association: value }).eq("id", t.id);
    if (error) toast.error(error.message);
  };

  // ===== 공고일 기준 effective 값 (변경계약 다중 + 과업중지/재개 다중) =====
  const sortedAmendments = (r: OverlapRow) => {
    return (r.amendments || []).filter(a => a.change_date).slice().sort((a, b) => (a.change_date || "").localeCompare(b.change_date || ""));
  };
  const sortedSuspensions = (r: OverlapRow) => {
    return (r.suspensions || []).filter(s => s.suspension_date).slice().sort((a, b) => (a.suspension_date || "").localeCompare(b.suspension_date || ""));
  };
  // LH사업용 여유도 토글 ON + is_lh 인 경우, 본용역 값을 기준으로 사용
  const lhMainOverride = (r: OverlapRow) => useAbsolute && r.is_lh;
  const effectiveContract = (r: OverlapRow) => {
    if (lhMainOverride(r) && r.lh_main_contract_amount !== null && r.lh_main_contract_amount !== undefined) {
      return r.lh_main_contract_amount;
    }
    let v = r.contract_amount;
    for (const a of sortedAmendments(r)) {
      if (a.contract_amount_new === null || a.contract_amount_new === undefined) continue;
      if (isAfterOrEqual(announcementDate, a.change_date)) v = a.contract_amount_new;
    }
    return v;
  };
  // Returns the effective end date as {iso, text}. Free-text values ("준공시까지" 등)
  // are returned as text and signal that the end is open-ended.
  const effectiveEnd = (r: OverlapRow): { iso: string | null; text: string | null } => {
    if (lhMainOverride(r) && (r.lh_main_end_date || r.lh_main_end_text)) {
      return {
        iso: isISODate(r.lh_main_end_date) ? r.lh_main_end_date : null,
        text: r.lh_main_end_text || (r.lh_main_end_date && !isISODate(r.lh_main_end_date) ? r.lh_main_end_date : null),
      };
    }
    let v: { iso: string | null; text: string | null } = {
      iso: r.end_date || null,
      text: (r as any).end_date_text || null,
    };
    for (const a of sortedAmendments(r)) {
      const aIso = isISODate(a.end_date_new) ? a.end_date_new : null;
      const aText = a.end_date_new_text || (a.end_date_new && !isISODate(a.end_date_new) ? a.end_date_new : null);
      if (!aIso && !aText) continue;
      if (isAfterOrEqual(announcementDate, a.change_date)) v = { iso: aIso, text: aText };
    }
    return v;
  };
  const effectiveEndDate = (r: OverlapRow) => effectiveEnd(r).iso;
  const effectiveEndLabel = (r: OverlapRow) => {
    const e = effectiveEnd(r);
    return e.text || (e.iso ? toDisplayDate(e.iso) : "-");
  };
  // 공고일 기준 활성 중지 사이클
  const activeSuspensionAt = (r: OverlapRow): Suspension | null => {
    if (!announcementDate) return null;
    let active: Suspension | null = null;
    for (const s of sortedSuspensions(r)) {
      if (!isAfterOrEqual(announcementDate, s.suspension_date)) break;
      if (!s.resume_date || announcementDate < s.resume_date) active = s;
      else active = null;
    }
    return active;
  };
  const lastResumeBefore = (r: OverlapRow): string | null => {
    if (!announcementDate) return null;
    let last: string | null = null;
    for (const s of sortedSuspensions(r)) {
      if (s.resume_date && isAfterOrEqual(announcementDate, s.resume_date)) {
        if (!last || s.resume_date > last) last = s.resume_date;
      }
    }
    return last;
  };
  const effectiveSuspensionDate = (r: OverlapRow) => activeSuspensionAt(r)?.suspension_date || null;
  const effectiveAgreementDate = (r: OverlapRow) => {
    if (!r.agreement_date) return null;
    if (!isAfterOrEqual(announcementDate, r.agreement_date)) return null;
    return r.agreement_date;
  };

  // 과업중지 기간이 3개월 이상 지속된 이력이 있으면 true
  const hasLongSuspensionHistory = (r: OverlapRow) => {
    return (r.suspensions || []).some((s) => {
      if (!s.suspension_date) return false;
      const endRef = s.resume_date ? parseDate(s.resume_date) : new Date();
      const months = monthsBetween(s.suspension_date, endRef);
      return months >= 3;
    });
  };
  // 협의완료일이 등록되어 있거나, 3개월 이상 중지 이력이 있으면 중복금액 0원 예외
  const zeroByException = (r: OverlapRow): string | null => {
    if (r.agreement_date) return "협의완료";
    if (hasLongSuspensionHistory(r)) return "3개월이상 중지이력";
    return null;
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusOf(r) !== sheet) return false;
    const activeParticipants = (r.participants || []).filter((p) => isParticipantActive(p, announcementDate));
    const matchSearch = !search ||
      (r.project_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.client || "").toLowerCase().includes(search.toLowerCase()) ||
      activeParticipants.some((p) => (p.name || "").toLowerCase().includes(search.toLowerCase()));
    const matchTech = selectedTech === "__all__" ||
      activeParticipants.some((p) => (p.name || "") === selectedTech);
    return matchSearch && matchTech;
  }).sort((a, b) => {
    // 착수일자 오름차순 정렬 (없는 건 뒤로)
    const sa = a.start_date || "9999-99-99";
    const sb = b.start_date || "9999-99-99";
    return sa.localeCompare(sb);
  }), [rows, search, selectedTech, announcementDate, sheet]);


  // 공고일 기준 준공일 경과 여부 (과업중지/협의완료/텍스트형 준공일은 경고 제외)
  const isOverdueByAnnouncement = (r: OverlapRow) => {
    if (!announcementDate) return false;
    if (activeSuspensionAt(r)) return false;
    if (effectiveAgreementDate(r)) return false;
    const e = effectiveEnd(r);
    if (!e.iso) return false;
    return announcementDate > e.iso;
  };

  const totalPeriod = (r: OverlapRow) => {
    if (useAbsolute && r.absolute_period_days) return r.absolute_period_days;
    const e = effectiveEnd(r);
    if (e.iso) return diffDays(r.start_date, e.iso);
    // 텍스트 준공예정일 → 절대공기 최대값(365일)
    return ABSOLUTE_MAX_DAYS;
  };

  const remainInfo = (r: OverlapRow): { days: number | null; suspendedLong: boolean; agreed: boolean } => {
    const agree = effectiveAgreementDate(r);
    if (agree) return { days: null, suspendedLong: false, agreed: true };
    const susp = effectiveSuspensionDate(r);
    const e = effectiveEnd(r);
    const endIso = e.iso;
    if (susp) {
      const months = monthsBetween(susp, new Date());
      if (months >= 3) return { days: null, suspendedLong: true, agreed: false };
      if (!endIso) return { days: ABSOLUTE_MAX_DAYS, suspendedLong: false, agreed: false };
      const d = diffDays(susp, endIso);
      return { days: Math.min(ABSOLUTE_MAX_DAYS, d), suspendedLong: false, agreed: false };
    }
    if (!announcementDate) return { days: 0, suspendedLong: false, agreed: false };
    if (!endIso) {
      // 텍스트 준공예정일 → 잔여일수는 절대공기 최대값(365일)
      return { days: ABSOLUTE_MAX_DAYS, suspendedLong: false, agreed: false };
    }
    const resume = lastResumeBefore(r);
    if (resume) {
      // 과업재개된 건 → 재개 이후 변경계약(준공일)을 기준으로 잔여일수 산정
      const postResume = sortedAmendments(r).filter(a => isAfterOrEqual(a.change_date, resume) && (isISODate(a.end_date_new) || a.end_date_new_text));
      const applied = postResume.filter(a => isAfterOrEqual(announcementDate, a.change_date));
      const pick = (applied.length ? applied[applied.length - 1] : postResume[0]) || null;
      let targetEnd: string | null = endIso;
      if (pick) {
        if (isISODate(pick.end_date_new)) targetEnd = pick.end_date_new;
        else return { days: ABSOLUTE_MAX_DAYS, suspendedLong: false, agreed: false };
      }
      const base = announcementDate > resume ? announcementDate : resume;
      if (!targetEnd) return { days: ABSOLUTE_MAX_DAYS, suspendedLong: false, agreed: false };
      return { days: Math.min(ABSOLUTE_MAX_DAYS, diffDays(base, targetEnd)), suspendedLong: false, agreed: false };
    }
    return { days: Math.min(ABSOLUTE_MAX_DAYS, diffDays(announcementDate, endIso)), suspendedLong: false, agreed: false };

  };



  const roundedContractAmount = (v: number | null) => {
    if (v === null || v === undefined) return 0;
    const n = Number(v);
    if (unit === "m") return Math.round(n / 1_000_000) * 1_000_000;
    if (unit === "k") return Math.round(n / 1_000) * 1_000;
    return n;
  };

  const overlapAmount = (r: OverlapRow): { value: number | null; label?: string } => {
    if (selectedTech !== "__all__") {
      const me = (r.participants || []).find((p) => (p.name || "") === selectedTech);
      if (me?.excluded) return { value: 0, label: "0 (참여제외)" };
    }
    const exc = zeroByException(r);
    if (exc) return { value: 0, label: `0 (${exc})` };
    const info = remainInfo(r);
    if (info.agreed) return { value: 0, label: "0 (협의완료)" };
    if (info.suspendedLong) return { value: 0, label: "0 (3개월이상 중지중)" };
    const t = totalPeriod(r);
    const contract = roundedContractAmount(effectiveContract(r));
    if (!t || !contract || info.days === null) return { value: 0 };
    return { value: contract * (info.days / t) / 10 };
  };

  const fmtContract = (v: number | null) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (unit === "m") return Math.round(n / 1_000_000).toLocaleString();
    if (unit === "k") return Math.round(n / 1_000).toLocaleString();
    return n.toLocaleString();
  };
  const fmtOverlap = (v: number) => {
    if (!v) return "0";
    if (unit === "m") return (Math.round((v / 1_000_000) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (unit === "k") return Math.round(v / 1_000).toLocaleString();
    return Math.round(v).toLocaleString();
  };

  const totalOverlap = useMemo(() => filtered
    .filter((r) => !pdfExcludedIds.has(r.id))
    .reduce((acc, r) => acc + (overlapAmount(r).value || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, announcementDate, useAbsolute, unit, pdfExcludedIds]);

  const addParticipant = () => setForm({ ...form, participants: [...(form.participants || []), { name: "", role: "", start_date: "", end_date: "" }] });
  const updateParticipant = (i: number, patch: Partial<Participant>) => {
    const next = [...(form.participants || [])];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, participants: next });
  };
  const removeParticipant = (i: number) => {
    setForm({ ...form, participants: (form.participants || []).filter((_, idx) => idx !== i) });
  };

  // Excel 일괄 추가
  const handleParticipantExcel = async (file: File | null) => {
    if (!file) return;
    try {
      const data = await importFromExcel<Record<string, any>>(file);
      const findKey = (row: Record<string, any>, keys: string[]) => {
        for (const k of Object.keys(row)) {
          const norm = String(k).replace(/\s+/g, "").toLowerCase();
          if (keys.some((target) => norm.includes(target))) return row[k];
        }
        return null;
      };
      const toIsoFromCell = (val: any): string => {
        if (val === null || val === undefined || val === "") return "";
        if (typeof val === "number") {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
          return "";
        }
        const s = String(val).trim();
        if (!s) return "";
        const m = s.match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/);
        if (m) {
          const y = m[1];
          const mo = m[2].padStart(2, "0");
          const d = m[3].padStart(2, "0");
          return `${y}-${mo}-${d}`;
        }
        return inputToISO(s);
      };
      const parsed: Participant[] = data
        .map((row) => {
          const name = String(findKey(row, ["성명", "이름", "name"]) ?? "").trim().replace(/\s+/g, "");
          const role = String(findKey(row, ["역할", "직책", "직위", "role"]) ?? "").trim();
          const startRaw = findKey(row, ["참여시작일", "시작일", "startdate", "start"]);
          const endRaw = findKey(row, ["참여제외일", "제외일", "종료일", "enddate", "end"]);
          const start_date = toIsoFromCell(startRaw);
          const end_date = toIsoFromCell(endRaw);
          return { name, role: role || undefined, start_date: start_date || "", end_date: end_date || "" };
        })
        .filter((p) => p.name);
      if (parsed.length === 0) { toast.error("엑셀에서 인력을 찾을 수 없습니다 (성명 컬럼 필요)"); return; }
      const existingNames = new Set((form.participants || []).map((p) => p.name));
      const merged = [...(form.participants || [])];
      let added = 0;
      for (const p of parsed) {
        if (!existingNames.has(p.name)) { merged.push(p); existingNames.add(p.name); added += 1; }
      }
      setForm({ ...form, participants: merged });
      toast.success(`${added}명 추가됨 (중복 ${parsed.length - added}명 제외)`);
    } catch (err: any) {
      toast.error("엑셀 읽기 실패: " + (err?.message || ""));
    } finally {
      if (participantFileRef.current) participantFileRef.current.value = "";
    }
  };

  const techOverlapTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (pdfExcludedIds.has(r.id)) continue;
      const v = overlapAmount(r).value || 0;
      if (!v) continue;
      for (const p of (r.participants || []).filter((pp) => !pp.excluded && isParticipantActive(pp, announcementDate))) {
        const name = (p.name || "").trim();
        if (!name) continue;
        map.set(name, (map.get(name) || 0) + v);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, announcementDate, useAbsolute, unit, pdfExcludedIds]);

  // ===== PDF 업로드/다운로드/병합 & 엑셀 추출 =====
  const PDF_FIELDS: { key: keyof OverlapRow; label: string }[] = [
    { key: "original_contract_pdf_path", label: "당초 계약서" },
    { key: "agreement_pdf_path", label: "협의완료 공문" },
  ];


  const uploadPdfRaw = async (file: File, fieldKey: string): Promise<string | null> => {
    if (!user) return null;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("PDF 파일만 업로드 가능합니다"); return null;
    }
    setUploadingField(fieldKey);
    const path = `${user.id}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("overlap-documents").upload(path, file, { contentType: "application/pdf" });
    setUploadingField(null);
    if (error) { toast.error(error.message); return null; }
    toast.success("업로드 완료");
    return path;
  };
  const uploadPdf = async (field: keyof OverlapRow, file: File) => {
    const path = await uploadPdfRaw(file, String(field));
    if (path) setForm((f) => ({ ...f, [field]: path }));
  };
  const uploadAmendmentPdf = async (idx: number, file: File) => {
    const path = await uploadPdfRaw(file, `amendment-${idx}`);
    if (!path) return;
    setForm((f) => {
      const next = [...(f.amendments || [])]; next[idx] = { ...next[idx], pdf_path: path };
      return { ...f, amendments: next };
    });
  };
  const uploadSuspensionPdf = async (idx: number, kind: "suspension" | "resume", file: File) => {
    const path = await uploadPdfRaw(file, `suspension-${idx}-${kind}`);
    if (!path) return;
    setForm((f) => {
      const next = [...(f.suspensions || [])];
      next[idx] = { ...next[idx], [kind === "suspension" ? "suspension_pdf_path" : "resume_pdf_path"]: path };
      return { ...f, suspensions: next };
    });
  };


  const downloadPdf = async (path: string) => {
    const { data, error } = await supabase.storage.from("overlap-documents").download(path);
    if (error || !data) { toast.error("다운로드 실패"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = path.split("/").pop() || "file.pdf"; a.click();
    URL.revokeObjectURL(url);
  };

  const fetchPdfBytes = async (path: string): Promise<Uint8Array | null> => {
    const { data, error } = await supabase.storage.from("overlap-documents").download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  };

  const sortedForExport = useMemo(() => {
    return [...filtered].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }, [filtered]);

  const sortedForPdf = useMemo(
    () => sortedForExport.filter((r) => !pdfExcludedIds.has(r.id)),
    [sortedForExport, pdfExcludedIds]
  );

  const togglePdfInclude = (id: string) => setPdfExcludedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allPdfChecked = filtered.length > 0 && filtered.every((r) => !pdfExcludedIds.has(r.id));
  const toggleAllPdf = () => setPdfExcludedIds(allPdfChecked ? new Set(filtered.map((r) => r.id)) : new Set());

  const mergeProofPdfs = async (includeParticipantList: boolean) => {
    setDownloadingPdf(true);
    try {
      const { StandardFonts, rgb } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      const font = await merged.embedFont(StandardFonts.HelveticaBold);
      let added = 0;
      let seq = 0;
      for (const r of sortedForPdf) {
        const paths: string[] = [];
        if (r.original_contract_pdf_path) paths.push(r.original_contract_pdf_path); // 원계약서는 항상 포함
        // 변경계약 PDF — 공고일 기준 최종(가장 최근) 변경계약 1건만 포함
        const effAmendments = sortedAmendments(r).filter(
          (a) => a.pdf_path && (!announcementDate || isAfterOrEqual(announcementDate, a.change_date))
        );
        const lastAmendment = effAmendments[effAmendments.length - 1];
        if (lastAmendment?.pdf_path) paths.push(lastAmendment.pdf_path);
        // 과업중지/재개 PDF — 공고일 이전(≤) 발생분, 단 재개된 건은 중지공문 제외
        for (const s of sortedSuspensions(r)) {
          const resumedBefore = !!s.resume_date && (!announcementDate || isAfterOrEqual(announcementDate, s.resume_date));
          if (!resumedBefore && s.suspension_pdf_path && (!announcementDate || isAfterOrEqual(announcementDate, s.suspension_date))) {
            paths.push(s.suspension_pdf_path);
          }
          if (s.resume_pdf_path && resumedBefore) {
            paths.push(s.resume_pdf_path);
          }
        }
        // 협의완료 공문 — 공고일 이전(≤)만
        if (r.agreement_pdf_path && (!announcementDate || isAfterOrEqual(announcementDate, r.agreement_date))) {
          paths.push(r.agreement_pdf_path);
        }
        // legacy single fields (배열 데이터가 없는 구 데이터에만 적용)
        if ((r.amendments || []).length === 0 && (r.suspensions || []).length === 0) {
          for (const f of PDF_FIELDS.slice(1)) {
            const p = r[f.key] as string | null;
            if (p && !paths.includes(p)) paths.push(p);
          }
        }
        if (includeParticipantList && r.participant_list_pdf_path) paths.push(r.participant_list_pdf_path);
        if (paths.length === 0) continue;
        seq += 1;
        let isFirstPageOfProject = true;
        for (const p of paths) {
          const bytes = await fetchPdfBytes(p);
          if (!bytes) continue;
          try {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((pg, idx) => {
              merged.addPage(pg);
              if (printSeq && isFirstPageOfProject && idx === 0) {
                const { height } = pg.getSize();
                pg.drawText(`${seq}`, { x: 20, y: height - 50, size: 40, font, color: rgb(0, 0, 0) });
              }
            });
            isFirstPageOfProject = false;
            added += 1;
          } catch { /* skip */ }
        }
      }
      if (added === 0) { toast.error("병합할 PDF가 없습니다"); return; }
      const out = await merged.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const tech = selectedTech !== "__all__" ? `_${selectedTech}` : "";
      a.href = url; a.download = `업무중첩도_증빙${includeParticipantList ? "+참여자명단" : ""}${tech}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${added}개 PDF 병합 완료`);
    } catch (e: any) {
      toast.error("병합 실패: " + (e?.message || ""));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const exportOverlapExcel = () => {
    if (sortedForExport.length === 0) { toast.error("내보낼 데이터가 없습니다"); return; }
    const data = sortedForExport.map((r, i) => {
      const info = remainInfo(r);
      const o = overlapAmount(r);
      const eEnd = effectiveEndDate(r);
      const eEndLabel = effectiveEndLabel(r);
      const eContract = effectiveContract(r);
      return {
        연번: i + 1,
        사업명: r.project_name,
        발주처: r.client || "",
        계약금액: eContract ?? "",
        착수일: r.start_date || "",
        준공예정일: eEndLabel === "-" ? "" : eEndLabel,
        "총계약기간(일)": useAbsolute && r.absolute_period_days ? r.absolute_period_days : (eEnd ? diffDays(r.start_date, eEnd) : totalPeriod(r)),
        "잔여일수(일)": info.agreed || info.suspendedLong ? "" : (info.days ?? ""),
        중복금액: o.label ?? (o.value === null ? "" : o.value),
        과업중지일: effectiveSuspensionDate(r) || "",
        중지사유: r.suspension_reason || "",
        협의완료일: effectiveAgreementDate(r) || "",
        참여인력: (r.participants || []).filter((p) => isParticipantActive(p, announcementDate)).map((p) => p.role ? `${p.name}(${p.role})` : p.name).join(", "),
        역할: selectedTech !== "__all__"
          ? ((r.participants || []).find((p) => (p.name || "") === selectedTech && isParticipantActive(p, announcementDate))?.role || "")
          : (r.participants || []).filter((p) => isParticipantActive(p, announcementDate)).map((p) => p.role || "").join(", "),
        비고: r.notes || "",
      };
    });
    const tech = selectedTech !== "__all__" ? `_${selectedTech}` : "";
    exportToExcel(data, `업무중첩도${tech}`);
  };



  return (
    <AppLayout title="PQ 기술자별 업무중첩도 관리">
      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="projects">사업명 입력</TabsTrigger>
          <TabsTrigger value="technicians">기술자 관리</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-4 mt-0">
        <Card className="p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="검색 (사업명/발주처/참여인력)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">공고일</Label>
              <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(announcementDate)} onChange={(e) => setAnnouncementDate(inputToISO(e.target.value))} className="w-[140px]" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9"><CalendarIcon className="h-4 w-4" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={announcementDate ? new Date(announcementDate + "T00:00:00") : undefined}
                    onSelect={(date) => { if (date) setAnnouncementDate(format(date, "yyyy-MM-dd")); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">금액단위</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="won">원</SelectItem>
                  <SelectItem value="k">천원</SelectItem>
                  <SelectItem value="m">백만원</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="absolute" checked={useAbsolute} onCheckedChange={(v) => setUseAbsolute(!!v)} />
              <Label htmlFor="absolute" className="text-sm cursor-pointer whitespace-nowrap">LH사업용 여유도</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">기술자</Label>
              <Popover open={techPickerOpen} onOpenChange={setTechPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[160px] justify-between font-normal">
                    <span className="truncate">{selectedTech === "__all__" ? "전체" : selectedTech}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="기술자 이름 검색..." />
                    <CommandList>
                      <CommandEmpty>결과 없음</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="전체" onSelect={() => { setSelectedTech("__all__"); setTechPickerOpen(false); }}>전체</CommandItem>
                        {technicians.map((t) => (
                          <CommandItem key={t.id} value={t.name} onSelect={() => { setSelectedTech(t.name); setTechPickerOpen(false); }}>
                            {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Checkbox id="printseq" checked={printSeq} onCheckedChange={(v) => setPrintSeq(!!v)} />
              <Label htmlFor="printseq" className="text-sm cursor-pointer whitespace-nowrap">PDF 병합시 연번 표시(착수일 오름차순, 첫장 좌측상단)</Label>
            </div>
            <Button size="sm" variant="outline" onClick={exportOverlapExcel}>
              <FileDown className="h-4 w-4 mr-1" />엑셀 추출
            </Button>
            <Button size="sm" variant="outline" onClick={() => mergeProofPdfs(false)} disabled={downloadingPdf}>
              {downloadingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}증빙PDF 병합
            </Button>
            <Button size="sm" variant="outline" onClick={() => mergeProofPdfs(true)} disabled={downloadingPdf}>
              {downloadingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}증빙+참여자명단 PDF
            </Button>
          </div>
          {selectedTech !== "__all__" && (
            <div className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedTech}</span> 기술자 중복금액 합계:{" "}
              <span className="font-semibold text-primary">{fmtOverlap(totalOverlap)}</span>
              <span className="ml-1 text-xs">({filtered.filter((r) => !pdfExcludedIds.has(r.id)).length}건)</span>
            </div>
          )}

        </Card>


        {/* 시트탭 (엑셀 스타일) — 사업을 끌어다 놓아 이동 */}
        <div className="flex items-end gap-1 -mb-2 px-1">
          {(["진행중", "준공"] as const).map((s) => {
            const count = rows.filter((r) => statusOf(r) === s).length;
            const active = sheet === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSheet(s)}
                onDragOver={(e) => { e.preventDefault(); setDragOverSheet(s); }}
                onDragLeave={() => setDragOverSheet((p) => (p === s ? null : p))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSheet(null);
                  const id = e.dataTransfer.getData("text/plain") || draggingIdRef.current;
                  if (id) moveToSheet(id, s);
                }}
                className={`px-4 py-1.5 text-xs md:text-sm rounded-t-md border border-b-0 transition-colors ${
                  active ? "bg-card font-semibold text-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                } ${dragOverSheet === s ? "ring-2 ring-primary ring-offset-1 bg-primary/10" : ""}`}
              >
                {s} <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
          <span className="ml-2 pb-1 text-[10px] text-muted-foreground hidden md:inline">사업 행을 끌어서 탭에 놓으면 이동됩니다</span>
        </div>

        {/* Desktop table */}
        <Card className="shadow-card overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <Table className="text-[10px] lg:text-[11px] xl:text-xs [&_th]:px-1.5 [&_th]:py-2 [&_td]:px-1.5 [&_td]:py-1.5 [&_th]:h-auto">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[32px]">
                    <Checkbox checked={allPdfChecked} onCheckedChange={() => toggleAllPdf()} aria-label="전체 선택" />
                  </TableHead>
                  <TableHead className="w-[120px] lg:w-[150px] xl:w-[180px]">사업명</TableHead>
                  <TableHead className="w-[80px] lg:w-[100px] xl:w-[120px]">발주처</TableHead>
                  <TableHead className="text-right w-[70px] lg:w-[80px]">계약금액</TableHead>
                  <TableHead className="w-[72px]">착수일</TableHead>
                  <TableHead className="w-[72px]">준공<br/>예정일</TableHead>
                  <TableHead className="text-right w-[56px]">총<br/>계약기간</TableHead>
                  <TableHead className="text-right w-[56px]">잔여<br/>일수</TableHead>
                  <TableHead className="text-right w-[70px] lg:w-[80px]">중복금액</TableHead>
                  <TableHead className="w-[72px]">과업<br/>중지일</TableHead>
                  <TableHead className="w-[72px]">협의<br/>완료일</TableHead>
                  <TableHead className="w-[110px]">비고</TableHead>
                  <TableHead className="text-right w-[72px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>

                ) : filtered.map((r) => {
                  const info = remainInfo(r);
                  const o = overlapAmount(r);
                  const remainText = info.agreed || info.suspendedLong ? "-" : (info.days === null ? "-" : info.days.toLocaleString() + "일");
                  const overlapText = o.label ?? (o.value === null ? "-" : fmtOverlap(o.value));
                  const eEnd = effectiveEndDate(r);
                  const eEndLabel = effectiveEndLabel(r);
                  const eContract = effectiveContract(r);
                  const contractDays = eEnd ? diffDays(r.start_date, eEnd) : (r.end_date_text ? ABSOLUTE_MAX_DAYS : 0);
                  const absoluteApplied = useAbsolute && (r.is_lh || !!r.absolute_period_days);
                  const susp = effectiveSuspensionDate(r);
                  const agree = effectiveAgreementDate(r);
                  return (
                  <TableRow key={r.id} draggable onDragStart={(e) => { draggingIdRef.current = r.id; e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { draggingIdRef.current = null; }} className={`cursor-pointer hover:bg-muted/30 ${isCivilianLike(r) ? "bg-green-50" : ""} ${pdfExcludedIds.has(r.id) ? "opacity-60" : ""}`} onClick={() => openEdit(r)}>
                    <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!pdfExcludedIds.has(r.id)} onCheckedChange={() => togglePdfInclude(r.id)} aria-label="PDF 병합 포함" />
                    </TableCell>
                    <TableCell className="font-medium break-words whitespace-normal align-top"><span className="line-clamp-3">{r.project_name}</span></TableCell>
                    <TableCell className="break-words whitespace-normal align-top"><span className="line-clamp-3">{r.client || "-"}</span></TableCell>
                    <TableCell className="text-right align-top">
                      <span className="break-all">{fmtContract(eContract)}</span>
                      {eContract !== r.contract_amount && <span className="block text-[9px] text-orange-600">(변경)</span>}
                    </TableCell>
                    <TableCell className="align-top">{fmtDateCell(r.start_date)}</TableCell>
                    <TableCell className="align-top">
                      <span className="break-all">{eEndLabel}</span>
                      {(eEnd !== r.end_date || (effectiveEnd(r).text && effectiveEnd(r).text !== r.end_date_text)) && <span className="block text-[9px] text-orange-600">(변경)</span>}
                      {isOverdueByAnnouncement(r) && (
                        <span className="mt-0.5 inline-block px-1 py-0.5 text-[9px] bg-red-600 text-white rounded" title="공고일 기준 준공일이 경과되었습니다">⚠경과</span>
                      )}
                    </TableCell>
                    <TableCell className={"text-right align-top" + (useAbsolute && r.absolute_period_days ? " text-red-600 font-bold" : "")}>{useAbsolute && r.absolute_period_days ? r.absolute_period_days.toLocaleString() + "일" : (contractDays ? contractDays.toLocaleString() + "일" : "-")}</TableCell>
                    <TableCell className="text-right align-top">{remainText}</TableCell>
                    <TableCell className={"text-right align-top" + (absoluteApplied ? " text-red-600 font-semibold" : "")}><span className="break-all">{overlapText}</span></TableCell>
                    <TableCell className="align-top">{fmtDateCell(susp)}</TableCell>
                    <TableCell className="align-top">{fmtDateCell(agree)}</TableCell>
                    <TableCell className="align-top break-words whitespace-normal"><span className="line-clamp-3">{r.notes || "-"}</span></TableCell>
                    <TableCell className="text-right align-top" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>

        {/* Mobile cards */}
        <Card className="shadow-card md:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">데이터가 없습니다.</div>
          ) : filtered.map((r) => {
            const info = remainInfo(r);
            const o = overlapAmount(r);
            const remainText = info.agreed || info.suspendedLong ? "-" : (info.days === null ? "-" : info.days.toLocaleString() + "일");
            const overlapText = o.label ?? (o.value === null ? "-" : fmtOverlap(o.value));
            const eEnd = effectiveEndDate(r);
            const eContract = effectiveContract(r);
            const susp = effectiveSuspensionDate(r);
            const agree = effectiveAgreementDate(r);
            const isOpen = !!expanded[r.id];
            return (
              <div key={r.id} draggable onDragStart={(e) => { draggingIdRef.current = r.id; e.dataTransfer.setData("text/plain", r.id); }} onDragEnd={() => { draggingIdRef.current = null; }} className={`border rounded-md ${isCivilianLike(r) ? "bg-green-50" : "bg-card"} ${pdfExcludedIds.has(r.id) ? "opacity-60" : ""}`}>
                <div className="flex items-start">
                  <div className="pl-3 pt-3.5">
                    <Checkbox checked={!pdfExcludedIds.has(r.id)} onCheckedChange={() => togglePdfInclude(r.id)} aria-label="PDF 병합 포함" />
                  </div>
                <button type="button" onClick={() => toggleExpand(r.id)} className="w-full flex items-start gap-2 p-3 text-left">
                  {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{r.project_name}</div>
                    <div className="mt-1 text-xs">
                      <span className="text-muted-foreground">중복금액 </span>
                      <span className="font-semibold text-primary">{overlapText}</span>
                    </div>
                  </div>
                </button>
                </div>



                {isOpen && (
                  <div className="px-3 pb-3 space-y-1.5 text-xs">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className="text-muted-foreground">발주처</div><div>{r.client || "-"}</div>
                      <div className="text-muted-foreground">계약금액</div>
                      <div>{fmtContract(eContract)}{eContract !== r.contract_amount && <span className="ml-1 text-orange-600">(변경)</span>}</div>
                      <div className="text-muted-foreground">착수일</div><div>{fmtDateCell(r.start_date)}</div>
                      <div className="text-muted-foreground">준공예정일</div>
                      <div>
                        {effectiveEndLabel(r)}
                        {(eEnd !== r.end_date) && <span className="ml-1 text-orange-600">(변경)</span>}
                        {isOverdueByAnnouncement(r) && (
                          <span className="ml-1 inline-block px-1 py-0.5 text-[10px] bg-red-600 text-white rounded">⚠ 경과</span>
                        )}
                      </div>
                      <div className="text-muted-foreground">잔여일수</div><div>{remainText}</div>
                      <div className="text-muted-foreground">과업중지일</div><div>{fmtDateCell(susp)}{susp && r.suspension_reason ? ` (${r.suspension_reason})` : ""}</div>
                      <div className="text-muted-foreground">협의완료일</div><div>{fmtDateCell(agree)}</div>
                      {r.notes && (<><div className="text-muted-foreground">비고</div><div className="truncate">{r.notes}</div></>)}
                    </div>
                    <div className="flex justify-end gap-1 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => moveToSheet(r.id, sheet === "진행중" ? "준공" : "진행중")}>
                        {sheet === "진행중" ? "준공으로 이동" : "진행중으로 이동"}
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1" />수정</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="px-1 py-1 text-xs text-muted-foreground">총 {filtered.length}건</div>
        </Card>
        </TabsContent>

        <TabsContent value="technicians" className="space-y-4 mt-0">
          <Card className="p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">공고일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(announcementDate)} onChange={(e) => setAnnouncementDate(inputToISO(e.target.value))} className="w-[140px]" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">금액단위</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="won">원</SelectItem>
                    <SelectItem value="k">천원</SelectItem>
                    <SelectItem value="m">백만원</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="absolute-tech" checked={useAbsolute} onCheckedChange={(v) => setUseAbsolute(!!v)} />
                <Label htmlFor="absolute-tech" className="text-sm cursor-pointer whitespace-nowrap">LH사업용 여유도</Label>
              </div>
              <div className="ml-auto">
                <Button size="sm" onClick={openTechCreate}><Plus className="mr-1 h-4 w-4" />기술자 등록</Button>
              </div>
            </div>
          </Card>
          <Card className="shadow-card p-3">
            {technicians.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">등록된 기술자가 없습니다.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {technicians.map((t) => {
                  const total = techOverlapTotals.get(t.name) || 0;
                  const status = t.status || "재직중";
                  const statusClass = status === "재직중"
                    ? "bg-green-100 text-green-700"
                    : status === "퇴사자"
                    ? "bg-gray-200 text-gray-700"
                    : "bg-blue-100 text-blue-700";
                  return (
                    <div
                      key={t.id}
                      className={`relative rounded-lg border p-3 transition-shadow hover:shadow-md ${total >= 250_000_000 ? "bg-blue-50/60 border-blue-300" : "bg-card"}`}
                    >
                      <div className="absolute top-2 right-2 flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openTechEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTechDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                      <div className="pr-14">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-base leading-tight">{t.name}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${statusClass}`}>{status}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">{t.specialty || "전문분야 미지정"}</div>
                      </div>
                      <div className={`mt-3 rounded-md px-2 py-1.5 flex items-baseline justify-between ${total >= 250_000_000 ? "bg-blue-100 text-blue-800" : "bg-amber-50 text-amber-800"}`}>
                        <span className="text-[10px] font-medium">중복금액</span>
                        <span className="text-sm font-bold tabular-nums">
                          {fmtOverlap(total)}
                          <span className="ml-0.5 text-[10px] font-normal opacity-70">{unit === "m" ? "백만원" : unit === "k" ? "천원" : "원"}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-1 pt-3 text-xs text-muted-foreground">총 {technicians.length}명{!announcementDate && " · 공고일을 입력하면 중복금액이 계산됩니다."}</div>
          </Card>
        </TabsContent>
      </Tabs>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0"><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3 overflow-y-auto px-6 pb-2 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>사업명 <span className="text-destructive">*</span></Label>
                <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>발주처</Label>
                <Input value={form.client || ""} onChange={(e) => setForm({ ...form, client: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>계약금액 (원)</Label>
                <Input type="text" inputMode="numeric" value={form.contract_amount !== null && form.contract_amount !== undefined ? Number(form.contract_amount).toLocaleString() : ""} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm({ ...form, contract_amount: v === "" ? null : Number(v) }); }} />
              </div>
              <div className="space-y-1.5">
                <Label>착수일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.start_date)} onChange={(e) => setForm({ ...form, start_date: inputToISO(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>준공예정일</Label>
                <Input
                  type="text"
                  placeholder='YYYY.MM.DD 또는 "준공시까지" 등 자유 입력'
                  value={form.end_date_text ?? toDisplayDate(form.end_date)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isDateLikeInput(v)) {
                      const iso = inputToISO(v);
                      setForm({ ...form, end_date: iso, end_date_text: null });
                    } else {
                      setForm({ ...form, end_date: "", end_date_text: v });
                    }
                  }}
                />
                <div className="text-[11px] text-muted-foreground">텍스트(예: "준공시까지") 입력 시 잔여일수/총공기는 절대공기 최대값(365일)으로 산정됩니다.</div>
              </div>
              <div className="space-y-1.5">
                <Label>절대공기일수 (일)</Label>
                <Input type="number" value={form.absolute_period_days ?? ""} onChange={(e) => setForm({ ...form, absolute_period_days: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </div>

            {/* LH 본용역 / 관리용역 */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="is_lh" checked={!!form.is_lh} onCheckedChange={(v) => setForm({ ...form, is_lh: !!v })} />
                <Label htmlFor="is_lh" className="text-sm font-semibold cursor-pointer">LH 본용역 / 관리용역 사업</Label>
                <span className="text-[11px] text-muted-foreground">상단 "LH사업용 여유도" 체크 시 본용역 준공일·계약금액 기준으로 계산됩니다.</span>
              </div>
              {form.is_lh && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1.5">
                    <Label>본용역 계약금액 (원)</Label>
                    <Input type="text" inputMode="numeric"
                      value={form.lh_main_contract_amount !== null && form.lh_main_contract_amount !== undefined ? Number(form.lh_main_contract_amount).toLocaleString() : ""}
                      onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm({ ...form, lh_main_contract_amount: v === "" ? null : Number(v) }); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>본용역 준공예정일</Label>
                    <Input type="text" placeholder='YYYY.MM.DD 또는 "준공시까지" 등'
                      value={form.lh_main_end_text ?? toDisplayDate(form.lh_main_end_date)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isDateLikeInput(v)) setForm({ ...form, lh_main_end_date: inputToISO(v), lh_main_end_text: null });
                        else setForm({ ...form, lh_main_end_date: "", lh_main_end_text: v });
                      }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>관리용역 계약금액 (원)</Label>
                    <Input type="text" inputMode="numeric"
                      value={form.lh_mgmt_contract_amount !== null && form.lh_mgmt_contract_amount !== undefined ? Number(form.lh_mgmt_contract_amount).toLocaleString() : ""}
                      onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm({ ...form, lh_mgmt_contract_amount: v === "" ? null : Number(v) }); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>관리용역 준공예정일</Label>
                    <Input type="text" placeholder='YYYY.MM.DD 또는 "준공시까지" 등'
                      value={form.lh_mgmt_end_text ?? toDisplayDate(form.lh_mgmt_end_date)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isDateLikeInput(v)) setForm({ ...form, lh_mgmt_end_date: inputToISO(v), lh_mgmt_end_text: null });
                        else setForm({ ...form, lh_mgmt_end_date: "", lh_mgmt_end_text: v });
                      }} />
                  </div>
                </div>
              )}
            </div>


            {/* 변경계약 (다중) - PDF 인라인 */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-semibold">변경계약 이력 <span className="text-xs font-normal text-muted-foreground">(공고일 ≥ 변경일일 때만 반영)</span></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, amendments: [...(form.amendments || []), blankAmendment()] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />변경계약 추가
                </Button>
              </div>
              {(form.amendments || []).length === 0 && (
                <div className="text-xs text-muted-foreground">등록된 변경계약이 없습니다.</div>
              )}
              {(form.amendments || []).map((a, i) => {
                const pdfFileName = a.pdf_path ? a.pdf_path.split("/").pop() : null;
                const inputId = `amend-pdf-${a.id}`;
                return (
                  <div key={a.id} className="rounded-md border bg-muted/20 p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">제{i + 1}차 변경계약</div>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, amendments: (form.amendments || []).filter((_, j) => j !== i) })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">변경일</Label>
                        <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(a.change_date)} onChange={(e) => {
                          const next = [...(form.amendments || [])]; next[i] = { ...a, change_date: inputToISO(e.target.value) }; setForm({ ...form, amendments: next });
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">변경 계약금액 (원)</Label>
                        <Input type="text" inputMode="numeric" placeholder="변경 없으면 비움"
                          value={a.contract_amount_new !== null && a.contract_amount_new !== undefined ? Number(a.contract_amount_new).toLocaleString() : ""}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, "");
                            const next = [...(form.amendments || [])]; next[i] = { ...a, contract_amount_new: v === "" ? null : Number(v) }; setForm({ ...form, amendments: next });
                          }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">변경 준공예정일</Label>
                        <Input
                          type="text"
                          placeholder='YYYY.MM.DD 또는 "준공시까지"'
                          value={a.end_date_new_text ?? toDisplayDate(a.end_date_new)}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = [...(form.amendments || [])];
                            if (isDateLikeInput(v)) {
                              const iso = inputToISO(v);
                              next[i] = { ...a, end_date_new: iso, end_date_new_text: null };
                            } else {
                              next[i] = { ...a, end_date_new: "", end_date_new_text: v };
                            }
                            setForm({ ...form, amendments: next });
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-dashed">
                      <div className="text-xs w-[120px] shrink-0">변경계약서 PDF</div>
                      <input id={inputId} type="file" accept="application/pdf,.pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAmendmentPdf(i, f); e.target.value = ""; }} />
                      <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(inputId)?.click()} disabled={uploadingField === `amendment-${i}`}>
                        {uploadingField === `amendment-${i}` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        {a.pdf_path ? "교체" : "업로드"}
                      </Button>
                      {a.pdf_path && (
                        <>
                          <button type="button" onClick={() => downloadPdf(a.pdf_path!)} className="text-xs text-primary underline truncate max-w-[220px]" title={pdfFileName || ""}>
                            <FileTextIcon className="inline h-3 w-3 mr-0.5" />{pdfFileName}
                          </button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            const next = [...(form.amendments || [])]; next[i] = { ...a, pdf_path: null }; setForm({ ...form, amendments: next });
                          }}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 과업중지/재개 (다중) - PDF 인라인 */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-semibold">과업중지 / 재개 이력 <span className="text-xs font-normal text-muted-foreground">(재개일 이후 잔여일수는 재개일 기준으로 다시 산정)</span></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, suspensions: [...(form.suspensions || []), blankSuspension()] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />중지/재개 추가
                </Button>
              </div>
              {(form.suspensions || []).length === 0 && (
                <div className="text-xs text-muted-foreground">등록된 과업중지가 없습니다.</div>
              )}
              {(form.suspensions || []).map((s, i) => {
                const sFile = s.suspension_pdf_path ? s.suspension_pdf_path.split("/").pop() : null;
                const rFile = s.resume_pdf_path ? s.resume_pdf_path.split("/").pop() : null;
                const sInputId = `susp-pdf-${s.id}`;
                const rInputId = `resume-pdf-${s.id}`;
                return (
                  <div key={s.id} className="rounded-md border bg-muted/20 p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">제{i + 1}차 중지/재개</div>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, suspensions: (form.suspensions || []).filter((_, j) => j !== i) })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">과업중지일</Label>
                        <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(s.suspension_date)} onChange={(e) => {
                          const next = [...(form.suspensions || [])]; next[i] = { ...s, suspension_date: inputToISO(e.target.value) }; setForm({ ...form, suspensions: next });
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">중지 사유</Label>
                        <Input value={s.suspension_reason || ""} placeholder="예: 발주처 사정" onChange={(e) => {
                          const next = [...(form.suspensions || [])]; next[i] = { ...s, suspension_reason: e.target.value }; setForm({ ...form, suspensions: next });
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">과업재개일</Label>
                        <Input type="text" placeholder="아직 재개되지 않았으면 비움" value={toDisplayDate(s.resume_date)} onChange={(e) => {
                          const next = [...(form.suspensions || [])]; next[i] = { ...s, resume_date: inputToISO(e.target.value) }; setForm({ ...form, suspensions: next });
                        }} />
                      </div>
                    </div>
                    {/* 중지공문 PDF */}
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-dashed">
                      <div className="text-xs w-[120px] shrink-0">중지 공문 PDF</div>
                      <input id={sInputId} type="file" accept="application/pdf,.pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSuspensionPdf(i, "suspension", f); e.target.value = ""; }} />
                      <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(sInputId)?.click()} disabled={uploadingField === `suspension-${i}-suspension`}>
                        {uploadingField === `suspension-${i}-suspension` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        {s.suspension_pdf_path ? "교체" : "업로드"}
                      </Button>
                      {s.suspension_pdf_path && (
                        <>
                          <button type="button" onClick={() => downloadPdf(s.suspension_pdf_path!)} className="text-xs text-primary underline truncate max-w-[220px]" title={sFile || ""}>
                            <FileTextIcon className="inline h-3 w-3 mr-0.5" />{sFile}
                          </button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            const next = [...(form.suspensions || [])]; next[i] = { ...s, suspension_pdf_path: null }; setForm({ ...form, suspensions: next });
                          }}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                    {/* 재개공문 PDF */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-xs w-[120px] shrink-0">재개 공문 PDF</div>
                      <input id={rInputId} type="file" accept="application/pdf,.pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSuspensionPdf(i, "resume", f); e.target.value = ""; }} />
                      <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(rInputId)?.click()} disabled={uploadingField === `suspension-${i}-resume`}>
                        {uploadingField === `suspension-${i}-resume` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        {s.resume_pdf_path ? "교체" : "업로드"}
                      </Button>
                      {s.resume_pdf_path && (
                        <>
                          <button type="button" onClick={() => downloadPdf(s.resume_pdf_path!)} className="text-xs text-primary underline truncate max-w-[220px]" title={rFile || ""}>
                            <FileTextIcon className="inline h-3 w-3 mr-0.5" />{rFile}
                          </button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                            const next = [...(form.suspensions || [])]; next[i] = { ...s, resume_pdf_path: null }; setForm({ ...form, suspensions: next });
                          }}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 협의완료 (단일) */}
            <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">협의완료일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.agreement_date)} onChange={(e) => setForm({ ...form, agreement_date: inputToISO(e.target.value) })} />
              </div>
            </div>


            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm font-semibold">참여중인 인력</Label>
                <div className="flex gap-1">
                  <input ref={participantFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleParticipantExcel(e.target.files?.[0] || null)} />
                  <Button type="button" size="sm" variant="outline" onClick={() => participantFileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />엑셀 업로드
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addParticipant}><Plus className="h-4 w-4 mr-1" />추가</Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">엑셀 컬럼: 성명(필수), 역할/참여시작일/참여제외일(선택, YYYY.MM.DD 또는 YYYY-MM-DD) · 공고일이 [참여시작일 ≤ 공고일 ≤ 참여제외일] 범위에 드는 인원만 중복도 계산에 포함됩니다.</div>
              {(form.participants || []).length === 0 ? (
                <div className="text-xs text-muted-foreground">참여 인력이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {(form.participants || []).map((p, i) => {
                    const q = (p.name || "").trim();
                    const suggestions = q
                      ? technicians.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()) && t.name !== q).slice(0, 8)
                      : [];
                    const showList = activeParticipantIdx === i && suggestions.length > 0;
                    const active = isParticipantActive(p, announcementDate);
                    return (
                    <div key={i} className={`rounded-md border p-2 ${announcementDate && !active ? "bg-muted/40 opacity-60" : "bg-card"}`}>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <Input
                            placeholder="성명 (등록된 기술자 검색)"
                            value={p.name}
                            onFocus={() => setActiveParticipantIdx(i)}
                            onBlur={() => setTimeout(() => setActiveParticipantIdx((cur) => (cur === i ? null : cur)), 150)}
                            onChange={(e) => { updateParticipant(i, { name: e.target.value }); setActiveParticipantIdx(i); }}
                          />
                          {showList && (
                            <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-auto">
                              {suggestions.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                                  onMouseDown={(e) => { e.preventDefault(); updateParticipant(i, { name: t.name }); setActiveParticipantIdx(null); }}
                                >
                                  {t.name}{t.specialty ? <span className="text-muted-foreground ml-2 text-xs">{t.specialty}</span> : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Input className="flex-1" placeholder="역할 (선택)" value={p.role || ""} onChange={(e) => updateParticipant(i, { role: e.target.value })} />
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeParticipant(i)}><X className="h-4 w-4" /></Button>
                      </div>
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs w-16 shrink-0">참여시작일</Label>
                          <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(p.start_date)} onChange={(e) => updateParticipant(i, { start_date: inputToISO(e.target.value) })} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs w-16 shrink-0">참여제외일</Label>
                          <Input type="text" placeholder="비우면 계속 참여" value={toDisplayDate(p.end_date)} onChange={(e) => updateParticipant(i, { end_date: inputToISO(e.target.value) })} />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox id={`pexc-${i}`} checked={!!p.excluded} onCheckedChange={(v) => updateParticipant(i, { excluded: !!v })} />
                        <Label htmlFor={`pexc-${i}`} className="text-xs cursor-pointer">참여제외 (이 기술자만 중복금액 0 처리)</Label>
                      </div>

                      {announcementDate && !active && (
                        <div className="mt-1 text-[11px] text-orange-600">공고일 기준 참여 범위 밖 → 중복도 계산에서 제외됩니다.</div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>비고</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            {/* PDF 증빙서류 업로드 */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">증빙서류 (PDF)</Label>
              <div className="text-[11px] text-muted-foreground">당초 계약서는 PDF 병합 시 무조건 출력됩니다.</div>
              {[
                ...PDF_FIELDS,
                { key: "participant_list_pdf_path" as keyof OverlapRow, label: "참여자 명단 (수시 변경)" },
              ].map((f) => {
                const path = form[f.key] as string | null;
                const filename = path ? path.split("/").pop() : null;
                return (
                  <div key={f.key as string} className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs w-[180px] shrink-0">{f.label}</div>
                    <input
                      id={`pdf-${String(f.key)}`}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPdf(f.key, file); e.target.value = ""; }}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(`pdf-${String(f.key)}`)?.click()} disabled={uploadingField === f.key}>
                      {uploadingField === f.key ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      {path ? "교체" : "업로드"}
                    </Button>
                    {path && (
                      <>
                        <button type="button" onClick={() => downloadPdf(path)} className="text-xs text-primary underline truncate max-w-[200px]" title={filename || ""}>
                          <FileTextIcon className="inline h-3 w-3 mr-0.5" />{filename}
                        </button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm((s) => ({ ...s, [f.key]: null }))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>



            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}저장</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={techOpen} onOpenChange={setTechOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{techEditing ? "기술자 수정" : "기술자 등록"}</DialogTitle></DialogHeader>
          <form onSubmit={saveTech} className="space-y-3">
            <div className="space-y-1.5">
              <Label>이름 <span className="text-destructive">*</span></Label>
              <Input value={techForm.name} onChange={(e) => setTechForm({ ...techForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>전문분야</Label>
              <Input value={techForm.specialty} onChange={(e) => setTechForm({ ...techForm, specialty: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>상태</Label>
              <Select value={techForm.status} onValueChange={(v) => setTechForm({ ...techForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="재직중">재직중</SelectItem>
                  <SelectItem value="퇴사자">퇴사자</SelectItem>
                  <SelectItem value="PQ">PQ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTechOpen(false)}>취소</Button>
              <Button type="submit" disabled={techSubmitting}>{techSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}저장</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!techDeleteId} onOpenChange={(o) => !o && setTechDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기술자를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={doTechDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
