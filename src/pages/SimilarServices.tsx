import { useEffect, useState } from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload, Search, Loader2 } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";

type Row = {
  id: string;
  project_name: string;
  client: string | null;
  service_type: string | null;
  evaluation_type: string | null;
  service_overview: string | null;
  contract_amount: number | null;
  contract_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  participation_rate: number | null;
  company_share_rate: string | null;
  share_amount: number | null;
  is_dual_participation: boolean;
  notes: string | null;
};

const emptyForm = {
  project_name: "",
  client: "",
  service_type: "",
  evaluation_type: "",
  service_overview: "",
  contract_amount: "",
  contract_date: "",
  start_date: "",
  completion_date: "",
  participation_rate: "",
  company_share_rate: "",
  share_amount: "",
  is_dual_participation: false,
  notes: "",
};

type FormState = typeof emptyForm;

export default function SimilarServices() {
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("similar_services").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 자동 계산: 계약금액 × 참여지분율 (수기 입력 후엔 덮어쓰지 않음)
  useEffect(() => {
    if (shareAmountTouched) return;
    if (form.is_dual_participation) return;
    const amt = Number(form.contract_amount);
    const p = Number(form.participation_rate);
    if (!amt || isNaN(amt)) return;
    let calc = amt;
    if (p && !isNaN(p)) calc = calc * (p / 100);
    if (p) {
      setForm((prev) => ({ ...prev, share_amount: String(Math.round(calc)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contract_amount, form.participation_rate, form.is_dual_participation]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShareAmountTouched(false);
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({
      project_name: row.project_name ?? "",
      client: row.client ?? "",
      service_type: row.service_type ?? "",
      evaluation_type: row.evaluation_type ?? "",
      service_overview: row.service_overview ?? "",
      contract_amount: row.contract_amount?.toString() ?? "",
      contract_date: row.contract_date ?? "",
      start_date: row.start_date ?? "",
      completion_date: row.completion_date ?? "",
      participation_rate: row.participation_rate?.toString() ?? "",
      company_share_rate: row.company_share_rate?.toString() ?? "",
      share_amount: row.share_amount?.toString() ?? "",
      is_dual_participation: row.is_dual_participation ?? false,
      notes: row.notes ?? "",
    });
    setShareAmountTouched(true); // 수정 시 자동덮어쓰기 방지
    setOpen(true);
  };

  const num = (v: string) => (v === "" || v === null ? null : Number(v));
  const txt = (v: string) => (v === "" ? null : v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name) { toast.error("사업명은 필수입니다"); return; }

    const payload: any = {
      project_name: form.project_name,
      client: txt(form.client),
      service_type: txt(form.service_type),
      evaluation_type: txt(form.evaluation_type),
      service_overview: txt(form.service_overview),
      contract_amount: num(form.contract_amount),
      contract_date: txt(form.contract_date),
      start_date: txt(form.start_date),
      completion_date: txt(form.completion_date),
      participation_rate: form.is_dual_participation ? null : num(form.participation_rate),
      company_share_rate: form.is_dual_participation ? null : txt(form.company_share_rate),
      share_amount: num(form.share_amount),
      is_dual_participation: form.is_dual_participation,
      notes: txt(form.notes),
    };

    setSubmitting(true);
    if (editing) {
      const { error } = await supabase.from("similar_services").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("수정 완료"); setOpen(false); load(); }
    } else {
      const { error } = await supabase.from("similar_services").insert({ ...payload, created_by: user.id });
      if (error) toast.error(error.message);
      else { toast.success("등록 완료"); setOpen(false); load(); }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("similar_services").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const filtered = rows.filter((r) =>
    !search ||
    [r.project_name, r.client, r.service_type, r.evaluation_type]
      .some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const fmtNum = (v: number | null) => (v == null ? "-" : Number(v).toLocaleString());
  const fmtDate = (v: string | null) => (v ? String(v).slice(0, 10) : "-");

  const handleExport = () => {
    const data = filtered.map((r) => ({
      "사업명": r.project_name,
      "발주처": r.client,
      "사업종류": r.service_type,
      "평가종류": r.evaluation_type,
      "용역개요": r.service_overview,
      "계약금액": r.contract_amount,
      "계약일": r.contract_date,
      "착수일": r.start_date,
      "준공일": r.completion_date,
      "2종 분담참여": r.is_dual_participation ? "Y" : "N",
      "참여지분율(%)": r.participation_rate,
      "각사지분율": r.company_share_rate,
      "지분금액": r.share_amount,
      "비고": r.notes,
    }));
    exportToExcel(data, "PQ유사용역");
    toast.success("엑셀 다운로드 완료");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) { if (e.target) e.target.value = ""; return; }
    try {
      const data = await importFromExcel<Record<string, any>>(file);
      const toDate = (v: any) => {
        if (v === "" || v == null) return null;
        if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
        return String(v).slice(0, 10);
      };
      const records = data.map((r) => ({
        created_by: user.id,
        project_name: r["사업명"] ?? "",
        client: r["발주처"] ?? null,
        service_type: r["사업종류"] ?? null,
        evaluation_type: r["평가종류"] ?? null,
        service_overview: r["용역개요"] ?? null,
        contract_amount: r["계약금액"] != null && r["계약금액"] !== "" ? Number(r["계약금액"]) : null,
        contract_date: toDate(r["계약일"]),
        start_date: toDate(r["착수일"]),
        completion_date: toDate(r["준공일"]),
        is_dual_participation: String(r["2종 분담참여"] ?? "").toUpperCase() === "Y",
        participation_rate: r["참여지분율(%)"] != null && r["참여지분율(%)"] !== "" ? Number(r["참여지분율(%)"]) : null,
        company_share_rate: r["각사지분율"] != null && r["각사지분율"] !== "" ? String(r["각사지분율"]) : null,
        share_amount: r["지분금액"] != null && r["지분금액"] !== "" ? Number(r["지분금액"]) : null,
        notes: r["비고"] ?? null,
      })).filter((r) => r.project_name);
      if (records.length === 0) { toast.error("가져올 데이터가 없습니다"); return; }
      const { error } = await supabase.from("similar_services").insert(records);
      if (error) toast.error(error.message);
      else { toast.success(`${records.length}건 가져오기 완료`); load(); }
    } catch (err: any) {
      toast.error("엑셀 처리 오류: " + (err?.message ?? ""));
    } finally {
      e.target.value = "";
    }
  };

  return (
    <AppLayout title="PQ 유사용역 (회사실적)">
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
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>사업명<span className="text-destructive">*</span></Label>
                        <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>발주처</Label>
                        <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>사업종류</Label>
                        <Input value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>평가종류</Label>
                        <Input value={form.evaluation_type} onChange={(e) => setForm({ ...form, evaluation_type: e.target.value })} placeholder="예: PQ, TP, SOQ" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>계약일</Label>
                        <Input type="date" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>착수일</Label>
                        <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>준공일</Label>
                        <Input type="date" value={form.completion_date} onChange={(e) => setForm({ ...form, completion_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>용역개요</Label>
                        <Textarea rows={3} value={form.service_overview} onChange={(e) => setForm({ ...form, service_overview: e.target.value })} />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label>계약금액 (원)</Label>
                        <Input
                          inputMode="decimal"
                          value={form.contract_amount === "" ? "" : Number(form.contract_amount).toLocaleString()}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.-]/g, "");
                            setForm({ ...form, contract_amount: raw });
                          }}
                        />
                      </div>

                      <div className="md:col-span-2 flex items-center gap-2 p-3 rounded-md border bg-muted/30">
                        <Checkbox id="dual" checked={form.is_dual_participation}
                          onCheckedChange={(v) => {
                            const checked = !!v;
                            setForm({
                              ...form,
                              is_dual_participation: checked,
                              participation_rate: checked ? "" : form.participation_rate,
                              company_share_rate: checked ? "" : form.company_share_rate,
                            });
                            if (checked) setShareAmountTouched(true);
                          }} />
                        <Label htmlFor="dual" className="cursor-pointer">2종 분담참여 (체크 시 지분율 입력 생략)</Label>
                      </div>

                      <div className="space-y-1.5">
                        <Label>참여지분율 (%)</Label>
                        <Input type="number" step="any" disabled={form.is_dual_participation}
                          value={form.participation_rate}
                          onChange={(e) => setForm({ ...form, participation_rate: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>각사지분율</Label>
                        <Textarea rows={2} disabled={form.is_dual_participation}
                          value={form.company_share_rate}
                          onChange={(e) => setForm({ ...form, company_share_rate: e.target.value })}
                          placeholder="예: A사 60% / B사 40%" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>지분금액 (원) <span className="text-xs text-muted-foreground">— 자동 계산되며 수기 수정 가능</span></Label>
                        <Input
                          inputMode="decimal"
                          value={form.share_amount === "" ? "" : Number(form.share_amount).toLocaleString()}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.-]/g, "");
                            setShareAmountTouched(true);
                            setForm({ ...form, share_amount: raw });
                          }}
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label>비고</Label>
                        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                      </div>
                    </div>
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
                  <TableHead className="w-[200px]">사업명</TableHead>
                  <TableHead className="w-[200px]">발주처</TableHead>
                  <TableHead className="whitespace-nowrap">사업종류</TableHead>
                  <TableHead className="whitespace-nowrap">평가종류</TableHead>
                  <TableHead className="whitespace-nowrap text-right">계약금액</TableHead>
                  <TableHead className="whitespace-nowrap">계약일</TableHead>
                  <TableHead className="whitespace-nowrap">착수일</TableHead>
                  <TableHead className="whitespace-nowrap">준공일</TableHead>
                  <TableHead className="whitespace-nowrap text-center">2종</TableHead>
                  <TableHead className="whitespace-nowrap text-right">참여(%)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">각사(%)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">지분금액</TableHead>
                  <TableHead className="text-right w-[120px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                    데이터가 없습니다. 상단 [등록] 버튼으로 추가하세요.
                  </TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium w-[200px] whitespace-normal break-words align-top">{r.project_name}</TableCell>
                    <TableCell className="w-[200px] whitespace-normal break-words align-top">{r.client ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.service_type ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.evaluation_type ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{fmtNum(r.contract_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.contract_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.completion_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">{r.is_dual_participation ? "✓" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{r.is_dual_participation ? "-" : fmtNum(r.participation_rate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{r.is_dual_participation ? "-" : fmtNum(r.company_share_rate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{fmtNum(r.share_amount)}</TableCell>
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
    </AppLayout>
  );
}
