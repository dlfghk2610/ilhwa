import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload, Search, Loader2 } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea";
  required?: boolean;
};

type Props = {
  table: "bid_participations" | "personal_performances" | "personal_careers" | "technician_overlaps" | "similar_services";
  fields: FieldDef[];
  searchKeys: string[];
  exportName: string;
};

export function DataManager({ table, fields, searchKeys, exportName }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from(table).select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [table]);

  const openCreate = () => {
    setEditing(null);
    const empty: Record<string, any> = {};
    fields.forEach((f) => { empty[f.key] = ""; });
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    const data: Record<string, any> = {};
    fields.forEach((f) => { data[f.key] = row[f.key] ?? ""; });
    setForm(data);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    for (const f of fields) {
      if (f.required && !form[f.key]) { toast.error(`${f.label} 항목은 필수입니다`); return; }
    }
    const payload: Record<string, any> = {};
    fields.forEach((f) => {
      let v = form[f.key];
      if (v === "" || v === undefined) v = null;
      if (f.type === "number" && v !== null) v = Number(v);
      payload[f.key] = v;
    });
    setSubmitting(true);
    if (editing) {
      const { error } = await (supabase as any).from(table).update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("수정 완료"); setOpen(false); load(); }
    } else {
      const { error } = await (supabase as any).from(table).insert({ ...payload, created_by: user.id });
      if (error) toast.error(error.message);
      else { toast.success("등록 완료"); setOpen(false); load(); }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from(table).delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const handleExport = () => {
    const data = filtered.map((r) => {
      const o: Record<string, any> = {};
      fields.forEach((f) => { o[f.label] = r[f.key]; });
      return o;
    });
    exportToExcel(data, exportName);
    toast.success("엑셀 다운로드 완료");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const data = await importFromExcel<Record<string, any>>(file);
      const labelToKey: Record<string, string> = {};
      fields.forEach((f) => { labelToKey[f.label] = f.key; });
      const records = data.map((r) => {
        const o: Record<string, any> = { created_by: user.id };
        Object.entries(r).forEach(([label, val]) => {
          const key = labelToKey[label];
          if (!key) return;
          const fdef = fields.find((f) => f.key === key);
          if (val === "" || val === null || val === undefined) { o[key] = null; return; }
          if (fdef?.type === "number") o[key] = Number(val);
          else if (fdef?.type === "date") {
            if (typeof val === "number") {
              const d = new Date(Math.round((val - 25569) * 86400 * 1000));
              o[key] = d.toISOString().slice(0, 10);
            } else o[key] = String(val).slice(0, 10);
          } else o[key] = val;
        });
        return o;
      }).filter((r) => fields.some((f) => f.required ? r[f.key] : true));
      if (records.length === 0) { toast.error("가져올 데이터가 없습니다"); return; }
      const { error } = await (supabase as any).from(table).insert(records);
      if (error) toast.error(error.message);
      else { toast.success(`${records.length}건 가져오기 완료`); load(); }
    } catch (err: any) {
      toast.error("엑셀 파일 처리 중 오류: " + (err?.message ?? ""));
    } finally {
      e.target.value = "";
    }
  };

  const filtered = rows.filter((r) =>
    !search || searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const formatCell = (f: FieldDef, val: any) => {
    if (val === null || val === undefined || val === "") return "-";
    if (f.type === "number") return Number(val).toLocaleString();
    if (f.type === "date") return String(val).slice(0, 10);
    return String(val);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            <label>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <Button type="button" variant="outline" size="sm" asChild>
                <span className="cursor-pointer"><Upload className="mr-1 h-4 w-4" />엑셀 가져오기</span>
              </Button>
            </label>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />엑셀 내보내기</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={f.key}>{f.label}{f.required && <span className="text-destructive">*</span>}</Label>
                      {f.type === "textarea" ? (
                        <Textarea id={f.key} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                      ) : (
                        <Input id={f.key} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                          step={f.type === "number" ? "any" : undefined} />
                      )}
                    </div>
                  ))}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}저장
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {fields.map((f) => <TableHead key={f.key} className="whitespace-nowrap">{f.label}</TableHead>)}
                <TableHead className="text-right w-[120px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={fields.length + 1} className="text-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={fields.length + 1} className="text-center py-12 text-muted-foreground">
                  데이터가 없습니다. 상단 [등록] 버튼으로 추가하세요.
                </TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  {fields.map((f) => <TableCell key={f.key} className="whitespace-nowrap">{formatCell(f, r[f.key])}</TableCell>)}
                  <TableCell className="text-right">
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

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
