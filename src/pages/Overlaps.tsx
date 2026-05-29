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
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, Loader2, CalendarIcon, ChevronDown, ChevronRight, Upload, FileDown, Download, Printer, FileText as FileTextIcon } from "lucide-react";
import { importFromExcel, exportToExcel } from "@/lib/excel";
import { PDFDocument } from "pdf-lib";

type Participant = { name: string; role?: string };

type OverlapRow = {
  id: string;
  project_name: string;
  client: string | null;
  contract_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  suspension_date: string | null;
  suspension_reason: string | null;
  agreement_date: string | null;
  absolute_period_days: number | null;
  participants: Participant[];
  notes: string | null;
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
};

type Unit = "won" | "k" | "m";

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

const emptyForm = (): Omit<OverlapRow, "id"> => ({
  project_name: "", client: "", contract_amount: null,
  start_date: "", end_date: "", suspension_date: "", suspension_reason: "", agreement_date: "",
  absolute_period_days: null, participants: [], notes: "",
  contract_amount_change_date: "", contract_amount_new: null,
  end_date_change_date: "", end_date_new: "",
  original_contract_pdf_path: null, contract_change_pdf_path: null,
  end_date_change_pdf_path: null, suspension_pdf_path: null,
  agreement_pdf_path: null, participant_list_pdf_path: null,
});

