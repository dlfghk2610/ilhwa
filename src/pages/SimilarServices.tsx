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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload, Search, Loader2, X, FileText } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Phase = { label: string; amount: number | null; contract_amount?: number | null; share_rate?: number | null; start_date?: string | null; end_date?: string | null; pdf_path?: string | null };

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
  notes: "",
  phases: [] as { label: string; amount: string; contract_amount: string; share_rate: string; start_date: string; end_date: string; pdf_path: string; pdf_file: File | null; amount_touched: boolean }[],
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 적용 계수 필터
  const [filterEvalType, setFilterEvalType] = useState<string>("");
  const [filterServiceTypes, setFilterServiceTypes] = useState<string[]>([]);

  // 민간사업 / 90일미만 / LH기성실적 필터 (localStorage 영속)
  const PRIVATE_FILTER_KEY = "similar_services.include_private.v1";
  const UNDER90_FILTER_KEY = "similar_services.include_under90.v1";
  const LH_FILTER_KEY = "similar_services.include_lh.v1";
  const [includePrivate, setIncludePrivate] = useState<boolean>(() => {
    try { return localStorage.getItem(PRIVATE_FILTER_KEY) === "1"; } catch { return false; }
  });
  const [includeUnder90, setIncludeUnder90] = useState<boolean>(() => {
    try { return localStorage.getItem(UNDER90_FILTER_KEY) === "1"; } catch { return false; }
  });
  const [includeLh, setIncludeLh] = useState<boolean>(() => {
    try { return localStorage.getItem(LH_FILTER_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(PRIVATE_FILTER_KEY, includePrivate ? "1" : "0"); } catch {} }, [includePrivate]);
  useEffect(() => { try { localStorage.setItem(UNDER90_FILTER_KEY, includeUnder90 ? "1" : "0"); } catch {} }, [includeUnder90]);
  useEffect(() => { try { localStorage.setItem(LH_FILTER_KEY, includeLh ? "1" : "0"); } catch {} }, [includeLh]);

  // 공고일 (전역): 이 날짜로부터 준공일까지 5년 초과 시 집계 제외
  const ANNOUNCEMENT_KEY = "similar_services.announcement_date.v1";
  const EXCLUDE5Y_KEY = "similar_services.exclude_5y.v1";
  const [filterAnnouncementDate, setFilterAnnouncementDate] = useState<string>(() => {
    try { return localStorage.getItem(ANNOUNCEMENT_KEY) ?? ""; } catch { return ""; }
  });
  const [exclude5y, setExclude5y] = useState<boolean>(() => {
    try { return localStorage.getItem(EXCLUDE5Y_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(ANNOUNCEMENT_KEY, filterAnnouncementDate); } catch {} }, [filterAnnouncementDate]);
  useEffect(() => { try { localStorage.setItem(EXCLUDE5Y_KEY, exclude5y ? "1" : "0"); } catch {} }, [exclude5y]);

  // 사용자 정의 사업종류 그룹 (localStorage)
  const DEFAULT_GROUPS: { group: string; items: string[] }[] = [
    { group: "단지계열", items: ["관광", "도시개발", "택지개발", "산업단지", "주택단지"] },
    { group: "하천계열", items: ["국가하천", "지방하천", "소하천", "하천기본계획", "재해영향평가"] },
    { group: "도로계열", items: ["고속도로", "국도", "지방도", "도시계획도로"] },
    { group: "상하수도계열", items: ["상수도", "하수도", "우수관거"] },
    { group: "환경계열", items: ["환경영향평가", "수질", "대기", "폐기물"] },
  ];
  const SERVICE_GROUPS_KEY = "similar_services.service_groups.v1";
  const [customGroups, setCustomGroups] = useState<{ group: string; items: string[] }[]>(() => {
    try {
      const raw = localStorage.getItem(SERVICE_GROUPS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_GROUPS;
  });
  useEffect(() => {
    try { localStorage.setItem(SERVICE_GROUPS_KEY, JSON.stringify(customGroups)); } catch {}
  }, [customGroups]);
  const HIDDEN_EXTRAS_KEY = "similar_services.hidden_extras.v1";
  const [hiddenExtras, setHiddenExtras] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(HIDDEN_EXTRAS_KEY); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_EXTRAS_KEY, JSON.stringify(hiddenExtras)); } catch {}
  }, [hiddenExtras]);
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
      notes: row.notes ?? "",
      phases: phases.map((p) => ({ label: p.label ?? "", amount: p.amount != null ? String(p.amount) : "", contract_amount: (p as any).contract_amount != null ? String((p as any).contract_amount) : "", share_rate: (p as any).share_rate != null ? String((p as any).share_rate) : "", start_date: p.start_date ?? "", end_date: p.end_date ?? "", pdf_path: (p as any).pdf_path ?? "", pdf_file: null, amount_touched: true })),
      cert_pdf_path: (row as any).cert_pdf_path ?? "",
      cert_pdf_file: null,
    });
    setShareAmountTouched(true);
    setOpen(true);
  };

  const num = (v: string) => (v === "" || v === null ? null : Number(v));
  const txt = (v: string) => (v === "" ? null : v);
  // 년도 4자리로 제한 (YYYY-MM-DD)
  const clampDate = (v: string) => {
    if (!v) return "";
    const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
    if (!m) return v;
    const y = m[1].slice(-4).padStart(4, "0");
    return `${y}-${m[2]}-${m[3]}`;
  };

  const uploadPdf = async (file: File, folder: string, name: string) => {
    const path = `${user!.id}/${folder}/${Date.now()}-${name}`;
    const { error } = await supabase.storage.from("performance-certs").upload(path, file, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    return path;
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
        .filter(({ p }) => p.label.trim() !== "" || p.amount !== "" || p.start_date !== "" || p.end_date !== "" || p.pdf_path || p.pdf_file)
        .map(({ p, pdf_path }) => ({
          label: p.label.trim(),
          amount: p.amount === "" ? null : Number(p.amount),
          start_date: p.start_date || null,
          end_date: p.end_date || null,
          pdf_path,
        }));

      let derivedStart = txt(form.start_date);
      let derivedCompletion = txt(form.completion_date);
      if (form.evaluation_type === "사후" && phasesPayload.length > 0) {
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
        notes: txt(form.notes),
        phases: phasesPayload,
        cert_pdf_path: certPath,
      };

      if (editing) {
        const { error } = await supabase.from("similar_services").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정 완료"); setOpen(false); load();
      } else {
        const { error } = await supabase.from("similar_services").insert({ ...payload, id: rowFolder, created_by: user.id });
        if (error) throw error;
        toast.success("등록 완료"); setOpen(false); load();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("similar_services").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("삭제 완료"); load(); }
    setDeleteId(null);
  };

  const filtered = rows.filter((r) => {
    if ((r as any).is_private && !includePrivate) return false;
    if ((r as any).is_under_90days && !includeUnder90) return false;
    if ((r as any).is_lh_completion && !includeLh) return false;
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

  // 선택 (엑셀/PDF 내보내기 대상)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 연번 기입 옵션
  const [addSeqNumbers, setAddSeqNumbers] = useState(false);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(filtered.map((r) => r.id));
    });
  };

  const fmtNum = (v: number | null) => (v == null ? "-" : Number(v).toLocaleString());
  const fmtDate = (v: string | null) => (v ? String(v).slice(0, 10) : "-");

  // 평가종류 (고정 4가지)
  const EVAL_TYPES = ["소규모", "전략", "사후", "평가"] as const;
  const evalTypeOptions = EVAL_TYPES as readonly string[];
  // 사업종류 카테고리 그룹 (사용자 정의 + 데이터에서 발견된 기타)
  const knownServiceTypes = useMemo(() => new Set(customGroups.flatMap((g) => g.items)), [customGroups]);
  // 데이터에서 발견된 미분류 항목을 자동으로 "기타" 그룹에 추가 (편집 가능)
  useEffect(() => {
    const hidden = new Set(hiddenExtras);
    const fromData = Array.from(new Set(rows.map((r) => (r.service_type ?? "").trim()).filter(Boolean)));
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
    if ((r.evaluation_type ?? "") === "평가") return 1.0;
    if (!filterEvalType) return 0.6;
    return (r.evaluation_type ?? "") === filterEvalType ? 1.0 : 0.6;
  };
  const serviceCoef = (r: Row) => {
    if (filterServiceTypes.length === 0) return 0.6;
    return filterServiceTypes.includes(r.service_type ?? "") ? 1.0 : 0.6;
  };

  // 공고일~준공일 5년 초과 시 집계 제외 (공고일은 전역 입력)
  const isExpired5y = (r: Row) => {
    if (!exclude5y) return false;
    const ann = filterAnnouncementDate;
    const comp = r.completion_date;
    if (!ann || !comp) return false;
    const a = new Date(ann).getTime();
    const c = new Date(comp).getTime();
    if (isNaN(a) || isNaN(c)) return false;
    const fiveYearsMs = 5 * 365.25 * 24 * 60 * 60 * 1000;
    return a - c > fiveYearsMs;
  };

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

  const totalAppliedCount = filtered.reduce((s, r) => s + appliedCount(r), 0);
  const totalAppliedAmount = filtered.reduce((s, r) => s + appliedAmount(r), 0);

  const handleExport = async () => {
    // 선택된 행만 (없으면 전체) - 착수일 오름차순 정렬 (filtered가 이미 정렬됨)
    const targets = (selectedIds.size > 0
      ? filtered.filter((r) => selectedIds.has(r.id))
      : filtered);
    if (targets.length === 0) { toast.error("내보낼 데이터가 없습니다"); return; }

    // 메인 화면 컬럼 순서와 동일
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
          "참여(%)": r.is_dual_participation || r.participation_rate == null ? null : `${r.participation_rate}%`,
          "지분금액": r.share_amount,
          "평가종류": r.evaluation_type,
          "사업종류": r.service_type,
          "각사지분율": r.is_dual_participation || r.company_share_rate == null || r.company_share_rate === "" ? null : `${r.company_share_rate}%`,
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
        // 사후 등 차수가 여러 개여도 첫 행에만 연번 기재
        ps.forEach((p, idx) => {
          const label = (p.label && p.label.trim()) || "";
          data.push(makeRow(label ? `(${label})` : "", idx === 0 ? seqLabel : "", {
            "착수일": p.start_date ?? r.start_date,
            "준공일": p.end_date ?? r.completion_date,
            "지분금액": p.amount ?? null,
          }));
        });
      }
    });
    exportToExcel(data, "PQ유사용역");
    toast.success("엑셀 다운로드 완료");

    // 실적증명서 PDF 병합 (대표 착수일 오름차순; 사후는 차수 PDF를 통으로)
    try {
      const merged = await PDFDocument.create();
      const seqFont = addSeqNumbers ? await merged.embedFont(StandardFonts.HelveticaBold) : null;
      let added = 0;
      let pdfSeq = 0;
      for (const r of targets) {
        pdfSeq++;
        // 차수별 PDF (있으면 1차→N차 순서대로)
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
              // 사후/다차수 → 1차 첫 페이지에만 / 일반 다중 페이지 → 첫 페이지에만
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

  const addPhase = () => {
    const next = form.phases.length + 1;
    setForm({ ...form, phases: [...form.phases, { label: `${next}차`, amount: "", start_date: "", end_date: "", pdf_path: "", pdf_file: null }] });
  };
  const updatePhase = (i: number, key: "label" | "amount" | "start_date" | "end_date" | "pdf_path", v: string) => {
    const ps = [...form.phases];
    ps[i] = { ...ps[i], [key]: v };
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
              <Label className="text-sm font-semibold">평가종류 (기준)</Label>
              <Select value={filterEvalType} onValueChange={(v) => setFilterEvalType(v)}>
                <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue placeholder="평가종류 선택" /></SelectTrigger>
                <SelectContent>
                  {evalTypeOptions.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-sm font-semibold">사업종류 (기준, 복수선택)</Label>
                <div className="flex items-center gap-1">
                  {editGroups && (
                    <>
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        placeholder="새 계열명 (예: 단지계열)"
                        className="h-7 text-xs w-44"
                      />
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={addGroup}>계열 추가</Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={editGroups ? "default" : "outline"}
                    className="h-7 px-2"
                    onClick={() => setEditGroups((v) => !v)}
                  >
                    {editGroups ? "완료" : "편집"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 p-2 rounded-md border bg-background">
                {customGroups.length === 0 && <span className="text-xs text-muted-foreground">계열을 추가하세요</span>}
                {customGroups.map((g) => (
                  <div key={g.group} className="flex flex-wrap items-center gap-2 pb-1.5 border-b last:border-0">
                    <span className="text-xs font-semibold text-muted-foreground min-w-[72px]">{g.group}</span>
                    {g.items.map((t) => (
                      <span key={t} className="flex items-center gap-1 text-sm px-2 py-0.5 rounded border hover:bg-muted">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Checkbox checked={filterServiceTypes.includes(t)} onCheckedChange={() => toggleServiceFilter(t)} />
                          <span>{t}</span>
                        </label>
                        {editGroups && (
                          <button type="button" onClick={() => removeItem(g.group, t)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {editGroups && (
                      <>
                        <Input
                          value={newItemInputs[g.group] ?? ""}
                          onChange={(e) => setNewItemInputs({ ...newItemInputs, [g.group]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(g.group); } }}
                          placeholder="+ 종류"
                          className="h-6 text-xs w-24"
                        />
                        <button type="button" onClick={() => removeGroup(g.group)} className="text-[11px] text-muted-foreground hover:text-destructive ml-auto">계열삭제</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-center">
            <div className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-[11px] text-muted-foreground mr-2">총 적용건수</span>
              <span className="text-sm font-bold text-primary">{totalAppliedCount.toFixed(2)}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-[11px] text-muted-foreground mr-2">총 적용금액</span>
              <span className="text-sm font-bold text-primary">{Math.round(totalAppliedAmount).toLocaleString()} 원</span>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includePrivate} onCheckedChange={(v) => setIncludePrivate(!!v)} />
              <span className="text-xs">민간사업 포함</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeUnder90} onCheckedChange={(v) => setIncludeUnder90(!!v)} />
              <span className="text-xs">90일미만 포함</span>
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={includeLh} onCheckedChange={(v) => setIncludeLh(!!v)} />
              <span className="text-xs">LH기성실적 포함</span>
            </label>
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
              <label className="flex items-center gap-1.5 ml-1 pl-2 border-l cursor-pointer">
                <Checkbox checked={exclude5y} onCheckedChange={(v) => setExclude5y(!!v)} />
                <span className="text-xs">5년 이상사업 제외</span>
              </label>
            </div>
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
                        <Select value={form.evaluation_type || "__none__"} onValueChange={(v) => setForm({ ...form, evaluation_type: v === "__none__" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="평가종류 선택" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안 함</SelectItem>
                            {EVAL_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>계약일</Label>
                        <Input type="date" min="1900-01-01" max="9999-12-31" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: clampDate(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>착수일</Label>
                        <Input type="date" min="1900-01-01" max="9999-12-31" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: clampDate(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>준공일</Label>
                        <Input type="date" min="1900-01-01" max="9999-12-31" value={form.completion_date} onChange={(e) => setForm({ ...form, completion_date: clampDate(e.target.value) })} />
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

                      <div className="md:col-span-2 flex flex-wrap items-center gap-4 p-3 rounded-md border bg-muted/20">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={form.is_private}
                            onCheckedChange={(v) => setForm({ ...form, is_private: !!v })} />
                          <span className="text-sm">민간사업</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={form.is_under_90days}
                            onCheckedChange={(v) => setForm({ ...form, is_under_90days: !!v })} />
                          <span className="text-sm">90일미만</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={form.is_lh_completion}
                            onCheckedChange={(v) => setForm({ ...form, is_lh_completion: !!v })} />
                          <span className="text-sm">LH기성실적</span>
                        </label>
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

                      {/* 차수 입력 */}
                      <div className="space-y-2 md:col-span-2 p-3 rounded-md border bg-muted/20">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">차수 (사후 평가용)</Label>
                          <Button type="button" size="sm" variant="outline" onClick={addPhase}>
                            <Plus className="h-3 w-3 mr-1" />차수 추가
                          </Button>
                        </div>
                        {form.phases.length === 0 ? (
                          <div className="text-xs text-muted-foreground">차수가 없으면 1건으로 처리됩니다. 사후의 경우 첫 차수 착수일·마지막 차수 준공일이 대표일자로 자동 반영됩니다.</div>
                        ) : (
                          <div className="space-y-3">
                            {form.phases.map((p, i) => (
                              <div key={i} className="space-y-1.5 p-2 rounded border bg-background">
                                <div className="grid grid-cols-12 gap-2 items-center">
                                  <Input
                                    className="col-span-2"
                                    placeholder="1차"
                                    value={p.label}
                                    onChange={(e) => updatePhase(i, "label", e.target.value)}
                                  />
                                  <Input
                                    className="col-span-3"
                                    type="date"
                                    min="1900-01-01"
                                    max="9999-12-31"
                                    value={p.start_date}
                                    onChange={(e) => updatePhase(i, "start_date", clampDate(e.target.value))}
                                  />
                                  <Input
                                    className="col-span-3"
                                    type="date"
                                    min="1900-01-01"
                                    max="9999-12-31"
                                    value={p.end_date}
                                    onChange={(e) => updatePhase(i, "end_date", clampDate(e.target.value))}
                                  />
                                  <Input
                                    className="col-span-3"
                                    inputMode="decimal"
                                    placeholder="차수 지분금액"
                                    value={p.amount === "" ? "" : Number(p.amount).toLocaleString()}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/[^\d.-]/g, "");
                                      updatePhase(i, "amount", raw);
                                    }}
                                  />
                                  <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => removePhase(i)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">{p.label || `${i + 1}차`} 실적증명서:</span>
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    className="text-xs"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0] ?? null;
                                      const ps = [...form.phases];
                                      ps[i] = { ...ps[i], pdf_file: f };
                                      setForm({ ...form, phases: ps });
                                    }}
                                  />
                                  {p.pdf_path && !p.pdf_file && (
                                    <span className="text-primary">기존 파일 등록됨</span>
                                  )}
                                  {(p.pdf_path || p.pdf_file) && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => {
                                        const ps = [...form.phases];
                                        ps[i] = { ...ps[i], pdf_file: null, pdf_path: "" };
                                        setForm({ ...form, phases: ps });
                                      }}
                                    >제거</button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-1">
                              <div className="col-span-2">차수명</div>
                              <div className="col-span-3">착수일</div>
                              <div className="col-span-3">준공일</div>
                              <div className="col-span-3 text-right">지분금액</div>
                            </div>
                            <div className="text-xs text-right text-muted-foreground">
                              차수 합계: {phasesTotal.toLocaleString()} 원
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 실적증명서 PDF (차수가 없을 때 사용) */}
                      {form.phases.length === 0 && (
                        <div className="space-y-1.5 md:col-span-2 p-3 rounded-md border bg-muted/20">
                          <Label className="text-sm font-semibold flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />실적증명서 PDF
                          </Label>
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => setForm({ ...form, cert_pdf_file: e.target.files?.[0] ?? null })}
                            className="text-sm"
                          />
                          {form.cert_pdf_path && !form.cert_pdf_file && (
                            <div className="text-xs text-primary">기존 파일이 등록되어 있습니다.</div>
                          )}
                          {(form.cert_pdf_path || form.cert_pdf_file) && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => setForm({ ...form, cert_pdf_file: null, cert_pdf_path: "" })}
                            >파일 제거</button>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5 md:col-span-2">
                        <Label>지분금액 (원) <span className="text-xs text-muted-foreground">— 차수 입력 시 자동 합계 / 그 외 자동 계산되며 수기 수정 가능</span></Label>
                        <Input
                          inputMode="decimal"
                          disabled={form.phases.length > 0}
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
                  <TableHead className="w-[40px]">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="전체 선택" />
                  </TableHead>
                  <TableHead className="min-w-[160px] max-w-[220px]">사업명</TableHead>
                  <TableHead className="min-w-[140px] max-w-[200px]">발주처</TableHead>
                  <TableHead className="whitespace-nowrap">계약일</TableHead>
                  <TableHead className="whitespace-nowrap">착수일</TableHead>
                  <TableHead className="whitespace-nowrap">준공일</TableHead>
                  <TableHead className="whitespace-nowrap text-right">계약금액</TableHead>
                  <TableHead className="whitespace-nowrap text-right">참여(%)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">지분금액</TableHead>
                  <TableHead className="whitespace-nowrap">평가종류</TableHead>
                  <TableHead className="whitespace-nowrap">사업종류</TableHead>
                  <TableHead className="min-w-[140px] max-w-[200px]">각사지분율</TableHead>
                  <TableHead className="whitespace-nowrap text-center">2종</TableHead>
                  <TableHead className="whitespace-nowrap text-right">적용건수</TableHead>
                  <TableHead className="whitespace-nowrap text-right">적용금액</TableHead>
                  <TableHead className="whitespace-nowrap text-center">PDF</TableHead>
                  <TableHead className="text-right w-[100px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={17} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin inline text-primary" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                    데이터가 없습니다. 상단 [등록] 버튼으로 추가하세요.
                  </TableCell></TableRow>
                ) : filtered.map((r) => {
                  const phasePdfCount = (Array.isArray(r.phases) ? r.phases : []).filter((p) => (p as any).pdf_path).length;
                  const hasPdf = phasePdfCount > 0 || !!(r as any).cert_pdf_path;
                  return (
                  <TableRow key={r.id} data-state={selectedIds.has(r.id) ? "selected" : undefined}>
                    <TableCell className="align-middle">
                      <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} aria-label="선택" />
                    </TableCell>
                    <TableCell className="font-medium min-w-[160px] max-w-[220px] whitespace-normal break-words align-middle">{r.project_name}{phaseSuffix(r)}</TableCell>
                    <TableCell className="min-w-[140px] max-w-[200px] whitespace-normal break-words align-middle">{r.client ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{fmtDate(r.contract_date)}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{fmtDate(r.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{fmtDate(r.completion_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{fmtNum(r.contract_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{r.is_dual_participation ? "-" : (r.participation_rate == null ? "-" : `${fmtNum(r.participation_rate)}%`)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle">{fmtNum(r.share_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{r.evaluation_type ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap align-middle">{r.service_type ?? "-"}</TableCell>
                    <TableCell className="min-w-[140px] max-w-[200px] whitespace-pre-wrap break-words align-middle">{r.is_dual_participation ? "-" : (r.company_share_rate ?? "-")}</TableCell>
                    <TableCell className="whitespace-nowrap text-center align-middle">{r.is_dual_participation ? "✓" : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle font-medium">{appliedCount(r).toFixed(2)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-middle font-medium">{Math.round(appliedAmount(r)).toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap text-center align-middle">
                      {hasPdf ? <FileText className="h-4 w-4 text-primary inline" /> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t flex justify-between">
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
