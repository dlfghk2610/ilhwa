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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";

type Row = {
  id: string;
  technician_name: string;
  course_name: string;
  hours: number | null;
  completed_date: string | null;
  institution: string | null;
  notes: string | null;
};

export default function PqEducations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ technician_name: "", course_name: "", hours: "", completed_date: "", institution: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("pq_educations").select("*").order("completed_date", { ascending: false });
    if (error) toast.error(error.message); else setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.technician_name, r.course_name, r.institution].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)));
  }, [rows, search]);

  const byTech = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.technician_name, (map.get(r.technician_name) || 0) + Number(r.hours || 0)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setForm({ technician_name: "", course_name: "", hours: "", completed_date: "", institution: "", notes: "" });
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      technician_name: r.technician_name, course_name: r.course_name, hours: r.hours?.toString() || "",
      completed_date: r.completed_date || "", institution: r.institution || "", notes: r.notes || "",
    });
    setOpen(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.technician_name.trim() || !form.course_name.trim()) { toast.error("기술자명과 과정명을 입력하세요"); return; }
    const payload: any = {
      technician_name: form.technician_name.trim(), course_name: form.course_name.trim(),
      hours: form.hours ? Number(form.hours) : null,
      completed_date: form.completed_date || null,
      institution: form.institution || null,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await (supabase as any).from("pq_educations").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("수정 완료");
    } else {
      const { error } = await (supabase as any).from("pq_educations").insert({ ...payload, created_by: user.id });
      if (error) return toast.error(error.message);
      toast.success("등록 완료");
    }
    setOpen(false); load();
  };
  const remove = async () => {
    if (!delId) return;
    const { error } = await (supabase as any).from("pq_educations").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setDelId(null);
  };

  return (
    <AppLayout title="PQ 기술자별 교육현황">
      <div className="space-y-4">
        {byTech.length > 0 && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-2">기술자별 총 이수시간</div>
            <div className="flex flex-wrap gap-2">
              {byTech.map(([name, h]) => (
                <div key={name} className="px-3 py-1 rounded-md border bg-muted/40 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="ml-2 text-primary font-semibold">{h}h</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4 flex items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="기술자명/과정명/기관 검색" className="pl-8" />
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />등록</Button>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>기술자명</TableHead>
                <TableHead>과정명</TableHead>
                <TableHead>이수일</TableHead>
                <TableHead className="text-right">시간</TableHead>
                <TableHead>교육기관</TableHead>
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
                  <TableCell className="font-medium">{r.technician_name}</TableCell>
                  <TableCell>{r.course_name}</TableCell>
                  <TableCell>{r.completed_date || "-"}</TableCell>
                  <TableCell className="text-right">{r.hours ?? "-"}</TableCell>
                  <TableCell>{r.institution || "-"}</TableCell>
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
              <div className="grid grid-cols-2 gap-3">
                <div><Label>기술자명 *</Label><Input value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} required /></div>
                <div><Label>이수시간(h)</Label><Input type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
              </div>
              <div><Label>과정명 *</Label><Input value={form.course_name} onChange={(e) => setForm({ ...form, course_name: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>이수일</Label><Input type="date" value={form.completed_date} onChange={(e) => setForm({ ...form, completed_date: e.target.value })} /></div>
                <div><Label>교육기관</Label><Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></div>
              </div>
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
