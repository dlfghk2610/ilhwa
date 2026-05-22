import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

type PersonalCareer = {
  id: string;
  technician_name: string;
  company: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  resign_date: string | null;
  duties: string | null;
  notes: string | null;
};

export default function PersonalHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonalCareer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalCareer | null>(null);
  const [form, setForm] = useState<Partial<PersonalCareer>>({});
  const [deleteRow, setDeleteRow] = useState<PersonalCareer | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("personal_careers")
      .select("*")
      .order("technician_name", { ascending: true })
      .order("hire_date", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as PersonalCareer[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.technician_name, r.company, r.department, r.position].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const openNew = () => { setEditing(null); setForm({}); setDialogOpen(true); };
  const openEdit = (r: PersonalCareer) => { setEditing(r); setForm(r); setDialogOpen(true); };

  const save = async () => {
    if (!user) return;
    if (!form.technician_name?.trim()) { toast.error("기술자명을 입력하세요"); return; }
    if (!form.company?.trim()) { toast.error("근무처(회사명)을 입력하세요"); return; }
    const payload = {
      technician_name: form.technician_name.trim(),
      company: form.company.trim(),
      department: form.department?.trim() || null,
      position: form.position?.trim() || null,
      hire_date: form.hire_date || null,
      resign_date: form.resign_date || null,
      duties: form.duties?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from("personal_careers").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("수정되었습니다");
    } else {
      const { error } = await supabase.from("personal_careers").insert({ ...payload, created_by: user.id });
      if (error) { toast.error(error.message); return; }
      toast.success("등록되었습니다");
    }
    setDialogOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteRow) return;
    const { error } = await supabase.from("personal_careers").delete().eq("id", deleteRow.id);
    if (error) toast.error(error.message);
    else { toast.success("삭제되었습니다"); load(); }
    setDeleteRow(null);
  };

  return (
    <AppLayout title="PQ 개인별 이력사항">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="기술자명·회사명·직위 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />이력 추가</Button>
        </div>

        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2">
            여기에 입력한 근무이력은 PQ 개인별 경력관리에서 평가협회 엑셀 업로드 시 참여회사·참여직위를 자동으로 채우는 데 사용됩니다 (기술자명 + 사업 참여시작일이 근무기간에 포함될 때).
          </div>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">등록된 이력이 없습니다</div>
          ) : (
            <div className="overflow-auto">
              <Table className="min-w-[900px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>기술자명</TableHead>
                    <TableHead>근무처(회사)</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>직위</TableHead>
                    <TableHead>입사일</TableHead>
                    <TableHead>퇴사일</TableHead>
                    <TableHead>담당업무</TableHead>
                    <TableHead className="w-[100px] text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.technician_name}</TableCell>
                      <TableCell>{r.company}</TableCell>
                      <TableCell>{r.department || ""}</TableCell>
                      <TableCell>{r.position || ""}</TableCell>
                      <TableCell>{r.hire_date || ""}</TableCell>
                      <TableCell>{r.resign_date || "재직중"}</TableCell>
                      <TableCell className="max-w-[240px] whitespace-normal break-words">{r.duties || ""}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteRow(r)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "이력 수정" : "이력 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>기술자명 *</Label><Input value={form.technician_name || ""} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} /></div>
            <div><Label>근무처(회사명) *</Label><Input value={form.company || ""} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>부서</Label><Input value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>직위</Label><Input value={form.position || ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>입사일</Label><Input type="date" value={form.hire_date || ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
              <div><Label>퇴사일 (재직중이면 비움)</Label><Input type="date" value={form.resign_date || ""} onChange={(e) => setForm({ ...form, resign_date: e.target.value })} /></div>
            </div>
            <div><Label>담당업무</Label><Input value={form.duties || ""} onChange={(e) => setForm({ ...form, duties: e.target.value })} /></div>
            <div><Label>비고</Label><Input value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={save}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이력을 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>{deleteRow?.technician_name} - {deleteRow?.company}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
