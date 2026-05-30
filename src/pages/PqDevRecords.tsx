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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";

type Row = {
  id: string;
  record_type: "개발" | "투자" | "활용";
  title: string;
  amount: number | null;
  record_date: string | null;
  institution: string | null;
  notes: string | null;
  created_at: string;
};

const TYPES = ["개발", "투자", "활용"] as const;

export default function PqDevRecords() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "개발" | "투자" | "활용">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ record_type: "개발", title: "", amount: "", record_date: "", institution: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("pq_dev_records").select("*").order("record_date", { ascending: false });
    if (error) toast.error(error.message); else setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (tab === "all" || r.record_type === tab) && (!q || [r.title, r.institution, r.notes].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))));
  }, [rows, search, tab]);

  const totals = useMemo(() => {
    const t = { 개발: 0, 투자: 0, 활용: 0 };
    rows.forEach((r) => { t[r.record_type] += Number(r.amount || 0); });
    return t;
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ record_type: "개발", title: "", amount: "", record_date: "", institution: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      record_type: r.record_type, title: r.title, amount: r.amount?.toString() || "",
      record_date: r.record_date || "", institution: r.institution || "", notes: r.notes || "",
    });
    setOpen(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim()) { toast.error("제목을 입력하세요"); return; }
    const payload: any = {
      record_type: form.record_type, title: form.title.trim(),
      amount: form.amount ? Number(form.amount) : null,
      record_date: form.record_date || null,
      institution: form.institution || null,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await (supabase as any).from("pq_dev_records").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("수정 완료");
    } else {
      const { error } = await (supabase as any).from("pq_dev_records").insert({ ...payload, created_by: user.id });
      if (error) return toast.error(error.message);
      toast.success("등록 완료");
    }
    setOpen(false); load();
  };
  const remove = async () => {
    if (!delId) return;
    const { error } = await (supabase as any).from("pq_dev_records").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setDelId(null);
  };

  return (
    <AppLayout title="PQ 개발·투자·활용실적">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <Card key={t} className="p-4 text-center">
              <div className="text-xs text-muted-foreground">{t}실적 합계</div>
              <div className="text-2xl font-bold text-primary mt-1">{totals[t].toLocaleString()}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4 flex flex-wrap items-center gap-3 justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="all">전체</TabsTrigger>
              {TYPES.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색" className="pl-8 w-56" />
            </div>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />등록</Button>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">종류</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>일자</TableHead>
                <TableHead>기관</TableHead>
                <TableHead className="text-right">금액(원)</TableHead>
                <TableHead>비고</TableHead>
                <TableHead className="w-24 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">데이터가 없습니다</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.record_type}</TableCell>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell>{r.record_date || "-"}</TableCell>
                  <TableCell>{r.institution || "-"}</TableCell>
                  <TableCell className="text-right">{r.amount?.toLocaleString() || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.notes || ""}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>종류</Label>
                <Select value={form.record_type} onValueChange={(v) => setForm({ ...form, record_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>제목 *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>일자</Label><Input type="date" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} /></div>
                <div><Label>금액(원)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              </div>
              <div><Label>기관</Label><Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></div>
              <div><Label>비고</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
                <Button type="submit">저장</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={remove}>삭제</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
