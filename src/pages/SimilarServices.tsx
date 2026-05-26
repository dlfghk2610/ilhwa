import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserStorage } from "@/hooks/useUserStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload, Search, Loader2, X, FileText } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Phase = { label: string; amount: number | null; contract_amount?: number | null; share_rate?: number | null; contract_date?: string | null; start_date?: string | null; end_date?: string | null; pdf_path?: string | null };

type Row = {
  id: string;
  project_name: string;
  client: string | null;
  service_type: string | null;
  evaluation_type: string | null;
  service_overview: string | null;
  contract_amount: number | null;
  contract_date: string | null;
  announcement_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  participation_rate: number | null;
  company_share_rate: string | null;
  share_amount: number | null;
  is_dual_participation: boolean;
  is_private: boolean;
  is_under_90days: boolean;
  is_lh_completion: boolean;
  is_progress: boolean;
  notes: string | null;
  phases: Phase[] | null;
  cert_pdf_path: string | null;
};

const emptyForm = {
  project_name: "",
  client: "",
  service_type: "",
  evaluation_type: "",
  service_overview: "",
  contract_amount: "",
  contract_date: "",
  announcement_date: "",
  start_date: "",
  completion_date: "",
  participation_rate: "",
  company_share_rate: "",
  share_amount: "",
  is_dual_participation: false,
  is_private: false,
  is_under_90days: false,
  is_lh_completion: false,
  is_progress: false,
  notes: "",
  phases: [] as { label: string; amount: string; contract_amount: string; share_rate: string; contract_date: string; start_date: string; end_date: string; pdf_path: string; pdf_file: File | null; amount_touched: boolean }[],
  cert_pdf_path: "",
  cert_pdf_file: null as File | null,
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
  const [contractAmountTouched, setContractAmountTouched] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 적용 계수 필터
  const [filterEvalTypes, setFilterEvalTypes] = useState<string[]>([]);
  const [filterServiceTypes, setFilterServiceTypes] = useState<string[]>([]);

  // 민간사업 / 90일미만 / LH기성실적 / 기성실적 필터 (계정별 영속)
  const uid = user?.id;
  const [excludePrivate, setExcludePrivate] = useUserStorage<boolean>("similar_services.exclude_private.v1", false, uid);
  const [includeUnder90, setIncludeUnder90] = useUserStorage<boolean>("similar_services.include_under90.v1", false, uid);
  const [includeLh, setIncludeLh] = useUserStorage<boolean>("similar_services.include_lh.v1", false, uid);
  const [includeProgress, setIncludeProgress] = useUserStorage<boolean>("similar_services.include_progress.v1", false, uid);
  const [includeDual, setIncludeDual] = useUserStorage<boolean>("similar_services.include_dual.v1", true, uid);

  // 공고일 (계정별): 이 날짜로부터 준공일까지 5년 초과 시 집계 제외
  const [filterAnnouncementDate, setFilterAnnouncementDate] = useUserStorage<string>("similar_services.announcement_date.v1", "", uid);
  const [exclude5y, setExclude5y] = useUserStorage<boolean>("similar_services.exclude_5y.v1", false, uid);

  // 사용자 정의 사업종류 그룹 (계정별)
  const DEFAULT_GROUPS: { group: string; items: string[] }[] = [
    { group: "단지계열", items: ["관광", "도시개발", "택지개발", "산업단지", "주택단지"] },
    { group: "하천계열", items: ["국가하천", "지방하천", "소하천", "하천기본계획", "재해영향평가"] },
    { group: "도로계열", items: ["고속도로", "국도", "지방도", "도시계획도로"] },
    { group: "상하수도계열", items: ["상수도", "하수도", "우수관거"] },
    { group: "환경계열", items: ["환경영향평가", "수질", "대기", "폐기물"] },
  ];
  const [customGroups, setCustomGroups] = useUserStorage<{ group: string; items: string[] }[]>(
    "similar_services.service_groups.v1",
    DEFAULT_GROUPS,
    uid,
  );
  const [hiddenExtras, setHiddenExtras] = useUserStorage<string[]>("similar_services.hidden_extras.v1", [], uid);
  const [newGroupName, setNewGroupName] = useState("");
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});
  const addGroup = () => {
    const n = newGroupName.trim();
    if (!n) return;
    if (customGroups.some((g) => g.group === n)) { toast.error("이미 존재하는 계열"); return; }
    setCustomGroups([...customGroups, { group: n, items: [] }]);
    setNewGroupName("");
  };
  const removeGroup = (g: string) => {
    const grp = customGroups.find((x) => x.group === g);
    if (grp && g === "기타") {
      setHiddenExtras((prev) => Array.from(new Set([...prev, ...grp.items])));
    }
    setCustomGroups(customGroups.filter((x) => x.group !== g));
  };
  const addItem = (g: string) => {
    const v = (newItemInputs[g] ?? "").trim();
    if (!v) return;
    setCustomGroups(customGroups.map((x) => x.group === g
      ? (x.items.includes(v) ? x : { ...x, items: [...x.items, v] })
      : x));
    if (g === "기타") setHiddenExtras((prev) => prev.filter((s) => s !== v));
    setNewItemInputs({ ...newItemInputs, [g]: "" });
  };
  const removeItem = (g: string, item: string) => {
    setCustomGroups(customGroups.map((x) => x.group === g ? { ...x, items: x.items.filter((i) => i !== item) } : x));
    setFilterServiceTypes((prev) => prev.filter((s) => s !== item));
    if (g === "기타") setHiddenExtras((prev) => Array.from(new Set([...prev, item])));
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("similar_services").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as any as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 차수 합계
  const phasesTotal = useMemo(() => {
    return form.phases.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [form.phases]);

  const phasesContractTotal = useMemo(() => {
    return form.phases.reduce((s, p) => s + (Number(p.contract_amount) || 0), 0);
  }, [form.phases]);

  // 사후(차수) 입력 시 계약금액 = 차수 계약금액 합계 (수기 수정 가능, 차수 변경 시 재반영)
  useEffect(() => {
    if (form.phases.length === 0) return;
    if (phasesContractTotal === 0) return;
    setForm((prev) => {
      const next = String(Math.round(phasesContractTotal));
      if (prev.contract_amount === next) return prev;
      return { ...prev, contract_amount: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesContractTotal, form.phases.length]);

  // 자동 계산: 차수 입력 시엔 차수 합계로 / 아니면 계약금액 × 참여지분율
  useEffect(() => {
    if (form.phases.length > 0) {
      setForm((prev) => ({ ...prev, share_amount: String(Math.round(phasesTotal)) }));
      return;
    }
    if (shareAmountTouched) return;
    if (form.is_dual_participation) return;
    const amt = Number(form.contract_amount);
    const p = Number(form.participation_rate);
    if (!amt || isNaN(amt)) return;
    if (p && !isNaN(p)) {
      setForm((prev) => ({ ...prev, share_amount: String(Math.round(amt * (p / 100))) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contract_amount, form.participation_rate, form.is_dual_participation, phasesTotal, form.phases.length]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShareAmountTouched(false);
    setContractAmountTouched(false);
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    const phases = Array.isArray(row.phases) ? row.phases : [];
    setForm({
      project_name: row.project_name ?? "",
      client: row.client ?? "",
      service_type: row.service_type ?? "",
      evaluation_type: row.evaluation_type ?? "",
      service_overview: row.service_overview ?? "",
      contract_amount: row.contract_amount?.toString() ?? "",
      contract_date: row.contract_date ?? "",
      announcement_date: (row as any).announcement_date ?? "",
      start_date: row.start_date ?? "",
      completion_date: row.completion_date ?? "",
      participation_rate: row.participation_rate?.toString() ?? "",
      company_share_rate: row.company_share_rate?.toString() ?? "",
      share_amount: row.share_amount?.toString() ?? "",
      is_dual_participation: row.is_dual_participation ?? false,
      is_private: (row as any).is_private ?? false,
      is_under_90days: (row as any).is_under_90days ?? false,
      is_lh_completion: (row as any).is_lh_completion ?? false,
      is_progress: (row as any).is_progress ?? false,
      notes: row.notes ?? "",
      phases: phases.map((p) => ({ label: p.label ?? "", amount: p.amount != null ? String(p.amount) : "", contract_amount: (p as any).contract_amount != null ? String((p as any).contract_amount) : "", share_rate: (p as any).share_rate != null ? String((p as any).share_rate) : "", contract_date: (p as any).contract_date ?? "", start_date: p.start_date ?? "", end_date: p.end_date ?? "", pdf_path: (p as any).pdf_path ?? "", pdf_file: null, amount_touched: true })),
      cert_pdf_path: (row as any).cert_pdf_path ?? "",
      cert_pdf_file: null,
    });
    setShareAmountTouched(true);
    setContractAmountTouched(true);
    setOpen(true);
  };

  const num = (v: string) => (v === "" || v === null ? null : Number(v));
  const txt = (v: string) => (v === "" ? null : v);
  // 년도 4자리로 제한 (YYYY-MM-DD)
  const clampDate = (v: string) => {
    if (!v) return "";
    const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
    if (!m) return v;
    const y = m[1].length > 4 ? m[1].slice(0, 4) : m[1].padStart(4, "0");
    return `${y}-${m[2]}-${m[3]}`;
  };

  const uploadPdf = async (file: File, folder: string, name: string) => {
    const path = `${user!.id}/${folder}/${Date.now()}-${name}`;
    const { error } = await supabase.storage.from("performance-certs").upload(path, file, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    return path;
  };

  const downloadPdf = async (path: string, filename?: string) => {
    try {
      const { data, error } = await supabase.storage.from("performance-certs").download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || path.split("/").pop() || "download.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "다운로드 실패");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.project_name) { toast.error("사업명은 필수입니다"); return; }

    setSubmitting(true);
    try {
      const rowFolder = editing?.id ?? crypto.randomUUID();

      // Upload project-level cert PDF if a new one was selected
      let certPath: string | null = form.cert_pdf_path || null;
      if (form.cert_pdf_file) {
        certPath = await uploadPdf(form.cert_pdf_file, rowFolder, "cert.pdf");
      }

      // Upload per-phase PDFs
      const phasesUploaded = await Promise.all(form.phases.map(async (p, i) => {
        let pdf_path: string | null = p.pdf_path || null;
        if (p.pdf_file) {
          pdf_path = await uploadPdf(p.pdf_file, rowFolder, `phase-${i + 1}.pdf`);
        }
        return { p, pdf_path };
      }));

      const phasesPayload = phasesUploaded
        .filter(({ p }) => p.label.trim() !== "" || p.amount !== "" || p.contract_amount !== "" || p.share_rate !== "" || p.contract_date !== "" || p.start_date !== "" || p.end_date !== "" || p.pdf_path || p.pdf_file)
        .map(({ p, pdf_path }) => ({
          label: p.label.trim(),
          amount: p.amount === "" ? null : Number(p.amount),
          contract_amount: p.contract_amount === "" ? null : Number(p.contract_amount),
          share_rate: p.share_rate === "" ? null : Number(p.share_rate),
          contract_date: p.contract_date || null,
          start_date: p.start_date || null,
          end_date: p.end_date || null,
          pdf_path,
        }));

      let derivedStart = txt(form.start_date);
      let derivedCompletion = txt(form.completion_date);
      if (phasesPayload.length > 0) {
        const firstStart = phasesPayload.find((p) => p.start_date)?.start_date ?? null;
        const lastEnd = [...phasesPayload].reverse().find((p) => p.end_date)?.end_date ?? null;
        if (firstStart) derivedStart = firstStart;
        if (lastEnd) derivedCompletion = lastEnd;
      }

      const payload: any = {
        project_name: form.project_name,
        client: txt(form.client),
        service_type: txt(form.service_type),
        evaluation_type: txt(form.evaluation_type),
        service_overview: txt(form.service_overview),
        contract_amount: num(form.contract_amount),
        contract_date: txt(form.contract_date),
        announcement_date: txt(form.announcement_date),
        start_date: derivedStart,
        completion_date: derivedCompletion,
        participation_rate: form.is_dual_participation ? null : num(form.participation_rate),
        company_share_rate: form.is_dual_participation ? null : txt(form.company_share_rate),
        share_amount: num(form.share_amount),
        is_dual_participation: form.is_dual_participation,
        is_private: form.is_private,
        is_under_90days: form.is_under_90days,
        is_lh_completion: form.is_lh_completion,
        is_progress: form.is_progress,
        notes: txt(form.notes),
        phases: phasesPayload,
        cert_pdf_path: certPath,
      };

      const scrollY = window.scrollY;
      const restoreScroll = () => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
          requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }));
        });
      };
      if (editing) {
        const { error } = await supabase.from("similar_services").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료"); setOpen(false); await load(); restoreScroll();
      } else {
        const { error } = await supabase.from("similar_services").insert({ ...payload, id: rowFolder, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료"); setOpen(false); await load(); restoreScroll();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    let ids: string[] = [deleteId];
    if (deleteId.startsWith("group:")) {
      const g = groupedFiltered.find((r) => r.id === deleteId);
      if (g) ids = g._childIds;
    }
    const { error } = await supabase.from("similar_services").delete().in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const filtered = rows.filter((r) => {
    if ((r as any).is_private && excludePrivate) return false;
    if ((r as any).is_under_90days && !includeUnder90) return false;
    if ((r as any).is_lh_completion && !includeLh) return false;
    if ((r as any).is_progress && !includeProgress) return false;
    if ((r as any).is_dual_participation && !includeDual) return false;
    if (!search) return true;
    return [r.project_name, r.client, r.service_type, r.evaluation_type]
      .some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()));
  }).sort((a, b) => {
    const av = a.start_date ?? "";
    const bv = b.start_date ?? "";
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return av.localeCompare(bv);
  });

  // 사업명에서 "N차" 접미사 분리 (예: "사업명 1차", "사업명(2차)", "사업명-3차", "사업명 2-1차")
  const parsePhase = (name: string): { base: string; label: string | null } => {
    const s = (name || "").trim();
    const m = s.match(/^(.*?)[\s\-_,·]*[(\[]?\s*(\d+(?:[-~]\d+)?\s*차)\s*[)\]]?\s*$/);
    if (m && m[1].trim()) return { base: m[1].trim(), label: m[2].replace(/\s+/g, "") };
    return { base: s, label: null };
  };

  // 같은 base 사업명 + 발주처로 차수 묶기
  type GroupedRow = Row & { _childIds: string[]; _children: Row[] };
  const groupedFiltered = useMemo<GroupedRow[]>(() => {
    const groups = new Map<string, { base: string; client: string; items: { row: Row; label: string | null }[] }>();
    for (const r of filtered) {
      const { base, label } = parsePhase(r.project_name);
      const key = `${base}__${r.client ?? ""}`;
      const g = groups.get(key) ?? { base, client: r.client ?? "", items: [] };
      g.items.push({ row: r, label });
      groups.set(key, g);
    }
    const out: GroupedRow[] = [];
    groups.forEach((g) => {
      const items = g.items;
      const anyLabel = items.some((it) => it.label);
      if (items.length === 1 && !anyLabel) {
        const r = items[0].row;
        out.push({ ...r, _childIds: [r.id], _children: [r] });
        return;
      }
      const sorted = [...items].sort((a, b) => {
        const an = a.label ? parseInt(a.label, 10) : 9999;
        const bn = b.label ? parseInt(b.label, 10) : 9999;
        if (an !== bn) return an - bn;
        return (a.row.start_date ?? "").localeCompare(b.row.start_date ?? "");
      });
      const head = sorted[0].row;
      const childIds = sorted.map((s) => s.row.id);
      const children = sorted.map((s) => s.row);
      const phases: Phase[] = sorted.flatMap((s, i) => {
        const cr = s.row;
        const inner = Array.isArray(cr.phases) ? cr.phases : [];
        if (inner.length > 0) {
          return inner.map((ip) => ({ ...ip, label: ip.label || s.label || `${i + 1}차` }));
        }
        return [{
          label: s.label || `${i + 1}차`,
          amount: cr.share_amount,
          contract_amount: cr.contract_amount,
          share_rate: null,
          contract_date: cr.contract_date,
          start_date: cr.start_date,
          end_date: cr.completion_date,
          pdf_path: cr.cert_pdf_path,
        }];
      });
      const sumContract = children.reduce((s, c) => s + (Number(c.contract_amount) || 0), 0);
      const sumShare = children.reduce((s, c) => s + (Number(c.share_amount) || 0), 0);
      const dates = (vs: (string | null)[]) => vs.filter((v): v is string => !!v).sort();
      const starts = dates(children.map((c) => c.start_date));
      const ends = dates(children.map((c) => c.completion_date));
      out.push({
        ...head,
        id: `group:${g.base}::${g.client}`,
        project_name: g.base,
        contract_amount: sumContract || null,
        share_amount: sumShare || null,
        start_date: starts[0] ?? null,
        completion_date: ends[ends.length - 1] ?? null,
        phases,
        cert_pdf_path: null,
        is_private: children.some((c) => c.is_private),
        is_under_90days: children.some((c) => c.is_under_90days),
        is_lh_completion: children.some((c) => c.is_lh_completion),
        is_progress: children.some((c) => c.is_progress),
        _childIds: childIds,
        _children: children,
      });
    });
    out.sort((a, b) => {
      const av = a.start_date ?? "";
      const bv = b.start_date ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    });
    return out;
  }, [filtered]);

  // 선택 (엑셀/PDF 내보내기 대상)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 모바일에서 행 펼치기
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  // 연번 기입 옵션
  const [addSeqNumbers, setAddSeqNumbers] = useState(false);
  const isOver5y = (r: Row) => {
    const ann = filterAnnouncementDate;
    // 준공일 우선, 없으면 계약일/착수일/마지막 phase 종료일로 폴백
    const phases = Array.isArray((r as any).phases) ? (r as any).phases : [];
    const lastPhaseEnd = phases.length ? (phases[phases.length - 1]?.end_date || phases[phases.length - 1]?.["준공일"] || null) : null;
    const comp = r.completion_date || (r as any).contract_date || (r as any).start_date || lastPhaseEnd;
    if (!ann || !comp) return false;
    const a = new Date(ann).getTime();
    const c = new Date(comp).getTime();
    if (isNaN(a) || isNaN(c)) return false;
    return a - c > 5 * 365.25 * 24 * 60 * 60 * 1000;
  };
  const toggleSelect = (id: string) => {
    const row = groupedFiltered.find((r) => r.id === id);
    if (row && isOver5y(row)) {
      toast.error("공고일 기준 5년 경과 사업은 선택할 수 없습니다");
      return;
    }
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const selectableRows = groupedFiltered.filter((r) => !isOver5y(r));
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(selectableRows.map((r) => r.id));
    });
  };

  const fmtNum = (v: number | null) => (v == null ? "-" : Number(v).toLocaleString());
  const fmtDate = (v: string | null) => (v ? String(v).slice(0, 10) : "-");

  // 평가종류 (고정 4가지)
  const EVAL_TYPES = ["소규모", "전략", "사후", "평가", "기후"] as const;
  const evalTypeOptions = EVAL_TYPES as readonly string[];
  // 사업종류 카테고리 그룹 (사용자 정의 + 데이터에서 발견된 기타)
  const knownServiceTypes = useMemo(() => new Set(customGroups.flatMap((g) => g.items)), [customGroups]);
  // 데이터에서 발견된 미분류 항목을 자동으로 "기타" 그룹에 추가 (편집 가능)
  useEffect(() => {
    const hidden = new Set(hiddenExtras);
    const fromData = Array.from(new Set(rows.flatMap((r) => String(r.service_type ?? "").split(",").map((s) => s.trim())).filter(Boolean)));
    const extras = fromData.filter((t) => !knownServiceTypes.has(t) && !hidden.has(t));
    if (extras.length === 0) return;
    setCustomGroups((prev) => {
      const idx = prev.findIndex((g) => g.group === "기타");
      if (idx === -1) return [...prev, { group: "기타", items: extras.sort() }];
      const merged = Array.from(new Set([...prev[idx].items, ...extras])).sort();
      const next = [...prev];
      next[idx] = { ...prev[idx], items: merged };
      return next;
    });
  }, [rows, knownServiceTypes, hiddenExtras]);
  const serviceTypeOptions = useMemo(() => {
    return customGroups.filter((g) => g.items.length > 0);
  }, [customGroups]);

  // 차수 표기 접미사
  const phaseSuffix = (r: Row) => {
    const ps = Array.isArray(r.phases) ? r.phases.filter((p) => p.label && p.label.trim()) : [];
    if (ps.length === 0) return "";
    if (ps.length === 1) return ` (${ps[0].label})`;
    return ` (${ps[0].label}~${ps[ps.length - 1].label})`;
  };

  // 적용계수 계산 ("평가"는 항상 1.0, 미선택 시 기본 평가=1.0/그외=0.6)
  const evalCoef = (r: Row) => {
    const type = r.evaluation_type ?? "";
    if (type === "평가") return 1.0;
    if (filterEvalTypes.length === 0) return 0.6;
    return filterEvalTypes.includes(type) ? 1.0 : 0.6;
  };
  const splitTypes = (s: string | null | undefined) =>
    String(s ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const serviceCoef = (r: Row) => {
    if (filterServiceTypes.length === 0) return 0.6;
    const types = splitTypes(r.service_type);
    return types.some((t) => filterServiceTypes.includes(t)) ? 1.0 : 0.6;
  };

  // 집계 제외 (체크박스 켜진 경우만)
  const isExpired5y = (r: Row) => isOver5y(r);

  // 적용건수 = 평가계수 × 사업계수 × 참여지분율(소수)
  const appliedCount = (r: Row) => {
    if (isExpired5y(r)) return 0;
    const p = r.is_dual_participation ? 100 : Number(r.participation_rate ?? 0);
    return evalCoef(r) * serviceCoef(r) * (p / 100);
  };
  const appliedAmount = (r: Row) => {
    if (isExpired5y(r)) return 0;
    return evalCoef(r) * serviceCoef(r) * Number(r.share_amount ?? 0);
  };

  const totalAppliedCount = groupedFiltered.reduce((s, r) => s + appliedCount(r), 0);
  const totalAppliedAmount = groupedFiltered.reduce((s, r) => s + appliedAmount(r), 0);

  const handleExportExcel = async () => {
    const targets = (selectedIds.size > 0
      ? groupedFiltered.filter((r) => selectedIds.has(r.id))
      : groupedFiltered);
    if (targets.length === 0) { toast.error("보낼 데이터가 없습니다"); return; }

    const data: Record<string, any>[] = [];
    let seq = 0;
    targets.forEach((r) => {
      seq++;
      const seqLabel = addSeqNumbers ? String(seq) : "";
      const ps = Array.isArray(r.phases)
        ? r.phases.filter((p) => p && (p.label || p.amount != null || p.start_date || p.end_date))
        : [];
      const makeRow = (nameSuffix: string, seqVal: string, overrides: Record<string, any> = {}) => {
        const base: Record<string, any> = addSeqNumbers ? { "연번": seqVal } : {};
        return {
          ...base,
          "사업명": r.project_name + nameSuffix,
          "발주처": r.client,
          "계약일": r.contract_date,
          "착수일": r.start_date,
          "준공일": r.completion_date,
          "계약금액": r.contract_amount,
          "참여지분율": r.is_dual_participation || r.participation_rate == null ? null : r.participation_rate / 100,
          "지분금액": r.share_amount,
          "평가종류": r.evaluation_type,
          "사업종류": r.service_type,
          "각사지분율": r.is_dual_participation || r.company_share_rate == null || r.company_share_rate === "" ? null : String(r.company_share_rate).replace(/%$/, ""),
          "2종": r.is_dual_participation ? "✓" : "",
          "적용건수": Number(appliedCount(r).toFixed(2)),
          "적용금액": Math.round(appliedAmount(r)),
          "용역개요": r.service_overview,
          "비고": r.notes,
          ...overrides,
        };
      };
      if (ps.length === 0) {
        data.push(makeRow("", seqLabel));
      } else {
        ps.forEach((p, idx) => {
          const label = (p.label && p.label.trim()) || "";
          data.push(makeRow(label ? `(${label})` : "", idx === 0 ? seqLabel : "", {
            "계약일": (p as any).contract_date ?? r.contract_date,
            "착수일": p.start_date ?? r.start_date,
            "준공일": p.end_date ?? r.completion_date,
            "지분금액": p.amount ?? null,
          }));
        });
      }
    });
    exportToExcel(data, "PQ유사용역");
    toast.success("엑셀 다운로드 완료");
  };

  const handleExportPdf = async () => {
    const targets = (selectedIds.size > 0
      ? groupedFiltered.filter((r) => selectedIds.has(r.id))
      : groupedFiltered);
    if (targets.length === 0) { toast.error("보낼 데이터가 없습니다"); return; }

    try {
      const merged = await PDFDocument.create();
      const seqFont = addSeqNumbers ? await merged.embedFont(StandardFonts.HelveticaBold) : null;
      let added = 0;
      let pdfSeq = 0;
      for (const r of targets) {
        pdfSeq++;
        const phasePdfs = (Array.isArray(r.phases) ? r.phases : [])
          .map((p) => (p as any).pdf_path as string | undefined)
          .filter((x): x is string => !!x);

        const paths: string[] = phasePdfs.length > 0
          ? phasePdfs
          : (r.cert_pdf_path ? [r.cert_pdf_path] : []);

        let stampedThisTarget = false;
        for (const path of paths) {
          const { data: blob, error } = await supabase.storage.from("performance-certs").download(path);
          if (error || !blob) continue;
          const bytes = await blob.arrayBuffer();
          try {
            const src = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((pg, idx) => {
              merged.addPage(pg);
              if (addSeqNumbers && seqFont && !stampedThisTarget && idx === 0) {
                const { height } = pg.getSize();
                pg.drawText(String(pdfSeq), {
                  x: 30,
                  y: height - 50,
                  size: 40,
                  font: seqFont,
                  color: rgb(0, 0, 0),
                });
                stampedThisTarget = true;
              }
            });
            added++;
          } catch {
            // 손상된 PDF는 건너뜀
          }
        }
      }
      if (added > 0) {
        const out = await merged.save();
        const blob = new Blob([out as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "실적증명서_병합.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(`실적증명서 PDF 병합 완료 (${added}개)`);
      } else {
        toast.message("등록된 실적증명서 PDF가 없어 병합 파일은 만들지 않았습니다");
      }
    } catch (err: any) {
      toast.error("PDF 병합 오류: " + (err?.message ?? ""));
    }
  };



  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) { if (e.target) e.target.value = ""; return; }
    try {
      const data = await importFromExcel<Record<string, any>>(file);
      const toDate = (v: any) => {
        if (v === "" || v == null) return null;
        if (typeof v === "number") {
          if (!isFinite(v)) return null;
          return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
        }
        const s = String(v).trim();
        if (!s) return null;
        const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return null;
      };
      const toNum = (v: any) => {
        if (v === "" || v == null) return null;
        const n = Number(String(v).replace(/[, ]/g, ""));
        return isFinite(n) ? n : null;
      };
      const toStr = (v: any) => {
        if (v == null) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };
      // 지분율 파서: 숫자/문자/백분율(0.05, "5%", "5", "5.5 %") 모두 인식 → 퍼센트 숫자(예: 5)
      const toPct = (v: any): number | null => {
        if (v === "" || v == null) return null;
        if (typeof v === "number") {
          if (!isFinite(v)) return null;
          // 엑셀 % 서식이면 0~1 사이 소수로 들어옴
          return v > 0 && v < 1 ? +(v * 100).toFixed(6) : v;
        }
        const raw = String(v).trim();
        if (!raw) return null;
        const hasPct = raw.includes("%");
        const n = Number(raw.replace(/[%,\s]/g, ""));
        if (!isFinite(n)) return null;
        if (hasPct) return n;
        return n > 0 && n < 1 ? +(n * 100).toFixed(6) : n;
      };
      const toPctStr = (v: any): string | null => {
        const n = toPct(v);
        return n == null ? null : String(n);
      };
      const parseRow = (r: Record<string, any>) => {
        const rawName = String(r["사업명"] ?? "").trim();
        // 사업명 끝의 "(○차)" 또는 "(○○)" 접미사를 차수 라벨로 추출
        const m = rawName.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
        const baseName = m ? m[1].trim() : rawName;
        const phaseLabel = m ? m[2].trim() : "";
        return { rawName, baseName, phaseLabel, r };
      };
      const parsed = data.map(parseRow).filter((p) => p.rawName);
      // 같은 사업명(접미사 제외) + 발주처로 그룹핑
      const groups = new Map<string, typeof parsed>();
      for (const p of parsed) {
        const key = `${p.baseName}__${String(p.r["발주처"] ?? "")}`;
        const arr = groups.get(key) ?? [];
        arr.push(p);
        groups.set(key, arr);
      }
      const records = Array.from(groups.values()).map((items) => {
        const head = items[0];
        const r = head.r;
        const isPostEval = String(r["평가종류"] ?? "").includes("사후");
        const hasPhases = items.length > 1 || items.some((it) => it.phaseLabel) || isPostEval;
        const phases = hasPhases ? items.map((it, idx) => ({
          label: it.phaseLabel || `${idx + 1}차`,
          amount: toNum(it.r["지분금액"]),
          contract_amount: toNum(it.r["계약금액"]),
          share_rate: null,
          contract_date: toDate(it.r["계약일"]),
          start_date: toDate(it.r["착수일"]),
          end_date: toDate(it.r["준공일"]),
          pdf_path: null,
        })) : null;
        // 대표 값: 차수가 있을 경우 합계/최초~최종으로 집계
        const sum = (k: string) => items.reduce((s, it) => s + (toNum(it.r[k]) ?? 0), 0);
        const firstDate = (k: string) => items.map((it) => toDate(it.r[k])).filter(Boolean).sort()[0] ?? null;
        const lastDate = (k: string) => items.map((it) => toDate(it.r[k])).filter(Boolean).sort().slice(-1)[0] ?? null;
        return {
          created_by: user.id,
          project_name: head.baseName,
          client: toStr(r["발주처"]),
          service_type: toStr(r["사업종류"]),
          evaluation_type: toStr(r["평가종류"]),
          service_overview: toStr(r["용역개요"]),
          contract_amount: hasPhases ? (Math.round(sum("계약금액")) || null) : toNum(r["계약금액"]),
          contract_date: toDate(r["계약일"]),
          start_date: hasPhases ? firstDate("착수일") : toDate(r["착수일"]),
          completion_date: hasPhases ? lastDate("준공일") : toDate(r["준공일"]),
          is_dual_participation: String(r["2종 분담참여"] ?? "").toUpperCase() === "Y",
          participation_rate: toPct(r["참여지분율(%)"] ?? r["참여지분율"] ?? r["지분율"]),
          company_share_rate: toPctStr(r["각사지분율"]),
          share_amount: hasPhases ? (Math.round(sum("지분금액")) || null) : toNum(r["지분금액"]),
          notes: toStr(r["비고"]),
          phases,
        };
      });
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

  const addPhase = () => {
    const next = form.phases.length + 1;
    setForm({ ...form, phases: [...form.phases, { label: `${next}차`, amount: "", contract_amount: "", share_rate: "", contract_date: "", start_date: "", end_date: "", pdf_path: "", pdf_file: null, amount_touched: false }] });
  };
  const updatePhase = (i: number, key: "label" | "amount" | "contract_amount" | "share_rate" | "contract_date" | "start_date" | "end_date" | "pdf_path", v: string) => {
    const ps = [...form.phases];
    const cur = { ...ps[i], [key]: v };
    if (key === "amount") {
      cur.amount_touched = true;
    } else if ((key === "contract_amount" || key === "share_rate") && !cur.amount_touched) {
      const ca = Number(cur.contract_amount);
      const sr = Number(cur.share_rate);
      if (!isNaN(ca) && !isNaN(sr) && cur.contract_amount !== "" && cur.share_rate !== "") {
        cur.amount = String(Math.round(ca * sr / 100));
      }
    }
    ps[i] = cur;
    setForm({ ...form, phases: ps });
  };
  const removePhase = (i: number) => {
    setForm({ ...form, phases: form.phases.filter((_, idx) => idx !== i) });
  };

  const toggleServiceFilter = (st: string) => {
    setFilterServiceTypes((prev) => prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]);
  };

  const [editGroups, setEditGroups] = useState(false);

  return (
    <AppLayout title="PQ 유사용역 (회사실적)">
      <div className="space-y-4">
        {/* 적용계수 필터 + 합계 */}
        <Card className="p-4 shadow-card">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">평가종류 (기준, 복수선택)</Label>
              <div className="flex flex-wrap gap-3">
                {evalTypeOptions.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={filterEvalTypes.includes(t)}
                      onCheckedChange={() => {
                        setFilterEvalTypes((prev) =>
                          prev.includes(t) ? prev.filter((s) => s !== t) : [...prev, t]
                        );
                      }}
                    />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              {filterEvalTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 p-2 rounded-md border bg-muted/30">
                  <span className="text-[11px] text-muted-foreground mr-1 self-center">선택됨:</span>
                  {filterEvalTypes.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                      {t}
                      <button type="button" onClick={() => setFilterEvalTypes((prev) => prev.filter((s) => s !== t))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setFilterEvalTypes([])} className="text-[11px] text-muted-foreground hover:text-destructive ml-1 self-center">전체해제</button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">사업종류 (기준, 복수선택)</Label>
              <Input
                placeholder="직접입력 후 Enter (쉼표로 여러 개)"
                className="h-8 text-xs w-full max-w-md"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const raw = (e.currentTarget.value || "").split(",").map((s) => s.trim()).filter(Boolean);
                  if (!raw.length) return;
                  setFilterServiceTypes((prev) => Array.from(new Set([...prev, ...raw])));
                  e.currentTarget.value = "";
                }}
              />
              {filterServiceTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 p-2 rounded-md border bg-muted/30">
                  <span className="text-[11px] text-muted-foreground mr-1 self-center">선택됨:</span>
                  {filterServiceTypes.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                      {t}
                      <button type="button" onClick={() => setFilterServiceTypes((prev) => prev.filter((s) => s !== t))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setFilterServiceTypes([])} className="text-[11px] text-muted-foreground hover:text-destructive ml-1 self-center">전체해제</button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background">
              <span className="text-xs text-muted-foreground">공고일</span>
              <Input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={filterAnnouncementDate}
                onChange={(e) => setFilterAnnouncementDate(clampDate(e.target.value))}
                className="h-7 w-[150px] text-xs"
              />
              {filterAnnouncementDate && (
                <button type="button" onClick={() => setFilterAnnouncementDate("")} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-[11px] text-muted-foreground mr-2">총 적용건수</span>
              <span className="text-sm font-bold text-primary">{totalAppliedCount.toFixed(2)}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-[11px] text-muted-foreground mr-2">총 적용금액</span>
              <span className="text-sm font-bold text-primary">{Math.round(totalAppliedAmount).toLocaleString()} 원</span>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={excludePrivate} onCheckedChange={(v) => setExcludePrivate(!!v)} />
              <span className="text-xs">민간사업 제외</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeUnder90} onCheckedChange={(v) => setIncludeUnder90(!!v)} />
              <span className="text-xs">90일미만 포함</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeLh} onCheckedChange={(v) => setIncludeLh(!!v)} />
              <span className="text-xs">LH기성실적 포함</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeProgress} onCheckedChange={(v) => setIncludeProgress(!!v)} />
              <span className="text-xs">기성실적 포함</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeDual} onCheckedChange={(v) => setIncludeDual(!!v)} />
              <span className="text-xs">분담사업 포함</span>
            </label>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            * 일치 시 1.0, 불일치 시 0.6 / 적용건수 = 평가×사업×참여지분율 / 적용금액 = 평가×사업×지분금액
          </div>
        </Card>

        <Card className="p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={addSeqNumbers} onCheckedChange={(v) => setAddSeqNumbers(!!v)} />
                <span className="text-xs">연번 기입 (착수일 오름차순)</span>
              </label>
              <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="mr-1 h-4 w-4" />엑셀 내보내기</Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}><FileText className="mr-1 h-4 w-4" />PDF 병합</Button>
            </div>
          </div>
        </Card>

        <Card className="shadow-card overflow-hidden">
          {/* 데스크톱 테이블 */}
          <div className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40px]">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="전체 선택" />
                  </TableHead>
                  <TableHead className="min-w-[160px] max-w-[220px]">사업명</TableHead>
                  <TableHead className="min-w-[140px] max-w-[200px]">발주처</TableHead>
                  <TableHead className="whitespace-nowrap">착수일</TableHead>
                  <TableHead className="whitespace-nowrap">준공일</TableHead>
                  <TableHead className="whitespace-nowrap text-right">계약금액</TableHead>
                  <TableHead className="whitespace-nowrap text-right">참여(%)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">지분금액</TableHead>
                  <TableHead className="whitespace-nowrap">평가종류</TableHead>
                  <TableHead className="whitespace-nowrap">사업종류</TableHead>
                  <TableHead className="whitespace-nowrap text-right">적용건수</TableHead>
                  <TableHead className="whitespace-nowrap text-right">적용금액</TableHead>
                  <TableHead className="whitespace-nowrap text-center">PDF</TableHead>
                  <TableHead className="text-right w-[60px]">삭제</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={17} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                    실적 데이터베이스에서 동기화된 데이터가 없습니다.
                  </TableCell></TableRow>
                ) : filtered.map((r) => {
                  const phasePdfCount = (Array.isArray(r.phases) ? r.phases : []).filter((p) => (p as any).pdf_path).length;
                  const hasPdf = phasePdfCount > 0 || !!(r as any).cert_pdf_path;
                  const over5 = isOver5y(r);
                  const isPrivate = r.is_private;
                  return (
                  <TableRow key={r.id} data-state={selectedIds.has(r.id) ? "selected" : undefined} className={over5 ? "bg-destructive/5" : isPrivate ? "bg-lime-100/60" : undefined}>
                    <TableCell className="align-middle">
                      <Checkbox checked={selectedIds.has(r.id)} disabled={over5} onCheckedChange={() => toggleSelect(r.id)} aria-label="선택" />
                    </TableCell>
                    <TableCell className="font-medium min-w-[160px] max-w-[220px] whitespace-normal break-words align-middle">
                      {r.project_name}{phaseSuffix(r)}
                      {isPrivate && <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-lime-200 text-lime-800 border border-lime-300 align-middle">민간</span>}
                      {over5 && <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-destructive/15 text-destructive border border-destructive/30 align-middle">5년 경과</span>}
                    </TableCell>
                    <TableCell className="min-w-[140px] max-w-[200px] whitespace-normal break-words align-middle">{r.client ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{fmtDate(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{fmtDate(r.completion_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{fmtNum(r.contract_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{r.is_dual_participation ? "-" : (r.participation_rate == null ? "-" : `${fmtNum(r.participation_rate)}%`)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{fmtNum(r.share_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{r.evaluation_type ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{r.service_type ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle font-medium">{appliedCount(r).toFixed(2)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle font-medium">{Math.round(appliedAmount(r)).toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap text-center align-middle">
                      {hasPdf ? <FileText className="h-4 w-4 text-primary inline" /> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 카드 리스트 */}
          <div className="md:hidden divide-y">
            {loading ? (
              <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm px-4">실적 데이터베이스에서 동기화된 데이터가 없습니다.</div>
            ) : filtered.map((r) => {
              const phasePdfCount = (Array.isArray(r.phases) ? r.phases : []).filter((p) => (p as any).pdf_path).length;
              const hasPdf = phasePdfCount > 0 || !!(r as any).cert_pdf_path;
              const expanded = expandedIds.has(r.id);
              const over5 = isOver5y(r);
              const isPrivate = r.is_private;
              return (
                <div key={r.id} className={`px-3 py-2.5 ${over5 ? "bg-destructive/5" : isPrivate ? "bg-lime-100/60" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={selectedIds.has(r.id)} disabled={over5} onCheckedChange={() => toggleSelect(r.id)} aria-label="선택" />
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      className="flex-1 text-left text-sm font-medium break-words"
                    >
                      {r.project_name}{phaseSuffix(r)}
                      {isPrivate && <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-lime-200 text-lime-800 border border-lime-300 align-middle">민간</span>}
                      {over5 && <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-destructive/15 text-destructive border border-destructive/30 align-middle">5년 경과</span>}
                    </button>
                    <span className="text-xs text-muted-foreground shrink-0">{expanded ? "접기" : "펼치기"}</span>
                  </div>
                  {expanded && (
                    <div className="mt-2 ml-6 space-y-1.5 text-xs">
                      <div className="grid grid-cols-[88px_1fr] gap-y-1">
                        <span className="text-muted-foreground">발주처</span><span className="break-words">{r.client ?? "-"}</span>
                        <span className="text-muted-foreground">평가종류</span><span>{r.evaluation_type ?? "-"}</span>
                        <span className="text-muted-foreground">사업종류</span><span>{r.service_type ?? "-"}</span>
                        <span className="text-muted-foreground">착수일</span><span>{fmtDate(r.start_date)}</span>
                        <span className="text-muted-foreground">준공일</span><span>{fmtDate(r.completion_date)}</span>
                        <span className="text-muted-foreground">계약금액</span><span>{fmtNum(r.contract_amount)}</span>
                        <span className="text-muted-foreground">참여(%)</span><span>{r.is_dual_participation ? "-" : (r.participation_rate == null ? "-" : `${fmtNum(r.participation_rate)}%`)}</span>
                        <span className="text-muted-foreground">지분금액</span><span>{fmtNum(r.share_amount)}</span>
                        <span className="text-muted-foreground">적용건수</span><span className="font-medium">{appliedCount(r).toFixed(2)}</span>
                        <span className="text-muted-foreground">적용금액</span><span className="font-medium">{Math.round(appliedAmount(r)).toLocaleString()}</span>
                        <span className="text-muted-foreground">PDF</span><span>{hasPdf ? <FileText className="h-3.5 w-3.5 text-primary inline" /> : "-"}</span>
                      </div>
                      <div className="flex justify-end gap-1 pt-1">
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 mr-1 text-destructive" />삭제</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-2 text-xs text-muted-foreground border-t flex flex-col sm:flex-row gap-1 sm:justify-between">
            <span>총 {filtered.length}건 {selectedIds.size > 0 && <span className="ml-2 text-primary">(선택 {selectedIds.size}건)</span>}</span>
            <span>적용건수 합계: <b>{totalAppliedCount.toFixed(2)}</b> / 적용금액 합계: <b>{Math.round(totalAppliedAmount).toLocaleString()}</b> 원</span>
          </div>
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
