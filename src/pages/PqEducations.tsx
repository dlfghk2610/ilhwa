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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, FileDown, Paperclip, AlertTriangle } from "lucide-react";
import { PDFDocument } from "pdf-lib";

type Row = {
  id: string;
  technician_name: string;
  course_name: string;
  hours: number | null;
  completed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  institution: string | null;
  notes: string | null;
  certificate_path: string | null;
};

const BUCKET = "pq-education-certs";

export default function PqEducations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState<string>("");
  const [noticeDate, setNoticeDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    technician_name: "", course_name: "", hours: "",
    start_date: "", end_date: "", completed_date: "",
    institution: "", notes: "",
  });
  const [certFile, setCertFile] = useState<File | null>(null);
  const [removeCert, setRemoveCert] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("pq_educations").select("*")
      .order("end_date", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message); else setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const technicians = useMemo(() => Array.from(new Set(rows.map(r => r.technician_name))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (techFilter && r.technician_name !== techFilter) return false;
      if (!q) return true;
      return [r.technician_name, r.course_name, r.institution]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, techFilter]);

  // 공고일 기준 3년 이내 여부
  const daysBetween = (a: string, b: string) => Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
  const validityOf = (r: Row): { state: "ok" | "soon" | "expired" | "unknown"; days: number } => {
    const ref = r.end_date || r.completed_date;
    if (!ref || !noticeDate) return { state: "unknown", days: 0 };
    // 유효기한: 교육종료일 + 3년 (공고일이 그 이전이어야 인정)
    const expiry = new Date(ref);
    expiry.setFullYear(expiry.getFullYear() + 3);
    const days = daysBetween(expiry.toISOString().slice(0, 10), noticeDate);
    if (days < 0) return { state: "expired", days };
    if (days <= 90) return { state: "soon", days };
    return { state: "ok", days };
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ technician_name: techFilter || "", course_name: "", hours: "", start_date: "", end_date: "", completed_date: "", institution: "", notes: "" });
    setCertFile(null); setRemoveCert(false);
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      technician_name: r.technician_name, course_name: r.course_name, hours: r.hours?.toString() || "",
      start_date: r.start_date || "", end_date: r.end_date || "", completed_date: r.completed_date || "",
      institution: r.institution || "", notes: r.notes || "",
    });
    setCertFile(null); setRemoveCert(false);
    setOpen(true);
  };

  const uploadCert = async (file: File): Promise<string> => {
    if (!user) throw new Error("로그인이 필요합니다");
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/pdf" });
    if (error) throw error;
    return path;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.technician_name.trim() || !form.course_name.trim()) { toast.error("기술자명과 과정명을 입력하세요"); return; }
    setSaving(true);
    try {
      let cert_path = editing?.certificate_path ?? null;
      if (removeCert && cert_path) {
        await supabase.storage.from(BUCKET).remove([cert_path]).catch(() => {});
        cert_path = null;
      }
      if (certFile) {
        if (cert_path) await supabase.storage.from(BUCKET).remove([cert_path]).catch(() => {});
        cert_path = await uploadCert(certFile);
      }
      const payload: any = {
        technician_name: form.technician_name.trim(),
        course_name: form.course_name.trim(),
        hours: form.hours ? Number(form.hours) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        completed_date: form.completed_date || form.end_date || null,
        institution: form.institution || null,
        notes: form.notes || null,
        certificate_path: cert_path,
      };
      if (editing) {
        const { error } = await (supabase as any).from("pq_educations").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료");
      } else {
        const { error } = await (supabase as any).from("pq_educations").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료");
      }
      setOpen(false); load();
    } catch (err: any) {
      toast.error(err.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!delId) return;
    const r = rows.find(x => x.id === delId);
    if (r?.certificate_path) await supabase.storage.from(BUCKET).remove([r.certificate_path]).catch(() => {});
    const { error } = await (supabase as any).from("pq_educations").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setDelId(null);
  };

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelAll = () => {
    const visible = filtered.filter(r => r.certificate_path);
    if (visible.every(r => selected.has(r.id))) {
      setSelected(prev => { const n = new Set(prev); visible.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); visible.forEach(r => n.add(r.id)); return n; });
    }
  };

  const mergeAndDownload = async () => {
    const targets = rows.filter(r => selected.has(r.id) && r.certificate_path);
    if (targets.length === 0) { toast.error("선택한 항목 중 PDF가 있는 항목이 없습니다"); return; }
    setMerging(true);
    try {
      const out = await PDFDocument.create();
      for (const r of targets) {
        const { data, error } = await supabase.storage.from(BUCKET).download(r.certificate_path!);
        if (error) { toast.error(`${r.course_name} PDF 다운로드 실패`); continue; }
        try {
          const buf = await data.arrayBuffer();
          const src = await PDFDocument.load(buf);
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
        } catch (e: any) {
          toast.error(`${r.course_name} 병합 실패 (PDF 형식이 아닐 수 있음)`);
        }
      }
      const bytes = await out.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `교육수료증_병합_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${targets.length}건 병합 완료`);
    } catch (e: any) {
      toast.error(e.message || "병합 실패");
    } finally {
      setMerging(false);
    }
  };

  const previewCert = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const fmtPeriod = (r: Row) => {
    if (r.start_date && r.end_date) return `${r.start_date} ~ ${r.end_date}`;
    if (r.end_date) return r.end_date;
    if (r.start_date) return `${r.start_date} ~`;
    return r.completed_date || "-";
  };

  return (
    <AppLayout title="PQ 기술자별 교육현황">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">공고일 (3년 유효성 기준)</Label>
              <Input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label className="text-xs">기술자 필터</Label>
              <select className="h-10 border rounded-md px-2 bg-background text-sm w-44"
                value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
                <option value="">전체</option>
                {technicians.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Label className="text-xs">검색</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="기술자/과정/기관" className="pl-8" />
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={mergeAndDownload} disabled={merging || selected.size === 0}>
                {merging ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}
                선택 PDF 병합 ({selected.size})
              </Button>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />교육 등록</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            * 공고일 기준 교육 종료일로부터 3년 이내인 교육만 인정됩니다. 만료 임박(90일 이내)/만료된 항목은 경고가 표시됩니다.
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.filter(r => r.certificate_path).every(r => selected.has(r.id))}
                    onCheckedChange={toggleSelAll}
                  />
                </TableHead>
                <TableHead>기술자명</TableHead>
                <TableHead>교육과정명</TableHead>
                <TableHead>교육기간</TableHead>
                <TableHead className="text-right">이수시간</TableHead>
                <TableHead>교육기관</TableHead>
                <TableHead>유효성</TableHead>
                <TableHead>수료증</TableHead>
                <TableHead className="w-24 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">데이터가 없습니다</TableCell></TableRow>
              ) : filtered.map((r) => {
                const v = validityOf(r);
                return (
                  <TableRow key={r.id} className={v.state === "expired" ? "bg-destructive/5" : v.state === "soon" ? "bg-yellow-500/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        disabled={!r.certificate_path}
                        onCheckedChange={() => toggleSel(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.technician_name}</TableCell>
                    <TableCell>{r.course_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtPeriod(r)}</TableCell>
                    <TableCell className="text-right">{r.hours ?? "-"}</TableCell>
                    <TableCell>{r.institution || "-"}</TableCell>
                    <TableCell>
                      {v.state === "expired" ? (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />만료 ({Math.abs(v.days)}일 경과)</Badge>
                      ) : v.state === "soon" ? (
                        <Badge className="bg-yellow-500 hover:bg-yellow-500/90 gap-1"><AlertTriangle className="h-3 w-3" />만료 임박 (D-{v.days})</Badge>
                      ) : v.state === "ok" ? (
                        <Badge variant="secondary">유효 (D-{v.days})</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.certificate_path ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => previewCert(r.certificate_path!)}>
                          <Paperclip className="h-3.5 w-3.5 mr-1" />보기
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">없음</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "교육 수정" : "교육 신규 등록"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>기술자명 *</Label><Input value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} required list="tech-list" /></div>
                <datalist id="tech-list">{technicians.map(n => <option key={n} value={n} />)}</datalist>
                <div><Label>이수시간(h)</Label><Input type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
              </div>
              <div><Label>교육과정명 *</Label><Input value={form.course_name} onChange={(e) => setForm({ ...form, course_name: e.target.value })} required /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>교육 시작일</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>교육 종료일</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
                <div><Label>이수일</Label><Input type="date" value={form.completed_date} onChange={(e) => setForm({ ...form, completed_date: e.target.value })} /></div>
              </div>
              <div><Label>교육기관</Label><Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></div>
              <div>
                <Label>수료증 PDF</Label>
                {editing?.certificate_path && !removeCert && (
                  <div className="text-xs text-muted-foreground mb-1">현재 첨부됨 · <button type="button" className="underline" onClick={() => setRemoveCert(true)}>제거</button></div>
                )}
                {removeCert && <div className="text-xs text-destructive mb-1">저장 시 기존 PDF가 삭제됩니다.</div>}
                <Input type="file" accept="application/pdf" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
              </div>
              <div><Label>비고</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}저장</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>되돌릴 수 없습니다. 첨부된 수료증 PDF도 함께 삭제됩니다.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={remove}>삭제</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
