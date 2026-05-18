import { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, X, Upload, Sparkles, FileText, Download } from "lucide-react";

type Period = { start?: string; end?: string };
type Participant = {
  name: string;
  birth_date?: string;
  periods?: Period[];
  specialty?: string;
  position?: string;
  responsibility?: string;
};
type Phase = { label: string; amount: number | null; contract_amount?: number | null; share_rate?: number | null; share_amount?: number | null; contract_date?: string | null; start_date?: string | null; end_date?: string | null; pdf_path?: string | null; participants?: Participant[] };

type Row = {
  id: string;
  project_name: string;
  service_overview: string | null;
  client: string | null;
  contract_periods: Period[];
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_date: string | null;
  completion_date: string | null;
  contract_amount: number | null;
  share_rate: number | null;
  share_amount: number | null;
  company_share_rate: string | null;
  evaluation_types: string[];
  service_types: string[];
  participation_rate: number | null;
  participants: Participant[];
  participant_file_path: string | null;
  cert_pdf_path: string | null;
  phases: Phase[];
  is_private: boolean;
  is_under_90days: boolean;
  is_lh_completion: boolean;
  is_progress: boolean;
  is_dual_participation: boolean;
  notes: string | null;
};

const EVAL_OPTIONS = ["평가", "전략", "사후", "소규모"];

