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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Loader2, Bell, X } from "lucide-react";

const EVAL_TYPES = ["적격심사", "협상에의한계약", "종합심사낙찰제", "기술제안", "표준", "기타"];
const SERVICE_TYPES = ["건축설계", "건설사업관리", "감리", "타당성조사", "기획", "기타"];
const STATUS_OPTIONS = ["검토중", "PQ제출", "입찰참여", "낙찰", "탈락", "포기", "완료"];

const clampDate = (v: string) => {
  if (!v) return "";
  const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
  if (!m) return v;
  const y = m[1].length > 4 ? m[1].slice(0, 4) : m[1].padStart(4, "0");
  return `${y}-${m[2]}-${m[3]}`;
};

type ShareRate = { company: string; rate: string };
type Participant = { name: string; role: string };

type BidRow = {
  id: string;
  project_name: string;
  client: string | null;
  announcement_date: string | null;
  pq_due_date: string | null;
  bid_start_date: string | null;
  bid_end_at: string | null;
  opening_at: string | null;
  estimated_amount: number | null;
  share_rates: ShareRate[];
  participants: Participant[];
  evaluation_types: string[];
  service_types: string[];
  agreement_approval_date: string | null;
  status: string | null;
  notes: string | null;
  notify_hours_before: number;
  notify_browser: boolean;
  notify_email: string | null;
  notify_phone: string | null;
  notified_at: string | null;
};

const emptyForm = (): Omit<BidRow, "id"> => ({
  project_name: "",
  client: "",
  announcement_date: "",
  pq_due_date: "",
  bid_start_date: "",
  bid_end_at: "",
  opening_at: "",
  estimated_amount: null,
  share_rates: [],
  participants: [],
  evaluation_types: [],
  service_types: [],
  agreement_approval_date: "",
  status: "검토중",
  notes: "",
  notify_hours_before: 24,
  notify_browser: true,
  notify_email: "",
  notify_phone: "",
  notified_at: null,
});

// Convert ISO timestamptz to value for <input type="datetime-local"> (local time)
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => {
  if (!v) return null;
  return new Date(v).toISOString();
};