export default function Overlaps() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OverlapRow[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string; specialty: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [announcementDate, setAnnouncementDate] = useState("");
  const [unit, setUnit] = useState<Unit>("won");
  const [useAbsolute, setUseAbsolute] = useState(false);
  const [selectedTech, setSelectedTech] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OverlapRow | null>(null);
  const [form, setForm] = useState<Omit<OverlapRow, "id">>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const participantFileRef = useRef<HTMLInputElement>(null);

  const [techOpen, setTechOpen] = useState(false);
  const [techEditing, setTechEditing] = useState<{ id: string; name: string; specialty: string | null } | null>(null);
  const [techForm, setTechForm] = useState<{ name: string; specialty: string }>({ name: "", specialty: "" });
  const [techDeleteId, setTechDeleteId] = useState<string | null>(null);
  const [techSubmitting, setTechSubmitting] = useState(false);
  const [activeParticipantIdx, setActiveParticipantIdx] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, techRes] = await Promise.all([
      (supabase as any).from("technician_overlaps").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("technicians").select("id, name, specialty").order("name"),
    ]);
    if (error) toast.error(error.message);
    else setRows((data || []).map((r: any) => ({ ...r, participants: Array.isArray(r.participants) ? r.participants : [] })));
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
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name) { toast.error("사업명은 필수입니다"); return; }
    setSubmitting(true);
    const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
    const payload: any = {
      project_name: form.project_name,
      client: form.client || null,
      contract_amount: num(form.contract_amount),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
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

  const openTechCreate = () => { setTechEditing(null); setTechForm({ name: "", specialty: "" }); setTechOpen(true); };
  const openTechEdit = (t: { id: string; name: string; specialty: string | null }) => {
    setTechEditing(t); setTechForm({ name: t.name, specialty: t.specialty || "" }); setTechOpen(true);
  };
  const saveTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!techForm.name.trim()) { toast.error("이름은 필수입니다"); return; }
    setTechSubmitting(true);
    const payload: any = { name: techForm.name.trim(), specialty: techForm.specialty.trim() || null };
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

  // ===== 공고일 기준 effective 값 =====
  const effectiveContract = (r: OverlapRow) => {
    if (r.contract_amount_change_date && r.contract_amount_new !== null && r.contract_amount_new !== undefined &&
        isAfterOrEqual(announcementDate, r.contract_amount_change_date)) return r.contract_amount_new;
    return r.contract_amount;
  };
  const effectiveEndDate = (r: OverlapRow) => {
    if (r.end_date_change_date && r.end_date_new &&
        isAfterOrEqual(announcementDate, r.end_date_change_date)) return r.end_date_new;
    return r.end_date;
  };
  const effectiveSuspensionDate = (r: OverlapRow) => {
    if (!r.suspension_date) return null;
    // suspension만 적용 가능: 공고일 >= 과업중지일일 때만 반영
    if (!isAfterOrEqual(announcementDate, r.suspension_date)) return null;
    return r.suspension_date;
  };
  const effectiveAgreementDate = (r: OverlapRow) => {
    if (!r.agreement_date) return null;
    if (!isAfterOrEqual(announcementDate, r.agreement_date)) return null;
    return r.agreement_date;
  };

  const filtered = useMemo(() => rows.filter((r) => {
    const matchSearch = !search ||
      (r.project_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.client || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.participants || []).some((p) => (p.name || "").toLowerCase().includes(search.toLowerCase()));
    const matchTech = selectedTech === "__all__" ||
      (r.participants || []).some((p) => (p.name || "") === selectedTech);
    return matchSearch && matchTech;
  }), [rows, search, selectedTech]);

  const totalPeriod = (r: OverlapRow) => {
    if (useAbsolute && r.absolute_period_days) return r.absolute_period_days;
    return diffDays(r.start_date, effectiveEndDate(r));
  };

  const remainInfo = (r: OverlapRow): { days: number | null; suspendedLong: boolean; agreed: boolean } => {
    const agree = effectiveAgreementDate(r);
    if (agree) return { days: null, suspendedLong: false, agreed: true };
    const susp = effectiveSuspensionDate(r);
    const endDate = effectiveEndDate(r);
    if (susp) {
      const months = monthsBetween(susp, new Date());
      if (months >= 3) return { days: null, suspendedLong: true, agreed: false };
      if (!endDate) return { days: 0, suspendedLong: false, agreed: false };
      const d = diffDays(susp, endDate);
      return { days: Math.min(365, d), suspendedLong: false, agreed: false };
    }
    if (!announcementDate || !endDate) return { days: 0, suspendedLong: false, agreed: false };
    return { days: Math.min(365, diffDays(announcementDate, endDate)), suspendedLong: false, agreed: false };
  };

  const roundedContractAmount = (v: number | null) => {
    if (v === null || v === undefined) return 0;
    const n = Number(v);
    if (unit === "m") return Math.round(n / 1_000_000) * 1_000_000;
    if (unit === "k") return Math.round(n / 1_000) * 1_000;
    return n;
  };

  const overlapAmount = (r: OverlapRow): { value: number | null; label?: string } => {
    const info = remainInfo(r);
    if (info.agreed) return { value: null, label: "-" };
    if (info.suspendedLong) return { value: 0, label: "3개월이상 중지중" };
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

  const totalOverlap = useMemo(() => filtered.reduce((acc, r) => acc + (overlapAmount(r).value || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, announcementDate, useAbsolute, unit]);

  const addParticipant = () => setForm({ ...form, participants: [...(form.participants || []), { name: "", role: "" }] });
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
      const parsed: Participant[] = data
        .map((row) => {
          const name = String(findKey(row, ["성명", "이름", "name"]) ?? "").trim().replace(/\s+/g, "");
          const role = String(findKey(row, ["역할", "직책", "직위", "role"]) ?? "").trim();
          return { name, role: role || undefined };
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
      const v = overlapAmount(r).value || 0;
      if (!v) continue;
      for (const p of r.participants || []) {
        const name = (p.name || "").trim();
        if (!name) continue;
        map.set(name, (map.get(name) || 0) + v);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, announcementDate, useAbsolute, unit]);

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
              <Label htmlFor="absolute" className="text-sm cursor-pointer whitespace-nowrap">절대공기 적용</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">기술자</Label>
              <Select value={selectedTech} onValueChange={setSelectedTech}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {technicians.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
          </div>
          {selectedTech !== "__all__" && (
            <div className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedTech}</span> 기술자 중복금액 합계:{" "}
              <span className="font-semibold text-primary">{fmtOverlap(totalOverlap)}</span>
              <span className="ml-1 text-xs">({filtered.length}건)</span>
            </div>
          )}
        </Card>

        {/* Desktop table */}
        <Card className="shadow-card overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="whitespace-nowrap">사업명</TableHead>
                  <TableHead className="whitespace-nowrap">발주처</TableHead>
                  <TableHead className="whitespace-nowrap text-right">계약금액</TableHead>
                  <TableHead className="whitespace-nowrap">착수일</TableHead>
                  <TableHead className="whitespace-nowrap">준공예정일</TableHead>
                  <TableHead className="whitespace-nowrap text-right">총 계약기간</TableHead>
                  <TableHead className="whitespace-nowrap text-right">잔여일수</TableHead>
                  <TableHead className="whitespace-nowrap text-right">중복금액</TableHead>
                  <TableHead className="whitespace-nowrap">과업중지일</TableHead>
                  <TableHead className="whitespace-nowrap">협의완료일</TableHead>
                  <TableHead className="whitespace-nowrap">비고</TableHead>
                  <TableHead className="text-right w-[110px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const info = remainInfo(r);
                  const o = overlapAmount(r);
                  const remainText = info.agreed || info.suspendedLong ? "-" : (info.days === null ? "-" : info.days.toLocaleString() + "일");
                  const overlapText = o.label ?? (o.value === null ? "-" : fmtOverlap(o.value));
                  const eEnd = effectiveEndDate(r);
                  const eContract = effectiveContract(r);
                  const contractDays = diffDays(r.start_date, eEnd);
                  const absoluteApplied = useAbsolute && !!r.absolute_period_days;
                  const susp = effectiveSuspensionDate(r);
                  const agree = effectiveAgreementDate(r);
                  return (
                  <TableRow key={r.id} className={`cursor-pointer hover:bg-muted/30 ${isCivilianLike(r) ? "bg-green-50" : ""}`} onClick={() => openEdit(r)}>
                    <TableCell className="whitespace-nowrap font-medium">{r.project_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.client || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {fmtContract(eContract)}
                      {eContract !== r.contract_amount && <span className="ml-1 text-[10px] text-orange-600">(변경)</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDateCell(eEnd)}
                      {eEnd !== r.end_date && <span className="ml-1 text-[10px] text-orange-600">(변경)</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">{contractDays ? contractDays.toLocaleString() + "일" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{remainText}</TableCell>
                    <TableCell className={"whitespace-nowrap text-right" + (absoluteApplied ? " text-red-600 font-semibold" : "")}>{overlapText}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(susp)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(agree)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[200px] truncate">{r.notes || "-"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
              <div key={r.id} className={`border rounded-md ${isCivilianLike(r) ? "bg-green-50" : "bg-card"}`}>
                <button type="button" onClick={() => toggleExpand(r.id)} className="w-full flex items-center justify-between gap-2 p-3 text-left">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                    <div className="font-medium truncate">{r.project_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">중복금액</div>
                    <div className="font-semibold text-primary text-sm">{overlapText}</div>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-1.5 text-xs">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className="text-muted-foreground">발주처</div><div>{r.client || "-"}</div>
                      <div className="text-muted-foreground">계약금액</div>
                      <div>{fmtContract(eContract)}{eContract !== r.contract_amount && <span className="ml-1 text-orange-600">(변경)</span>}</div>
                      <div className="text-muted-foreground">착수일</div><div>{fmtDateCell(r.start_date)}</div>
                      <div className="text-muted-foreground">준공예정일</div>
                      <div>{fmtDateCell(eEnd)}{eEnd !== r.end_date && <span className="ml-1 text-orange-600">(변경)</span>}</div>
                      <div className="text-muted-foreground">잔여일수</div><div>{remainText}</div>
                      <div className="text-muted-foreground">과업중지일</div><div>{fmtDateCell(susp)}{susp && r.suspension_reason ? ` (${r.suspension_reason})` : ""}</div>
                      <div className="text-muted-foreground">협의완료일</div><div>{fmtDateCell(agree)}</div>
                      {r.notes && (<><div className="text-muted-foreground">비고</div><div className="truncate">{r.notes}</div></>)}
                    </div>
                    <div className="flex justify-end gap-1 pt-1">
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
                <Label htmlFor="absolute-tech" className="text-sm cursor-pointer whitespace-nowrap">절대공기 적용</Label>
              </div>
              <div className="ml-auto">
                <Button size="sm" onClick={openTechCreate}><Plus className="mr-1 h-4 w-4" />기술자 등록</Button>
              </div>
            </div>
          </Card>
          <Card className="shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[140px]">기술자명</TableHead>
                    <TableHead className="w-[120px]">전문분야</TableHead>
                    <TableHead className="text-right w-[160px]">중복금액 합계</TableHead>
                    <TableHead className="text-right w-[100px]">참여 사업수</TableHead>
                    <TableHead className="text-right w-[90px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">등록된 기술자가 없습니다.</TableCell></TableRow>
                  ) : technicians.map((t) => {
                    const total = techOverlapTotals.get(t.name) || 0;
                    const count = rows.filter((r) => (r.participants || []).some((p) => (p.name || "") === t.name)).length;
                    const over = total - 250_000_000;
                    return (
                      <TableRow key={t.id} className={total >= 250_000_000 ? "bg-blue-50" : ""}>
                        <TableCell className="font-medium">
                          {t.name}
                          {total >= 250_000_000 && (<span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded">2.5억 이상</span>)}
                        </TableCell>
                        <TableCell>{t.specialty || "-"}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {announcementDate ? fmtOverlap(total) : "-"}
                          {announcementDate && over > 0 && (<span className="block text-[10px] text-blue-700">+{fmtOverlap(over)} 초과</span>)}
                        </TableCell>
                        <TableCell className="text-right">{count}건</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openTechEdit(t)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setTechDeleteId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {technicians.length}명{!announcementDate && " · 공고일을 입력하면 중복금액이 계산됩니다."}</div>
          </Card>
        </TabsContent>
      </Tabs>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
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
                <Input type="number" value={form.contract_amount ?? ""} onChange={(e) => setForm({ ...form, contract_amount: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>착수일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.start_date)} onChange={(e) => setForm({ ...form, start_date: inputToISO(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>준공예정일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.end_date)} onChange={(e) => setForm({ ...form, end_date: inputToISO(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>절대공기일수 (일)</Label>
                <Input type="number" value={form.absolute_period_days ?? ""} onChange={(e) => setForm({ ...form, absolute_period_days: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </div>

            {/* 변경/반영 섹션 - 공고일 기준 적용 */}
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">변경/반영 사항 <span className="text-xs font-normal text-muted-foreground">(공고일이 변경일 이후일 때만 반영)</span></div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 rounded-md bg-muted/30">
                <div className="md:col-span-2 text-xs font-medium text-muted-foreground">계약금액 변경</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">변경일</Label>
                  <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.contract_amount_change_date)} onChange={(e) => setForm({ ...form, contract_amount_change_date: inputToISO(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">변경 계약금액 (원)</Label>
                  <Input type="number" value={form.contract_amount_new ?? ""} onChange={(e) => setForm({ ...form, contract_amount_new: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 rounded-md bg-muted/30">
                <div className="md:col-span-2 text-xs font-medium text-muted-foreground">준공예정일 변경</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">변경일</Label>
                  <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.end_date_change_date)} onChange={(e) => setForm({ ...form, end_date_change_date: inputToISO(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">변경된 준공예정일</Label>
                  <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.end_date_new)} onChange={(e) => setForm({ ...form, end_date_new: inputToISO(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 rounded-md bg-muted/30">
                <div className="md:col-span-2 text-xs font-medium text-muted-foreground">과업중지 반영</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">과업중지일</Label>
                  <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.suspension_date)} onChange={(e) => setForm({ ...form, suspension_date: inputToISO(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">중지 사유</Label>
                  <Input value={form.suspension_reason || ""} onChange={(e) => setForm({ ...form, suspension_reason: e.target.value })} placeholder="예: 발주처 사정" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 rounded-md bg-muted/30">
                <div className="md:col-span-2 text-xs font-medium text-muted-foreground">협의완료 반영</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">협의완료일</Label>
                  <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.agreement_date)} onChange={(e) => setForm({ ...form, agreement_date: inputToISO(e.target.value) })} />
                </div>
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
              <div className="text-[11px] text-muted-foreground">엑셀 컬럼: 성명(필수), 역할(선택)</div>
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
                    return (
                    <div key={i} className="flex gap-2 items-center">
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
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>비고</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