const isoToDisplay = (v?: string | null) => (v ? v.replace(/-/g, ".") : "");
const displayToIso = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};
const formatDate = (v: string) => {
  const d = (v || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
};

function DateInput({ value, onChange, className, placeholder = "YYYY.MM.DD" }: { value: string; onChange: (iso: string) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState<string>(isoToDisplay(value));
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);
  return (
    <Input className={className} value={text} placeholder={placeholder} maxLength={10} inputMode="numeric"
      onChange={(e) => { const f = formatDate(e.target.value); setText(f); onChange(displayToIso(f)); }} />
  );
}

const fmt = (n: number | null | undefined) => n == null || isNaN(Number(n)) ? "" : Number(n).toLocaleString();

const emptyForm = {
  project_name: "",
  service_overview: "",
  client: "",
  contract_periods: [{ start: "", end: "" }] as Period[],
  announcement_date: "",
  completion_date: "",
  contract_amount: "",
  share_rate: "",
  share_amount: "",
  company_share_rate: "",
  evaluation_types: [] as string[],
  service_types: [] as string[],
  service_type_input: "",
  participation_rate: "",
  participants: [] as Participant[],
  participant_file: null as File | null,
  participant_file_path: "",
  cert_pdf_file: null as File | null,
  cert_pdf_path: "",
  phases: [] as Phase[],
  is_private: false,
  is_under_90days: false,
  is_lh_completion: false,
  is_progress: false,
  is_dual_participation: false,
  notes: "",
};
type FormState = typeof emptyForm;

export default function PerformanceDatabase() {
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
  const [extracting, setExtracting] = useState(false);

  useEffect(() => { fetchRows(); }, []);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase.from("performance_records").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as any[]).map(normalize));
    setLoading(false);
  }

  function normalize(r: any): Row {
    return {
      ...r,
      evaluation_types: Array.isArray(r.evaluation_types) ? r.evaluation_types : [],
      service_types: Array.isArray(r.service_types) ? r.service_types : [],
      participants: Array.isArray(r.participants) ? r.participants : [],
      contract_periods: Array.isArray(r.contract_periods) ? r.contract_periods : [],
      phases: Array.isArray(r.phases) ? r.phases : [],
    };
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShareAmountTouched(false);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      project_name: r.project_name || "",
      service_overview: r.service_overview || "",
      client: r.client || "",
      contract_periods: r.contract_periods.length > 0 ? r.contract_periods : [{ start: "", end: "" }],
      announcement_date: r.announcement_date || "",
      completion_date: r.completion_date || "",
      contract_amount: r.contract_amount?.toString() ?? "",
      share_rate: r.share_rate?.toString() ?? "",
      share_amount: r.share_amount?.toString() ?? "",
      company_share_rate: r.company_share_rate || "",
      evaluation_types: r.evaluation_types,
      service_types: r.service_types,
      service_type_input: "",
      participation_rate: r.participation_rate?.toString() ?? "",
      participants: r.participants,
      participant_file: null,
      participant_file_path: r.participant_file_path || "",
      cert_pdf_file: null,
      cert_pdf_path: r.cert_pdf_path || "",
      phases: r.phases,
      is_private: r.is_private,
      is_under_90days: r.is_under_90days,
      is_lh_completion: r.is_lh_completion,
      is_progress: r.is_progress,
      is_dual_participation: r.is_dual_participation,
      notes: r.notes || "",
    });
    setShareAmountTouched(true);
    setOpen(true);
  }

  // 지분금액 자동계산
  useEffect(() => {
    if (shareAmountTouched) return;
    const amt = Number(form.contract_amount);
    const rate = Number(form.share_rate);
    if (!isNaN(amt) && !isNaN(rate) && form.contract_amount && form.share_rate) {
      setForm((f) => ({ ...f, share_amount: Math.round(amt * rate / 100).toString() }));
    }
  }, [form.contract_amount, form.share_rate, shareAmountTouched]);

  async function handleExtractParticipants() {
    if (!form.participant_file) { toast.error("먼저 파일을 선택하세요"); return; }
    setExtracting(true);
    try {
      const file = form.participant_file;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("parse-participant-list", {
        body: { fileBase64, mimeType: file.type || "application/pdf" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const participants: Participant[] = data?.participants ?? [];
      setForm((f) => ({ ...f, participants }));
      toast.success(`${participants.length}명 추출 완료`);
    } catch (e: any) { toast.error(e.message || "추출 실패"); }
    finally { setExtracting(false); }
  }

  async function downloadFromBucket(bucket: "performance-certs" | "participant-lists", path: string) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = path.split("/").pop() || "download";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "다운로드 실패"); }
  }

  async function handleSubmit() {
    if (!user) return;
    if (!form.project_name.trim()) { toast.error("사업명을 입력하세요"); return; }
    setSubmitting(true);
    try {
      let participant_file_path = form.participant_file_path;
      if (form.participant_file) {
        const ext = form.participant_file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("participant-lists").upload(path, form.participant_file, { upsert: false });
        if (error) throw error;
        participant_file_path = path;
      }
      let cert_pdf_path = form.cert_pdf_path;
      if (form.cert_pdf_file) {
        const path = `${user.id}/${Date.now()}_cert.pdf`;
        const { error } = await supabase.storage.from("performance-certs").upload(path, form.cert_pdf_file, { contentType: "application/pdf", upsert: true });
        if (error) throw error;
        cert_pdf_path = path;
      }

      const cleanedPeriods = form.contract_periods.filter((p) => p.start || p.end);
      const earliestStart = cleanedPeriods.map((p) => p.start).filter(Boolean).sort()[0] || null;
      const latestEnd = cleanedPeriods.map((p) => p.end).filter(Boolean).sort().slice(-1)[0] || null;

      const payload: any = {
        project_name: form.project_name.trim(),
        service_overview: form.service_overview || null,
        client: form.client || null,
        contract_periods: cleanedPeriods,
        contract_start_date: earliestStart,
        contract_end_date: latestEnd,
        announcement_date: form.announcement_date || null,
        completion_date: form.completion_date || null,
        contract_amount: form.contract_amount ? Number(form.contract_amount) : null,
        share_rate: form.share_rate ? Number(form.share_rate) : null,
        share_amount: form.share_amount ? Number(form.share_amount) : null,
        company_share_rate: form.company_share_rate || null,
        evaluation_types: form.evaluation_types,
        service_types: form.service_types,
        participation_rate: form.participation_rate ? Number(form.participation_rate) : null,
        participants: form.participants,
        participant_file_path,
        cert_pdf_path,
        phases: form.phases,
        is_private: form.is_private,
        is_under_90days: form.is_under_90days,
        is_lh_completion: form.is_lh_completion,
        is_progress: form.is_progress,
        is_dual_participation: form.is_dual_participation,
        notes: form.notes || null,
      };

      if (editing) {
        const { error } = await supabase.from("performance_records").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료");
      } else {
        const { error } = await supabase.from("performance_records").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료");
      }
      setOpen(false);
      fetchRows();
    } catch (e: any) { toast.error(e.message || "저장 실패"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("performance_records").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); fetchRows(); }
    setDeleteId(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.project_name, r.client, ...(r.participants?.map((p) => p.name) ?? []), ...r.service_types, ...r.evaluation_types]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    );
  }, [rows, search]);

  function addServiceType() {
    const v = form.service_type_input.trim();
    if (!v || form.service_types.includes(v)) { setForm({ ...form, service_type_input: "" }); return; }
    setForm({ ...form, service_types: [...form.service_types, v], service_type_input: "" });
  }

  function updateContractPeriod(idx: number, key: "start" | "end", v: string) {
    setForm((f) => ({ ...f, contract_periods: f.contract_periods.map((p, i) => i === idx ? { ...p, [key]: v } : p) }));
  }
  function addContractPeriod() { setForm((f) => ({ ...f, contract_periods: [...f.contract_periods, { start: "", end: "" }] })); }
  function removeContractPeriod(idx: number) {
    setForm((f) => ({ ...f, contract_periods: f.contract_periods.length === 1 ? [{ start: "", end: "" }] : f.contract_periods.filter((_, i) => i !== idx) }));
  }

  function addPhase() {
    setForm((f) => {
      const isPost = f.evaluation_types.includes("사후");
      const label = isPost ? `${f.phases.length + 1}차` : `${f.phases.length + 1}단계`;
      return { ...f, phases: [...f.phases, { label, amount: null, contract_amount: null, share_rate: null, share_amount: null, contract_date: null, start_date: null, end_date: null, pdf_path: null, participants: [] }] };
    });
  }
  function updatePhase(idx: number, patch: Partial<Phase>) {
    setForm((f) => ({ ...f, phases: f.phases.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  }
  function removePhase(idx: number) {
    setForm((f) => ({ ...f, phases: f.phases.filter((_, i) => i !== idx) }));
  }
  function updatePhaseParticipant(phIdx: number, partIdx: number, key: keyof Participant, val: string) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => j === partIdx ? { ...p, [key]: val } : p) }) }));
  }
  function addPhaseParticipant(phIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: [...(ph.participants || []), { name: "", periods: [{ start: "", end: "" }] }] }) }));
  }
  function removePhaseParticipant(phIdx: number, partIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).filter((_, j) => j !== partIdx) }) }));
  }
  function updatePhaseParticipantPeriod(phIdx: number, partIdx: number, prdIdx: number, key: "start" | "end", v: string) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => {
      if (j !== partIdx) return p;
      const periods = (p.periods && p.periods.length > 0) ? [...p.periods] : [{ start: "", end: "" }];
      periods[prdIdx] = { ...periods[prdIdx], [key]: v };
      return { ...p, periods };
    }) }) }));
  }
  function addPhaseParticipantPeriod(phIdx: number, partIdx: number) {
    setForm((f) => ({ ...f, phases: f.phases.map((ph, i) => i !== phIdx ? ph : { ...ph, participants: (ph.participants || []).map((p, j) => j !== partIdx ? p : { ...p, periods: [...(p.periods || []), { start: "", end: "" }] }) }) }));
  }

  function updateParticipant(idx: number, key: keyof Participant, val: string) {
    setForm((f) => ({ ...f, participants: f.participants.map((p, i) => i === idx ? { ...p, [key]: val } : p) }));
  }
  function removeParticipant(idx: number) { setForm((f) => ({ ...f, participants: f.participants.filter((_, i) => i !== idx) })); }
  function addParticipant() { setForm((f) => ({ ...f, participants: [...f.participants, { name: "", periods: [{ start: "", end: "" }] }] })); }
  function updateParticipantPeriod(pIdx: number, prdIdx: number, key: "start" | "end", v: string) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => {
        if (i !== pIdx) return p;
        const periods = (p.periods && p.periods.length > 0) ? [...p.periods] : [{ start: "", end: "" }];
        periods[prdIdx] = { ...periods[prdIdx], [key]: v };
        return { ...p, periods };
      }),
    }));
  }
  function addParticipantPeriod(pIdx: number) {
    setForm((f) => ({
      ...f,
      participants: f.participants.map((p, i) => i === pIdx ? { ...p, periods: [...(p.periods || []), { start: "", end: "" }] } : p),
    }));
  }

  return (
    <AppLayout title="실적 데이터베이스 관리">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="사업명/발주처/기술자명/사업종류 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <div className="ml-auto">
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />사업 등록</Button>
          </div>
        </div>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사업명</TableHead>
                <TableHead>발주처</TableHead>
                <TableHead>계약기간</TableHead>
                <TableHead className="text-right">계약금액</TableHead>
                <TableHead className="text-right">지분금액</TableHead>
                <TableHead>평가</TableHead>
                <TableHead>사업종류</TableHead>
                <TableHead>참여인원</TableHead>
                <TableHead>파일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.project_name}
                    {r.is_private && <Badge variant="outline" className="ml-2">민간</Badge>}
                  </TableCell>
                  <TableCell>{r.client ?? "-"}</TableCell>
                  <TableCell className="whitespace-pre">{r.contract_periods.map((p) => `${isoToDisplay(p.start)} ~ ${isoToDisplay(p.end)}`).join("\n") || "-"}</TableCell>
                  <TableCell className="text-right">{fmt(r.contract_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.share_amount)}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{r.evaluation_types.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{r.service_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></TableCell>
                  <TableCell>{r.participants.length}명</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.cert_pdf_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("performance-certs", r.cert_pdf_path!)} title="실적증명PDF"><FileText className="h-4 w-4" /></Button>}
                      {r.participant_file_path && <Button size="icon" variant="ghost" onClick={() => downloadFromBucket("participant-lists", r.participant_file_path!)} title="참여자명단"><Download className="h-4 w-4" /></Button>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "사업 수정" : "사업 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* 기본 정보 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              <div>
                <Label>사업명 *</Label>
                <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div>
                <Label>사업개요</Label>
                <Textarea rows={2} value={form.service_overview} onChange={(e) => setForm({ ...form, service_overview: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>발주처</Label>
                  <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                </div>
                <div>
                  <Label>공고일</Label>
                  <DateInput value={form.announcement_date} onChange={(v) => setForm({ ...form, announcement_date: v })} />
                </div>
              </div>
            </div>

            {/* 계약기간 (다중) */}
            <div className="space-y-2 p-3 rounded-md bg-background border">
              <div className="flex items-center justify-between">
                <Label>계약기간 (여러개 가능)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addContractPeriod}><Plus className="h-3 w-3 mr-1" />추가</Button>
              </div>
              {form.contract_periods.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DateInput value={p.start || ""} onChange={(v) => updateContractPeriod(i, "start", v)} />
                  <span>~</span>
                  <DateInput value={p.end || ""} onChange={(v) => updateContractPeriod(i, "end", v)} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeContractPeriod(i)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label>준공일</Label>
                  <DateInput value={form.completion_date} onChange={(v) => setForm({ ...form, completion_date: v })} />
                </div>
                <div>
                  <Label>적용건수</Label>
                  <Input type="number" value={form.participation_rate} onChange={(e) => setForm({ ...form, participation_rate: e.target.value })} />
                </div>
              </div>
            </div>

            {/* 금액/지분 */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-primary/10 border">
              <div>
                <Label>계약금액</Label>
                <Input type="number" value={form.contract_amount} onChange={(e) => setForm({ ...form, contract_amount: e.target.value })} />
              </div>
              <div>
                <Label>지분율(%)</Label>
                <Input type="number" step="any" value={form.share_rate} onChange={(e) => setForm({ ...form, share_rate: e.target.value })} />
              </div>
              <div>
                <Label>지분금액 (자동)</Label>
                <Input type="number" value={form.share_amount} onChange={(e) => { setShareAmountTouched(true); setForm({ ...form, share_amount: e.target.value }); }} />
              </div>
              <div>
                <Label>각사지분율</Label>
                <Input value={form.company_share_rate} onChange={(e) => setForm({ ...form, company_share_rate: e.target.value })} placeholder="예: A사 50, B사 30, C사 20" />
              </div>
            </div>

            {/* 평가/사업종류 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              <div>
                <Label>평가종류</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {EVAL_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5">
                      <Checkbox checked={form.evaluation_types.includes(opt)} onCheckedChange={(c) => setForm((f) => ({ ...f, evaluation_types: c ? [...f.evaluation_types, opt] : f.evaluation_types.filter((x) => x !== opt) }))} />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>사업종류</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.service_types.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button type="button" onClick={() => setForm((f) => ({ ...f, service_types: f.service_types.filter((x) => x !== t) }))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={form.service_type_input} onChange={(e) => setForm({ ...form, service_type_input: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addServiceType(); } }} placeholder="사업종류 입력 후 Enter 또는 추가" />
                  <Button type="button" variant="outline" onClick={addServiceType}>추가</Button>
                </div>
              </div>
            </div>

            {/* 플래그 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 rounded-md bg-background border">
              {[
                { k: "is_private", l: "민간사업" },
                { k: "is_under_90days", l: "90일미만 포함" },
                { k: "is_lh_completion", l: "LH기성실적" },
                { k: "is_progress", l: "기성실적 포함" },
                { k: "is_dual_participation", l: "분담사업 포함" },
              ].map(({ k, l }) => (
                <label key={k} className="flex items-center gap-2">
                  <Checkbox checked={(form as any)[k]} onCheckedChange={(c) => setForm({ ...form, [k]: !!c } as any)} />
                  <span className="text-sm">{l}</span>
                </label>
              ))}
            </div>

            {/* 참여 기술자 */}
            <div className="space-y-2 p-3 rounded-md bg-background border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>참여 기술자</Label>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input type="file" accept=".pdf,.docx" className="max-w-xs" onChange={(e) => setForm({ ...form, participant_file: e.target.files?.[0] || null })} />
                  <Button type="button" size="sm" variant="outline" disabled={!form.participant_file || extracting} onClick={handleExtractParticipants}>
                    {extracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}자동추출
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addParticipant}><Plus className="h-3 w-3 mr-1" />수동추가</Button>
                </div>
              </div>
              {form.participant_file_path && !form.participant_file && (
                <div className="text-xs text-muted-foreground">기존 파일: {form.participant_file_path.split("/").pop()}</div>
              )}
              {form.participants.map((p, i) => (
                <div key={i} className="border rounded p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input className="max-w-[140px]" placeholder="성명" value={p.name} onChange={(e) => updateParticipant(i, "name", e.target.value)} />
                    <Input className="max-w-[120px]" placeholder="생년월일" value={p.birth_date || ""} onChange={(e) => updateParticipant(i, "birth_date", formatDate(e.target.value))} />
                    <Input className="max-w-[120px]" placeholder="전문분야" value={p.specialty || ""} onChange={(e) => updateParticipant(i, "specialty", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="직위" value={p.position || ""} onChange={(e) => updateParticipant(i, "position", e.target.value)} />
                    <Input className="max-w-[100px]" placeholder="책임정도" value={p.responsibility || ""} onChange={(e) => updateParticipant(i, "responsibility", e.target.value)} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeParticipant(i)}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-1">
                    {(p.periods && p.periods.length > 0 ? p.periods : [{ start: "", end: "" }]).map((pd, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <DateInput className="max-w-[140px]" value={pd.start || ""} onChange={(v) => updateParticipantPeriod(i, j, "start", v)} />
                        <span>~</span>
                        <DateInput className="max-w-[140px]" value={pd.end || ""} onChange={(v) => updateParticipantPeriod(i, j, "end", v)} />
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => addParticipantPeriod(i)}><Plus className="h-3 w-3 mr-1" />참여기간 추가</Button>
                  </div>
                </div>
              ))}
            </div>

            {/* 차수/분담사업 단계 */}
            {(form.is_dual_participation || form.evaluation_types.includes("사후")) && (
              <div className="space-y-2 p-3 rounded-md bg-background border">
                <div className="flex items-center justify-between">
                  <Label>{form.evaluation_types.includes("사후") ? "사후 차수별 정보" : "분담사업 단계"}</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addPhase}><Plus className="h-3 w-3 mr-1" />{form.evaluation_types.includes("사후") ? "차수 추가" : "단계 추가"}</Button>
                </div>
                {form.phases.map((p, i) => (
                  <div key={i} className="border rounded p-2 space-y-2 bg-muted/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Input placeholder="차수/단계명" value={p.label} onChange={(e) => updatePhase(i, { label: e.target.value })} />
                      <Input type="number" placeholder="계약금액" value={p.contract_amount ?? ""} onChange={(e) => updatePhase(i, { contract_amount: e.target.value ? Number(e.target.value) : null })} />
                      <Input type="number" placeholder="지분율(%)" value={p.share_rate ?? ""} onChange={(e) => updatePhase(i, { share_rate: e.target.value ? Number(e.target.value) : null })} />
                      <Input type="number" placeholder="지분금액" value={p.share_amount ?? p.amount ?? ""} onChange={(e) => updatePhase(i, { share_amount: e.target.value ? Number(e.target.value) : null, amount: e.target.value ? Number(e.target.value) : null })} />
                      <DateInput value={p.contract_date || ""} onChange={(v) => updatePhase(i, { contract_date: v || null })} placeholder="계약일" />
                      <DateInput value={p.start_date || ""} onChange={(v) => updatePhase(i, { start_date: v || null })} placeholder="착수일" />
                      <DateInput value={p.end_date || ""} onChange={(v) => updatePhase(i, { end_date: v || null })} placeholder="종료일" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => removePhase(i)}><X className="h-4 w-4 mr-1" />삭제</Button>
                    </div>

                    {/* 차수별 참여 기술자 */}
                    <div className="border-t pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">참여 기술자</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => addPhaseParticipant(i)}><Plus className="h-3 w-3 mr-1" />기술자 추가</Button>
                      </div>
                      {(p.participants || []).map((pt, j) => (
                        <div key={j} className="border rounded p-2 space-y-2 bg-background">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input className="max-w-[140px]" placeholder="성명" value={pt.name} onChange={(e) => updatePhaseParticipant(i, j, "name", e.target.value)} />
                            <Input className="max-w-[120px]" placeholder="생년월일" value={pt.birth_date || ""} onChange={(e) => updatePhaseParticipant(i, j, "birth_date", formatDate(e.target.value))} />
                            <Input className="max-w-[120px]" placeholder="전문분야" value={pt.specialty || ""} onChange={(e) => updatePhaseParticipant(i, j, "specialty", e.target.value)} />
                            <Input className="max-w-[100px]" placeholder="직위" value={pt.position || ""} onChange={(e) => updatePhaseParticipant(i, j, "position", e.target.value)} />
                            <Input className="max-w-[100px]" placeholder="책임정도" value={pt.responsibility || ""} onChange={(e) => updatePhaseParticipant(i, j, "responsibility", e.target.value)} />
                            <Button type="button" size="icon" variant="ghost" onClick={() => removePhaseParticipant(i, j)}><X className="h-4 w-4" /></Button>
                          </div>
                          <div className="space-y-1">
                            {(pt.periods && pt.periods.length > 0 ? pt.periods : [{ start: "", end: "" }]).map((pd, k) => (
                              <div key={k} className="flex items-center gap-2">
                                <DateInput className="max-w-[140px]" value={pd.start || ""} onChange={(v) => updatePhaseParticipantPeriod(i, j, k, "start", v)} />
                                <span>~</span>
                                <DateInput className="max-w-[140px]" value={pd.end || ""} onChange={(v) => updatePhaseParticipantPeriod(i, j, k, "end", v)} />
                              </div>
                            ))}
                            <Button type="button" size="sm" variant="ghost" onClick={() => addPhaseParticipantPeriod(i, j)}><Plus className="h-3 w-3 mr-1" />참여기간 추가</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 파일/비고 */}
            <div className="space-y-3 p-3 rounded-md bg-background border">
              <div>
                <Label>실적증명 PDF</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" accept="application/pdf" onChange={(e) => setForm({ ...form, cert_pdf_file: e.target.files?.[0] || null })} />
                  {form.cert_pdf_path && !form.cert_pdf_file && (
                    <Button type="button" size="sm" variant="outline" onClick={() => downloadFromBucket("performance-certs", form.cert_pdf_path)}><Download className="h-3 w-3 mr-1" />다운로드</Button>
                  )}
                </div>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다. 마스터 데이터베이스에서 영구 삭제됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
