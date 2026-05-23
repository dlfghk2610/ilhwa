import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, Loader2 } from "lucide-react";

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
  participants: Participant[];
  notes: string | null;
};

type Unit = "won" | "k" | "m"; // 원, 천원, 백만원

const parseDate = (s?: string | null) => (s ? new Date(s + "T00:00:00") : null);
const diffDays = (a?: string | null, b?: string | null) => {
  const s = parseDate(a), e = parseDate(b);
  if (!s || !e || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
};

export default function Overlaps() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OverlapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [announcementDate, setAnnouncementDate] = useState("");
  const [unit, setUnit] = useState<Unit>("won");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OverlapRow | null>(null);
  const [form, setForm] = useState<Omit<OverlapRow, "id">>({
    project_name: "", client: "", contract_amount: null,
    start_date: "", end_date: "", suspension_date: "", agreement_date: "",
    participants: [], notes: "",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("technician_overlaps")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data || []).map((r: any) => ({ ...r, participants: Array.isArray(r.participants) ? r.participants : [] })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ project_name: "", client: "", contract_amount: null, start_date: "", end_date: "", suspension_date: "", agreement_date: "", participants: [], notes: "" });
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

  const filtered = useMemo(() => rows.filter((r) =>
    !search ||
    (r.project_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.participants || []).some((p) => (p.name || "").toLowerCase().includes(search.toLowerCase()))
  ), [rows, search]);

  // 총계약기간 = end - start + 1
  const totalPeriod = (r: OverlapRow) => diffDays(r.start_date, r.end_date);
  // 잔여일수 = min(365, end - announcement + 1)
  const remainDays = (r: OverlapRow) => {
    if (!announcementDate || !r.end_date) return 0;
    const d = diffDays(announcementDate, r.end_date);
    return Math.min(365, d);
  };
  // 중복금액 = contract * (remain / total)
  const overlapAmount = (r: OverlapRow) => {
    const t = totalPeriod(r);
    if (!t || !r.contract_amount) return 0;
    return Number(r.contract_amount) * (remainDays(r) / t);
  };

  const fmtContract = (v: number | null) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (unit === "m") return Math.round(n / 1_000_000).toLocaleString();
    if (unit === "k") return Math.round(n / 1_000).toLocaleString();
    return n.toLocaleString();
  };
  const fmtOverlap = (v: number) => {
    if (!v) return "-";
    if (unit === "m") return (Math.round((v / 1_000_000) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (unit === "k") return Math.round(v / 1_000).toLocaleString();
    return Math.round(v).toLocaleString();
  };

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

  return (
    <AppLayout title="PQ 기술자별 업무중첩도 관리">
      <div className="space-y-4">
        <Card className="p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="검색 (사업명/발주처/참여인력)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">공고일</Label>
              <Input type="date" value={announcementDate} onChange={(e) => setAnnouncementDate(e.target.value)} className="w-[160px]" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">금액단위</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="won">원</SelectItem>
                  <SelectItem value="k">천원</SelectItem>
                  <SelectItem value="m">백만원</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
          </div>
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
                ) : filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(r)}>
                    <TableCell className="whitespace-nowrap font-medium">{r.project_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.client || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{fmtContract(r.contract_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.start_date || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.end_date || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{totalPeriod(r) ? totalPeriod(r).toLocaleString() + "일" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{announcementDate ? remainDays(r).toLocaleString() + "일" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{announcementDate ? fmtOverlap(overlapAmount(r)) : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.suspension_date || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.agreement_date || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[200px] truncate">{r.notes || "-"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>
      </div>

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
                <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>준공예정일</Label>
                <Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>과업중지일</Label>
                <Input type="date" value={form.suspension_date || ""} onChange={(e) => setForm({ ...form, suspension_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>협의완료일</Label>
                <Input type="date" value={form.agreement_date || ""} onChange={(e) => setForm({ ...form, agreement_date: e.target.value })} />
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
                  {(form.participants || []).map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input placeholder="성명" value={p.name} onChange={(e) => updateParticipant(i, { name: e.target.value })} />
                      <Input placeholder="역할 (선택)" value={p.role || ""} onChange={(e) => updateParticipant(i, { role: e.target.value })} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeParticipant(i)}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
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
    </AppLayout>
  );
}
