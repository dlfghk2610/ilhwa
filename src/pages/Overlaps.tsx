import { useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Search, X, Loader2, CalendarIcon } from "lucide-react";

type Participant = { name: string; role?: string };

type OverlapRow = {
  id: string;
  project_name: string;
  client: string | null;
  contract_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  suspension_date: string | null;
  agreement_date: string | null;
  absolute_period_days: number | null;
  participants: Participant[];
  notes: string | null;
};

type Unit = "won" | "k" | "m"; // 원, 천원, 백만원

const toDisplayDate = (iso?: string | null) => {
  if (!iso) return "";
  return iso.replace(/-/g, ".");
};
const toISODate = (display?: string | null) => {
  if (!display) return "";
  return display.replace(/\./g, "-");
};
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

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OverlapRow | null>(null);
  const [form, setForm] = useState<Omit<OverlapRow, "id">>({
    project_name: "", client: "", contract_amount: null,
    start_date: "", end_date: "", suspension_date: "", agreement_date: "",
    absolute_period_days: null, participants: [], notes: "",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 기술자 관리
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

  const openCreate = () => {
    setEditing(null);
    setForm({ project_name: "", client: "", contract_amount: null, start_date: "", end_date: "", suspension_date: "", agreement_date: "", absolute_period_days: null, participants: [], notes: "" });
    setOpen(true);
  };
  const openEdit = (r: OverlapRow) => {
    setEditing(r);
    setForm({
      project_name: r.project_name || "",
      client: r.client || "",
      contract_amount: r.contract_amount,
      start_date: r.start_date || "",
      end_date: r.end_date || "",
      suspension_date: r.suspension_date || "",
      agreement_date: r.agreement_date || "",
      absolute_period_days: r.absolute_period_days ?? null,
      participants: r.participants || [],
      notes: r.notes || "",
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name) { toast.error("사업명은 필수입니다"); return; }
    setSubmitting(true);
    const payload: any = {
      project_name: form.project_name,
      client: form.client || null,
      contract_amount: form.contract_amount === null || form.contract_amount === undefined || (form.contract_amount as any) === "" ? null : Number(form.contract_amount),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      suspension_date: form.suspension_date || null,
      agreement_date: form.agreement_date || null,
      absolute_period_days: form.absolute_period_days === null || form.absolute_period_days === undefined || (form.absolute_period_days as any) === "" ? null : Number(form.absolute_period_days),
      participants: form.participants || [],
      notes: form.notes || null,
      technician_name: null,
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

  // 기술자 관리
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

  const filtered = useMemo(() => rows.filter((r) => {
    const matchSearch = !search ||
      (r.project_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.client || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.participants || []).some((p) => (p.name || "").toLowerCase().includes(search.toLowerCase()));
    const matchTech = selectedTech === "__all__" ||
      (r.participants || []).some((p) => (p.name || "") === selectedTech);
    return matchSearch && matchTech;
  }), [rows, search, selectedTech]);

  // 총계약기간: 절대공기 체크시 absolute_period_days 있으면 사용, 없으면 기본 end - start + 1
  const totalPeriod = (r: OverlapRow) => {
    if (useAbsolute && r.absolute_period_days) return r.absolute_period_days;
    return diffDays(r.start_date, r.end_date);
  };

  // 잔여일수 상태
  // returns { value: number | null, label: string }
  //  - null 이면 "-" 표시
  const remainInfo = (r: OverlapRow): { days: number | null; suspendedLong: boolean; agreed: boolean } => {
    // 협의완료: 무조건 -
    if (r.agreement_date) return { days: null, suspendedLong: false, agreed: true };
    // 과업중지
    if (r.suspension_date) {
      const months = monthsBetween(r.suspension_date, new Date());
      if (months >= 3) return { days: null, suspendedLong: true, agreed: false };
      if (!r.end_date) return { days: 0, suspendedLong: false, agreed: false };
      const d = diffDays(r.suspension_date, r.end_date);
      return { days: Math.min(365, d), suspendedLong: false, agreed: false };
    }
    if (!announcementDate || !r.end_date) return { days: 0, suspendedLong: false, agreed: false };
    return { days: Math.min(365, diffDays(announcementDate, r.end_date)), suspendedLong: false, agreed: false };
  };

  const overlapAmount = (r: OverlapRow): { value: number | null; label?: string } => {
    const info = remainInfo(r);
    if (info.agreed) return { value: null, label: "-" };
    if (info.suspendedLong) return { value: 0, label: "3개월이상 중지중" };
    const t = totalPeriod(r);
    const contract = roundedContractAmount(r.contract_amount);
    if (!t || !contract || info.days === null) return { value: 0 };
    return { value: contract * (info.days / t) / 10 };
  };

  const roundedContractAmount = (v: number | null) => {
    if (v === null || v === undefined) return 0;
    const n = Number(v);
    if (unit === "m") return Math.round(n / 1_000_000) * 1_000_000;
    if (unit === "k") return Math.round(n / 1_000) * 1_000;
    return n;
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

  // 합계 (선택된 기술자 기준)
  const totalOverlap = useMemo(() => filtered.reduce((acc, r) => {
    const o = overlapAmount(r);
    return acc + (o.value || 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, 0), [filtered, announcementDate, useAbsolute]);

  // participants editor
  const addParticipant = () => setForm({ ...form, participants: [...(form.participants || []), { name: "", role: "" }] });
  const updateParticipant = (i: number, patch: Partial<Participant>) => {
    const next = [...(form.participants || [])];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, participants: next });
  };
  const removeParticipant = (i: number) => {
    setForm({ ...form, participants: (form.participants || []).filter((_, idx) => idx !== i) });
  };

  // 기술자별 중복금액 합계 (공고일 반영 시)
  const techOverlapTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const o = overlapAmount(r);
      const v = o.value || 0;
      if (!v) continue;
      for (const p of r.participants || []) {
        const name = (p.name || "").trim();
        if (!name) continue;
        map.set(name, (map.get(name) || 0) + v);
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, announcementDate, useAbsolute]);

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
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={announcementDate ? new Date(announcementDate + "T00:00:00") : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const iso = format(date, "yyyy-MM-dd");
                        setAnnouncementDate(iso);
                      }
                    }}
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
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
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

        <Card className="shadow-card overflow-hidden">
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
                  const contractDays = diffDays(r.start_date, r.end_date);
                  const absoluteApplied = useAbsolute && !!r.absolute_period_days;
                  return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(r)}>
                    <TableCell className="whitespace-nowrap font-medium">{r.project_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.client || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{fmtContract(r.contract_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(r.end_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{contractDays ? contractDays.toLocaleString() + "일" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{remainText}</TableCell>
                    <TableCell className={"whitespace-nowrap text-right" + (absoluteApplied ? " text-red-600 font-semibold" : "")}>{overlapText}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(r.suspension_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateCell(r.agreement_date)}</TableCell>
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
                    <TableHead className="whitespace-nowrap">기술자명</TableHead>
                    <TableHead className="whitespace-nowrap">전문분야</TableHead>
                    <TableHead className="whitespace-nowrap text-right">중복금액 합계</TableHead>
                    <TableHead className="whitespace-nowrap text-right">참여 사업수</TableHead>
                    <TableHead className="text-right w-[110px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">등록된 기술자가 없습니다.</TableCell></TableRow>
                  ) : technicians.map((t) => {
                    const total = techOverlapTotals.get(t.name) || 0;
                    const count = rows.filter((r) => (r.participants || []).some((p) => (p.name || "") === t.name)).length;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap font-medium">{t.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{t.specialty || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold text-primary">{announcementDate ? fmtOverlap(total) : "-"}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{count}건</TableCell>
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
          <form onSubmit={save} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
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
              <div className="space-y-1.5">
                <Label>과업중지일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.suspension_date)} onChange={(e) => setForm({ ...form, suspension_date: inputToISO(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>협의완료일</Label>
                <Input type="text" placeholder="YYYY.MM.DD" value={toDisplayDate(form.agreement_date)} onChange={(e) => setForm({ ...form, agreement_date: inputToISO(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">참여중인 인력</Label>
                <Button type="button" size="sm" variant="outline" onClick={addParticipant}><Plus className="h-4 w-4 mr-1" />추가</Button>
              </div>
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