const fmtDT = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dDisplay = (endIso: string | null) => {
  if (!endIso) return "-";
  const diff = new Date(endIso).getTime() - Date.now();
  if (diff <= 0) return "마감";
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `D-${Math.floor(h / 24)}일 ${h % 24}시간`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}시간 ${m}분`;
};

export default function Bids() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BidRow | null>(null);
  const [form, setForm] = useState<Omit<BidRow, "id">>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<number>(0);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bid_participations")
      .select("*")
      .order("bid_end_at", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    else {
      const normalized: BidRow[] = (data || []).map((r: any) => ({
        ...r,
        share_rates: Array.isArray(r.share_rates) ? r.share_rates : [],
        participants: Array.isArray(r.participants) ? r.participants : [],
        evaluation_types: r.evaluation_types || [],
        service_types: r.service_types || [],
      }));
      setRows(normalized);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Browser notification permission
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Deadline alert loop
  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      for (const r of rows) {
        if (!r.bid_end_at || r.notified_at) continue;
        const end = new Date(r.bid_end_at).getTime();
        const triggerAt = end - r.notify_hours_before * 3600000;
        if (now >= triggerAt && now < end) {
          // fire browser notification
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("입찰 마감 임박", {
                body: `${r.project_name} — 마감까지 ${dDisplay(r.bid_end_at)}`,
                tag: r.id,
              });
            } catch {}
          }
          toast.warning(`[입찰 마감 임박] ${r.project_name} (${dDisplay(r.bid_end_at)})`);
          await supabase
            .from("bid_participations")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", r.id);
          setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, notified_at: new Date().toISOString() } : x));
        }
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [rows]);

  // Restore scroll after dialog close
  useEffect(() => {
    if (!open && scrollRef.current) {
      window.scrollTo({ top: scrollRef.current });
    }
  }, [open, rows]);

  const openCreate = () => {
    scrollRef.current = window.scrollY;
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (row: BidRow) => {
    scrollRef.current = window.scrollY;
    setEditing(row);
    setForm({
      project_name: row.project_name || "",
      client: row.client || "",
      announcement_date: row.announcement_date || "",
      pq_due_date: row.pq_due_date || "",
      bid_start_date: row.bid_start_date || "",
      bid_end_at: row.bid_end_at || "",
      opening_at: row.opening_at || "",
      estimated_amount: row.estimated_amount,
      share_rates: row.share_rates || [],
      participants: row.participants || [],
      evaluation_types: row.evaluation_types || [],
      service_types: row.service_types || [],
      agreement_approval_date: row.agreement_approval_date || "",
      status: row.status || "검토중",
      notes: row.notes || "",
      notify_hours_before: row.notify_hours_before ?? 24,
      notify_browser: true,
      notify_email: row.notify_email || "",
      notify_phone: row.notify_phone || "",
      notified_at: row.notified_at,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name.trim()) { toast.error("사업명은 필수입니다"); return; }
    setSubmitting(true);

    const payload: any = {
      project_name: form.project_name.trim(),
      client: form.client || null,
      announcement_date: form.announcement_date || null,
      pq_due_date: form.pq_due_date || null,
      bid_start_date: form.bid_start_date || null,
      bid_end_at: form.bid_end_at || null,
      opening_at: form.opening_at || null,
      estimated_amount: form.estimated_amount === null || form.estimated_amount === ("" as any) ? null : Number(form.estimated_amount),
      share_rates: form.share_rates,
      participants: form.participants,
      evaluation_types: form.evaluation_types,
      service_types: form.service_types,
      agreement_approval_date: form.agreement_approval_date || null,
      status: form.status || null,
      notes: form.notes || null,
      notify_hours_before: Number(form.notify_hours_before) || 24,
      notify_browser: true,
      notify_email: form.notify_email || null,
      notify_phone: form.notify_phone || null,
    };

    // Reset notified_at if deadline changed or cleared
    if (editing) {
      if (editing.bid_end_at !== form.bid_end_at || editing.notify_hours_before !== form.notify_hours_before) {
        payload.notified_at = null;
      }
      const { error } = await supabase.from("bid_participations").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("수정 완료"); setOpen(false); load(); }
    } else {
      const { error } = await supabase.from("bid_participations").insert({ ...payload, created_by: user.id });
      if (error) toast.error(error.message);
      else { toast.success("등록 완료"); setOpen(false); load(); }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("bid_participations").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const filtered = useMemo(() => rows.filter((r) =>
    !search ||
    [r.project_name, r.client, r.status].some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()))
  ), [rows, search]);

  const enableEmail = !!form.notify_email && form.notify_email.length > 0;
  const enableSms = !!form.notify_phone && form.notify_phone.length > 0;
  const [emailChecked, setEmailChecked] = useState(false);
  const [smsChecked, setSmsChecked] = useState(false);

  useEffect(() => {
    setEmailChecked(!!form.notify_email);
    setSmsChecked(!!form.notify_phone);
  }, [open]);

  const toggleArr = (key: "evaluation_types" | "service_types", v: string) => {
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  return (
    <AppLayout title="입찰참가관리">
      <div className="space-y-4">
        <Card className="p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="사업명/발주처/상태 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
            </div>
          </div>
        </Card>

        <Card className="shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>사업명</TableHead>
                  <TableHead>발주처</TableHead>
                  <TableHead>공고일</TableHead>
                  <TableHead>PQ마감</TableHead>
                  <TableHead>입찰시작</TableHead>
                  <TableHead>입찰마감</TableHead>
                  <TableHead>개찰일시</TableHead>
                  <TableHead>D-</TableHead>
                  <TableHead className="text-right">추정금액</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>알림</TableHead>
                  <TableHead className="text-right w-[120px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                    데이터가 없습니다. 상단 [등록] 버튼으로 추가하세요.
                  </TableCell></TableRow>
                ) : filtered.map((r) => {
                  const end = r.bid_end_at ? new Date(r.bid_end_at).getTime() : 0;
                  const urgent = end && end - Date.now() < r.notify_hours_before * 3600000 && end > Date.now();
                  const expired = end && end <= Date.now();
                  return (
                    <TableRow key={r.id} className={urgent ? "bg-destructive/5" : ""}>
                      <TableCell className="whitespace-nowrap font-medium">{r.project_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.client || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.announcement_date || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.pq_due_date || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.bid_start_date || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDT(r.bid_end_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDT(r.opening_at)}</TableCell>
                      <TableCell className={"whitespace-nowrap " + (expired ? "text-muted-foreground" : urgent ? "text-destructive font-semibold" : "")}>{dDisplay(r.bid_end_at)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{r.estimated_amount ? Number(r.estimated_amount).toLocaleString() : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.status || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1">
                          <Bell className="h-3 w-3" /> {r.notify_hours_before}h
                          {r.notify_email && <span className="text-muted-foreground">📧</span>}
                          {r.notify_phone && <span className="text-muted-foreground">📱</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{editing ? "수정" : "신규 등록"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>사업명<span className="text-destructive">*</span></Label>
                  <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>발주처</Label>
                  <Input value={form.client || ""} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>상태</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status || ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>공고일</Label>
                  <Input type="date" min="1900-01-01" max="9999-12-31" value={form.announcement_date || ""} onChange={(e) => setForm({ ...form, announcement_date: clampDate(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>PQ제출마감일</Label>
                  <Input type="date" min="1900-01-01" max="9999-12-31" value={form.pq_due_date || ""} onChange={(e) => setForm({ ...form, pq_due_date: clampDate(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>입찰시작일</Label>
                  <Input type="date" min="1900-01-01" max="9999-12-31" value={form.bid_start_date || ""} onChange={(e) => setForm({ ...form, bid_start_date: clampDate(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>입찰마감일시</Label>
                  <Input type="datetime-local" value={toLocalInput(form.bid_end_at)} onChange={(e) => setForm({ ...form, bid_end_at: fromLocalInput(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>개찰일시</Label>
                  <Input type="datetime-local" value={toLocalInput(form.opening_at)} onChange={(e) => setForm({ ...form, opening_at: fromLocalInput(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>추정금액</Label>
                  <Input type="number" value={form.estimated_amount ?? ""} onChange={(e) => setForm({ ...form, estimated_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>협정승인일</Label>
                  <Input type="date" min="1900-01-01" max="9999-12-31" value={form.agreement_approval_date || ""} onChange={(e) => setForm({ ...form, agreement_approval_date: clampDate(e.target.value) })} />
                </div>
              </div>

              {/* 평가종류 */}
              <div className="space-y-1.5">
                <Label>평가종류</Label>
                <div className="flex flex-wrap gap-3">
                  {EVAL_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={form.evaluation_types.includes(t)} onCheckedChange={() => toggleArr("evaluation_types", t)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              {/* 사업종류 */}
              <div className="space-y-1.5">
                <Label>사업종류</Label>
                <div className="flex flex-wrap gap-3">
                  {SERVICE_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={form.service_types.includes(t)} onCheckedChange={() => toggleArr("service_types", t)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              {/* 각사 지분율 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>각사 지분율</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, share_rates: [...form.share_rates, { company: "", rate: "" }] })}><Plus className="h-3 w-3 mr-1" />추가</Button>
                </div>
                {form.share_rates.map((sr, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="회사명" value={sr.company} onChange={(e) => {
                      const arr = [...form.share_rates]; arr[i] = { ...arr[i], company: e.target.value }; setForm({ ...form, share_rates: arr });
                    }} />
                    <Input placeholder="지분율(%)" type="number" value={sr.rate} className="w-32" onChange={(e) => {
                      const arr = [...form.share_rates]; arr[i] = { ...arr[i], rate: e.target.value }; setForm({ ...form, share_rates: arr });
                    }} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, share_rates: form.share_rates.filter((_, idx) => idx !== i) })}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>

              {/* 참여인력 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>참여인력</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, participants: [...form.participants, { name: "", role: "" }] })}><Plus className="h-3 w-3 mr-1" />추가</Button>
                </div>
                {form.participants.map((p, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="이름" value={p.name} onChange={(e) => {
                      const arr = [...form.participants]; arr[i] = { ...arr[i], name: e.target.value }; setForm({ ...form, participants: arr });
                    }} />
                    <Input placeholder="역할" value={p.role} onChange={(e) => {
                      const arr = [...form.participants]; arr[i] = { ...arr[i], role: e.target.value }; setForm({ ...form, participants: arr });
                    }} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setForm({ ...form, participants: form.participants.filter((_, idx) => idx !== i) })}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>

              {/* 알림 */}
              <Card className="p-3 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 font-medium text-sm"><Bell className="h-4 w-4" />마감 알림</div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>마감 몇시간 전 알림</Label>
                    <Input type="number" min={1} value={form.notify_hours_before} onChange={(e) => setForm({ ...form, notify_hours_before: Number(e.target.value) || 0 })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm pb-2">
                    <Checkbox checked disabled />
                    브라우저 알림 (기본, 항상 켜짐)
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={emailChecked} onCheckedChange={(c) => { setEmailChecked(!!c); if (!c) setForm({ ...form, notify_email: "" }); }} />
                    이메일로 받기
                  </label>
                  {emailChecked && (
                    <Input type="email" placeholder="alert@example.com" value={form.notify_email || ""} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={smsChecked} onCheckedChange={(c) => { setSmsChecked(!!c); if (!c) setForm({ ...form, notify_phone: "" }); }} />
                    문자/카카오톡으로 받기
                  </label>
                  {smsChecked && (
                    <Input type="tel" placeholder="01012345678" value={form.notify_phone || ""} onChange={(e) => setForm({ ...form, notify_phone: e.target.value })} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  ※ 브라우저 알림은 즉시 작동합니다. 이메일/문자 발송은 외부 발송 인프라(이메일 도메인·SMS API) 설정 후 별도 연결이 필요합니다.
                </p>
              </Card>

              <div className="space-y-1.5">
                <Label>비고</Label>
                <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
