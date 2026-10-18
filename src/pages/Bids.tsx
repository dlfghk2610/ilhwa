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
import { Plus, Pencil, Trash2, Search, Loader2, Bell, X, ChevronDown, ChevronRight, CloudDownload, RefreshCw, ArrowRightLeft } from "lucide-react";

// 나라장터 공고 항목
type G2BItem = {
  bidNtceNo: string;
  bidNtceOrd: string;
  projectName: string;
  client: string;
  announcementDate: string;
  bidBeginDate: string;
  bidCloseDate: string;
  openingDate: string;
  estimatedPrice: number | null;
  noticeUrl: string;
  noticeType: string;
  contractMethod: string;
  bidMethod: string;
};

// "YYYY-MM-DD HH:mm:ss" (KST) → ISO
const kstToIso = (s: string): string | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`;
};
const kstToDate = (s: string): string => (s ? s.slice(0, 10) : "");

const EVAL_TYPES = ["평가", "전략", "사후", "소규모", "기후"];
const STATUS_OPTIONS = ["검토중", "PQ제출", "입찰참여", "낙찰", "탈락", "포기", "완료", "개찰완료"];

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<number>(0);

  // 나라장터/LH 불러오기
  const [g2bSource, setG2bSource] = useState<"g2b" | "lh">("g2b");
  const [g2bOpen, setG2bOpen] = useState(false);
  const [g2bKeyword, setG2bKeyword] = useState("");
  const [g2bBegin, setG2bBegin] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [g2bEnd, setG2bEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [g2bLoading, setG2bLoading] = useState(false);
  const [g2bItems, setG2bItems] = useState<G2BItem[]>([]);
  const [g2bTotal, setG2bTotal] = useState(0);
  const [g2bSelected, setG2bSelected] = useState<Set<string>>(new Set());
  const [g2bImporting, setG2bImporting] = useState(false);

  const g2bKey = (it: G2BItem) => `${g2bSource}-${it.bidNtceNo}-${it.bidNtceOrd}`;

  const openImport = (source: "g2b" | "lh") => {
    setG2bSource(source);
    setG2bItems([]);
    setG2bTotal(0);
    setG2bSelected(new Set());
    setG2bOpen(true);
  };

  const g2bSearch = async () => {
    setG2bLoading(true);
    setG2bSelected(new Set());
    const { data, error } = await supabase.functions.invoke(g2bSource === "lh" ? "lh-bids" : "g2b-bids", {
      body: { keyword: g2bKeyword, beginDate: g2bBegin, endDate: g2bEnd, numOfRows: 100 },
    });
    if (error || data?.error) {
      if (data?.code === "KEY_NOT_REGISTERED") {
        toast.error("LH 인증키가 아직 LH 입찰공고 서비스에 등록되지 않았습니다.", {
          description: "공공데이터포털에서 '한국토지주택공사 입찰공고정보' 활용신청 후 다시 조회해주세요. (승인 후 반영까지 최대 1~2시간 걸릴 수 있습니다)",
          duration: 8000,
        });
      } else {
        toast.error(data?.error || error?.message || "조회 실패");
      }
      setG2bItems([]);
    } else {
      setG2bItems(data.items || []);
      setG2bTotal(data.totalCount || 0);
      if ((data.items || []).length === 0) toast.info("조회된 공고가 없습니다.");
    }
    setG2bLoading(false);
  };

  const g2bToggle = (k: string) => {
    setG2bSelected((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const g2bImport = async () => {
    if (!user || g2bSelected.size === 0) return;
    setG2bImporting(true);
    const picked = g2bItems.filter((it) => g2bSelected.has(g2bKey(it)));
    const payload = picked.map((it) => ({
      project_name: it.projectName || "(제목 없음)",
      client: it.client || null,
      announcement_date: kstToDate(it.announcementDate) || null,
      bid_start_date: kstToDate(it.bidBeginDate) || null,
      bid_end_at: kstToIso(it.bidCloseDate),
      opening_at: kstToIso(it.openingDate),
      estimated_amount: it.estimatedPrice,
      status: "검토중",
      notes: [
        it.bidNtceNo ? `공고번호: ${it.bidNtceNo}-${it.bidNtceOrd}` : "",
        it.noticeType ? `공고종류: ${it.noticeType}` : "",
        it.contractMethod ? `계약방법: ${it.contractMethod}` : "",
        it.bidMethod ? `입찰방식: ${it.bidMethod}` : "",
        it.noticeUrl ? `공고링크: ${it.noticeUrl}` : "",
      ].filter(Boolean).join("\n") || null,
      share_rates: [],
      participants: [],
      evaluation_types: [],
      service_types: [],
      notify_hours_before: 24,
      created_by: user.id,
    }));
    const { error } = await supabase.from("bid_participations").insert(payload as any);
    if (error) toast.error(error.message);
    else {
      toast.success(`${payload.length}건의 공고를 가져왔습니다.`);
      setG2bOpen(false);
      load();
    }
    setG2bImporting(false);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

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

  // 나라장터에서 불러온 사업: 공고번호로 재조회해 입찰·개찰 일정 갱신
  const [syncing, setSyncing] = useState(false);
  const syncFromG2B = async () => {
    const targets = rows
      .map((r) => ({ r, m: (r.notes || "").match(/공고번호:\s*([A-Za-z0-9]+)(?:-(\d+))?/) }))
      .filter((x) => x.m);
    if (targets.length === 0) { toast.info("나라장터에서 불러온 사업이 없습니다."); return; }
    setSyncing(true);
    let updated = 0;
    for (const { r, m } of targets) {
      const { data } = await supabase.functions.invoke("g2b-bids", { body: { bidNtceNo: m![1], numOfRows: 50 } });
      const list: G2BItem[] = data?.items || [];
      if (!list.length) continue;
      // 가장 최신 차수(정정공고 포함) 사용
      const it = [...list].sort((a, b) => Number(b.bidNtceOrd || 0) - Number(a.bidNtceOrd || 0))[0];
      const patch: Record<string, any> = {};
      const set = (k: string, v: any) => { if (v != null && v !== "" && v !== (r as any)[k]) patch[k] = v; };
      set("announcement_date", kstToDate(it.announcementDate) || null);
      set("bid_start_date", kstToDate(it.bidBeginDate) || null);
      const be = kstToIso(it.bidCloseDate); if (be && new Date(be).getTime() !== new Date((r as any).bid_end_at || 0).getTime()) patch.bid_end_at = be;
      const op = kstToIso(it.openingDate); if (op && new Date(op).getTime() !== new Date((r as any).opening_at || 0).getTime()) patch.opening_at = op;
      set("estimated_amount", it.estimatedPrice);
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("bid_participations").update(patch as any).eq("id", r.id);
        if (!error) updated++;
      }
    }
    setSyncing(false);
    toast.success(updated ? `${updated}건의 일정이 갱신되었습니다.` : "변경된 일정이 없습니다.");
    load();
  };

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
      notify_email: null,
      notify_phone: null,
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

  const [tab, setTab] = useState<"ongoing" | "opened">("ongoing");
  const isOpened = (r: BidRow) => r.status === "개찰완료";
  const tabCounts = useMemo(() => ({
    ongoing: rows.filter((r) => !isOpened(r)).length,
    opened: rows.filter(isOpened).length,
  }), [rows]);
  const moveRow = async (r: BidRow) => {
    const next = isOpened(r) ? "검토중" : "개찰완료";
    const { error } = await supabase.from("bid_participations").update({ status: next } as any).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    toast.success(next === "개찰완료" ? "개찰완료 탭으로 옮겼습니다." : "진행중 탭으로 옮겼습니다.");
  };

  const filtered = useMemo(() => rows.filter((r) => (tab === "opened" ? isOpened(r) : !isOpened(r))).filter((r) =>
    !search ||
    [r.project_name, r.client, r.status].some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()))
  ), [rows, search, tab]);


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
              <Button size="sm" variant="outline" onClick={() => openImport("g2b")}>
                <CloudDownload className="mr-1 h-4 w-4" />나라장터 불러오기
              </Button>
              <Button size="sm" variant="outline" onClick={() => openImport("lh")}>
                <CloudDownload className="mr-1 h-4 w-4" />LH 불러오기
              </Button>
              <Button size="sm" variant="outline" onClick={syncFromG2B} disabled={syncing}>
                <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />일정 새로고침
              </Button>
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />등록</Button>
            </div>
          </div>
        </Card>

        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {([["ongoing", "진행중"], ["opened", "개찰완료"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label} <span className="ml-1 text-xs text-muted-foreground">{tabCounts[k]}</span>
            </button>
          ))}
        </div>

        <Card className="shadow-card overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[220px] min-w-[180px]">사업명</TableHead>
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
                  <TableHead className="text-right w-[150px]">관리</TableHead>
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
                      <TableCell className="font-medium w-[220px] min-w-[180px] max-w-[220px]"><div className="line-clamp-3 break-words leading-snug" title={r.project_name}>{r.project_name}</div></TableCell>
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
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title={isOpened(r) ? "진행중으로 이동" : "개찰완료로 이동"} onClick={() => moveRow(r)}><ArrowRightLeft className="h-4 w-4" /></Button>
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

        {/* Mobile card list */}
        <Card className="shadow-card overflow-hidden md:hidden">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">데이터가 없습니다.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const end = r.bid_end_at ? new Date(r.bid_end_at).getTime() : 0;
                const urgent = end && end - Date.now() < r.notify_hours_before * 3600000 && end > Date.now();
                const expired = end && end <= Date.now();
                const isOpen = expanded.has(r.id);
                return (
                  <li key={r.id} className={urgent ? "bg-destructive/5" : ""}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      className="w-full flex items-start gap-2 px-3 py-3 text-left"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm break-words">{r.project_name}</div>
                        <div className={"text-xs mt-1 " + (expired ? "text-muted-foreground" : urgent ? "text-destructive font-semibold" : "text-muted-foreground")}>
                          입찰마감: {fmtDT(r.bid_end_at)} {r.bid_end_at && <span className="ml-1">({dDisplay(r.bid_end_at)})</span>}
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pl-9 space-y-1 text-xs">
                        <div><span className="text-muted-foreground">발주처: </span>{r.client || "-"}</div>
                        <div><span className="text-muted-foreground">공고일: </span>{r.announcement_date || "-"}</div>
                        <div><span className="text-muted-foreground">PQ마감: </span>{r.pq_due_date || "-"}</div>
                        <div><span className="text-muted-foreground">입찰시작: </span>{r.bid_start_date || "-"}</div>
                        <div><span className="text-muted-foreground">개찰일시: </span>{fmtDT(r.opening_at)}</div>
                        <div><span className="text-muted-foreground">추정금액: </span>{r.estimated_amount ? Number(r.estimated_amount).toLocaleString() : "-"}</div>
                        <div><span className="text-muted-foreground">상태: </span>{r.status || "-"}</div>
                        <div className="flex items-center gap-1"><Bell className="h-3 w-3" />{r.notify_hours_before}h</div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => moveRow(r)}><ArrowRightLeft className="h-3 w-3 mr-1" />{isOpened(r) ? "진행중으로" : "개찰완료로"}</Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil className="h-3 w-3 mr-1" />수정</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 mr-1 text-destructive" />삭제</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-3 py-2 text-xs text-muted-foreground border-t">총 {filtered.length}건</div>
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

              {/* 사업종류 (자유 입력, 복수) */}
              <div className="space-y-1.5">
                <Label>사업종류</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.service_types.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded bg-secondary text-secondary-foreground px-2 py-0.5 text-xs">
                      {t}
                      <button type="button" className="hover:text-destructive" onClick={() => setForm({ ...form, service_types: form.service_types.filter((x) => x !== t) })}>×</button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder="사업종류 입력 후 Enter (쉼표로 여러 개 가능)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const val = (e.currentTarget.value || "").trim().replace(/,$/, "");
                      if (val) {
                        const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
                        const next = Array.from(new Set([...form.service_types, ...parts]));
                        setForm({ ...form, service_types: next });
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const val = (e.currentTarget.value || "").trim();
                    if (val) {
                      const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
                      const next = Array.from(new Set([...form.service_types, ...parts]));
                      setForm({ ...form, service_types: next });
                      e.currentTarget.value = "";
                    }
                  }}
                />
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
                <div className="flex items-center gap-2 font-medium text-sm"><Bell className="h-4 w-4" />마감 알림 (브라우저)</div>
                <div className="space-y-1.5">
                  <Label>마감 몇시간 전 알림</Label>
                  <Input type="number" min={1} value={form.notify_hours_before} onChange={(e) => setForm({ ...form, notify_hours_before: Number(e.target.value) || 0 })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  ※ 브라우저가 열려 있을 때만 알림이 표시됩니다. (이메일/문자 발송 기능은 제거됨)
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

        {/* 나라장터/LH 불러오기 Dialog */}
        <Dialog open={g2bOpen} onOpenChange={setG2bOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>{g2bSource === "lh" ? "LH(한국토지주택공사) 입찰공고 불러오기" : "나라장터 입찰공고 불러오기"}</DialogTitle></DialogHeader>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label className="text-xs">공고명 검색어</Label>
                <Input
                  placeholder="예: 엔지니어링, 감독, 설계..."
                  value={g2bKeyword}
                  onChange={(e) => setG2bKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && g2bSearch()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">공고일 시작</Label>
                <Input type="date" value={g2bBegin} onChange={(e) => setG2bBegin(e.target.value)} className="w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">공고일 종료</Label>
                <Input type="date" value={g2bEnd} onChange={(e) => setG2bEnd(e.target.value)} className="w-[150px]" />
              </div>
              <Button onClick={g2bSearch} disabled={g2bLoading}>
                {g2bLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
                조회
              </Button>
            </div>

            <div className="border rounded-md max-h-[50vh] overflow-y-auto">
              {g2bLoading ? (
                <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></div>
              ) : g2bItems.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  검색어와 기간을 입력하고 [조회]를 누르세요.
                </div>
              ) : (
                <ul className="divide-y">
                  {g2bItems.map((it) => {
                    const k = g2bKey(it);
                    return (
                      <li key={k} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/40">
                        <Checkbox
                          className="mt-1"
                          checked={g2bSelected.has(k)}
                          onCheckedChange={() => g2bToggle(k)}
                        />
                        <button type="button" className="flex-1 min-w-0 text-left" onClick={() => g2bToggle(k)}>
                          <div className="font-medium text-sm break-words">{it.projectName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{it.client}</span>
                            {it.announcementDate && <span>공고 {it.announcementDate.slice(0, 10)}</span>}
                            {it.bidCloseDate && <span className="text-foreground">마감 {it.bidCloseDate.slice(0, 16)}</span>}
                            {it.estimatedPrice != null && <span>추정가 {Number(it.estimatedPrice).toLocaleString()}원</span>}
                            {it.bidNtceNo && <span>공고번호 {it.bidNtceNo}</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
              <span className="text-xs text-muted-foreground">
                조회 {g2bTotal}건 중 {g2bItems.length}건 표시 · 선택 {g2bSelected.size}건
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setG2bOpen(false)}>닫기</Button>
                <Button onClick={g2bImport} disabled={g2bSelected.size === 0 || g2bImporting}>
                  {g2bImporting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  선택 항목 가져오기
                </Button>
              </div>
            </DialogFooter>
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
