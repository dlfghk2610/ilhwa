import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Download, ArrowLeft, Search, ChevronUp, ChevronDown, ChevronRight, Star } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";
import * as XLSX from "xlsx";
import {
  CareerEntry, classifyEval, computeRecognition, daysToYearMonth,
  dateDiffDaysInclusive, evalWeight, selectOptimal, computeShifted, fmtDate,
  isWorkingNow, isPrivateClient, effectiveIsPrivate,
  type CalcStandard,
} from "@/lib/career-calc";

type Technician = {
  id: string;
  name: string;
  birth_date: string | null;
  specialty: string | null;
  company: string | null;
  position: string | null;
  notes: string | null;
  calc_standard?: string | null;
};

type TechStat = {
  recognizedDays: number;
  convertedDays: number;
  count: number;
};

type Education = { school: string; major: string; degree: "학사" | "석사" | "박사" | "" };
type Certification = { name: string; number: string; acquired_date: string; is_primary: boolean };
type PersonalProfile = {
  technician_name: string;
  birth_date: string | null;
  specialty: string | null;
  address: string | null;
  grade_kepa: string | null;
  grade_eval: string | null;
  educations: Education[];
  certifications: Certification[];
};
type PersonalCareerRow = {
  technician_name: string;
  company: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  resign_date: string | null;
};

const EXCEL_HEADERS = [
  "참여시작일", "참여종료일", "인정일", "사업명", "발주처",
  "사업공종", "전문분야", "담당업무", "평가구분", "참여회사", "참여직위",
];

const fmtBirth = (s?: string | null) => {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return y && m && d ? `${y}.${m}.${d}` : s;
};

const koreanAgeNow = (birth?: string | null) => {
  if (!birth) return "";
  const b = new Date(birth + "T00:00:00");
  const r = new Date();
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age -= 1;
  return age >= 0 ? `${age}` : "";
};

const toIsoDate = (v: any): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const t = s.replace(/\./g, "-").replace(/\//g, "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
};

const formatIso = (s?: string | null) => (s ? s.replace(/-/g, ".") : "");

export default function Careers() {
  const { user } = useAuth();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [techForm, setTechForm] = useState<Partial<Technician>>({});
  const [deleteTech, setDeleteTech] = useState<Technician | null>(null);

  const [techStats, setTechStats] = useState<Record<string, TechStat>>({});
  const [entriesByTechId, setEntriesByTechId] = useState<Record<string, any[]>>({});
  const [profilesByName, setProfilesByName] = useState<Record<string, PersonalProfile>>({});
  const [careersByName, setCareersByName] = useState<Record<string, PersonalCareerRow[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});


  const loadPersonalData = async () => {
    const [{ data: pData }, { data: cData }] = await Promise.all([
      (supabase as any).from("personal_profiles").select("*"),
      supabase.from("personal_careers").select("*").order("hire_date", { ascending: true }),
    ]);
    const pMap: Record<string, PersonalProfile> = {};
    ((pData as any[]) || []).forEach((p) => {
      pMap[p.technician_name] = {
        technician_name: p.technician_name,
        birth_date: p.birth_date,
        specialty: p.specialty,
        address: p.address ?? null,
        grade_kepa: p.grade_kepa ?? null,
        grade_eval: p.grade_eval ?? null,
        educations: Array.isArray(p.educations) ? p.educations : [],
        certifications: Array.isArray(p.certifications) ? p.certifications : [],
      };
    });
    const cMap: Record<string, PersonalCareerRow[]> = {};
    ((cData as any[]) || []).forEach((c) => {
      if (!cMap[c.technician_name]) cMap[c.technician_name] = [];
      cMap[c.technician_name].push(c);
    });
    setProfilesByName(pMap);
    setCareersByName(cMap);
  };

  const loadTechs = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("technicians").select("*").order("name");
    if (error) toast.error(error.message);
    else setTechs((data as Technician[]) || []);
    setLoading(false);
  };

  const loadAllStats = async (techList: Technician[]) => {
    // 페이징으로 전체 행 가져오기 (Supabase 기본 1000행 제한 회피)
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("career_entries")
        .select("technician_id,specialty,evaluation_category,period_start,period_end_text,recognized_days,client,project_name,manual_private_override")
        .range(from, from + pageSize - 1);
      if (error) return;
      const chunk = (data || []) as any[];
      all.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    const byTech = new Map<string, any[]>();
    for (const e of all) {
      if (!byTech.has(e.technician_id)) byTech.set(e.technician_id, []);
      byTech.get(e.technician_id)!.push(e);
    }
    const stats: Record<string, TechStat> = {};
    for (const t of techList) {
      const list = byTech.get(t.id) || [];
      // 상세화면 ① 인정일 계산 탭과 동일: 모든 행의 인정일/환산일수 단순 합계
      const recRows = list.map((e) => computeRecognition(e as any, t.specialty, false));
      let rec = 0, conv = 0;
      for (const r of recRows) {
        rec += r.recognizedDays;
        conv += r.convertedDays;
      }
      stats[t.id] = { recognizedDays: rec, convertedDays: +conv.toFixed(2), count: list.length };
    }
    setTechStats(stats);
  };

  useEffect(() => { loadTechs(); loadPersonalData(); }, []);
  useEffect(() => { if (techs.length) loadAllStats(techs); }, [techs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return techs;
    return techs.filter((t) =>
      [t.name, t.specialty].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [techs, search]);

  const openNewTech = () => { setEditingTech(null); setTechForm({}); setTechDialogOpen(true); };
  const openEditTech = (t: Technician) => { setEditingTech(t); setTechForm(t); setTechDialogOpen(true); };

  const saveTech = async () => {
    if (!user) return;
    if (!techForm.name?.trim()) { toast.error("이름을 입력하세요"); return; }
    const payload = {
      name: techForm.name.trim(),
      birth_date: techForm.birth_date || null,
      specialty: techForm.specialty?.trim() || null,
      company: techForm.company?.trim() || null,
      position: techForm.position?.trim() || null,
      notes: techForm.notes?.trim() || null,
    };
    if (editingTech) {
      const { error } = await supabase.from("technicians").update(payload).eq("id", editingTech.id);
      if (error) { toast.error(error.message); return; }
      toast.success("수정되었습니다");
      if (selectedTech?.id === editingTech.id) setSelectedTech({ ...editingTech, ...payload });
    } else {
      const { data, error } = await supabase.from("technicians").insert({ ...payload, created_by: user.id }).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("등록되었습니다");
      if (data) setTechs((prev) => [...prev, data as Technician].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setTechDialogOpen(false);
    loadTechs();
  };

  const removeTech = async () => {
    if (!deleteTech) return;
    const { error } = await supabase.from("technicians").delete().eq("id", deleteTech.id);
    if (error) toast.error(error.message);
    else {
      toast.success("삭제되었습니다");
      if (selectedTech?.id === deleteTech.id) setSelectedTech(null);
      loadTechs();
    }
    setDeleteTech(null);
  };

  return (
    <AppLayout title="PQ 개인별 경력관리">
      {!selectedTech ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="이름·전문분야 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openNewTech}><Plus className="h-4 w-4 mr-1" />기술자 추가</Button>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">등록된 기술자가 없습니다</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((t) => {
                const prof = profilesByName[t.name];
                const careers = careersByName[t.name] || [];
                const primaryCert = prof?.certifications?.find((c) => c.is_primary) || prof?.certifications?.[0];
                const age = koreanAgeNow(prof?.birth_date);
                const isOpen = !!expandedHistory[t.id];
                const hasHistory = !!prof || careers.length > 0;
                return (
                <Card key={t.id} className="p-4 hover:bg-accent/30 cursor-pointer transition" onClick={() => setSelectedTech(t)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-base truncate">{t.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.specialty ? <Badge variant="secondary">{t.specialty}</Badge> : <Badge variant="outline">전문분야 미지정</Badge>}
                        {prof?.grade_kepa && <Badge variant="outline" className="text-[10px]">건기협 {prof.grade_kepa}</Badge>}
                        {prof?.grade_eval && <Badge variant="outline" className="text-[10px]">평가 {prof.grade_eval}</Badge>}
                      </div>
                      {(prof?.birth_date || primaryCert?.name) && (
                        <div className="mt-1.5 text-[11px] text-muted-foreground space-x-1.5">
                          {prof?.birth_date && <span>{fmtBirth(prof.birth_date)}{age && ` (만 ${age}세)`}</span>}
                          {primaryCert?.name && <span>· <Star className="inline h-3 w-3 -mt-0.5 text-amber-500" /> {primaryCert.name}</span>}
                        </div>
                      )}
                      {techStats[t.id] && (
                        <div className="mt-2 rounded bg-muted/50 px-2 py-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">인정 경력 (민간포함)</span>
                            <span className="font-semibold">{daysToYearMonth(techStats[t.id].convertedDays)}</span>
                          </div>
                          <div className="flex justify-between mt-0.5 text-[11px] text-muted-foreground">
                            <span>인정일 {techStats[t.id].recognizedDays.toLocaleString()}일</span>
                            <span>{techStats[t.id].count}건</span>
                          </div>
                        </div>
                      )}
                      {hasHistory && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setExpandedHistory((p) => ({ ...p, [t.id]: !p[t.id] }))}
                            className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            이력사항 {isOpen ? "숨기기" : "보기"}
                          </button>
                          {isOpen && (
                            <div className="mt-2 rounded-md border bg-card p-2 text-[11px] space-y-1.5">
                              {prof?.address && (
                                <div><span className="text-muted-foreground">주소:</span> {prof.address}</div>
                              )}
                              {prof?.educations?.length ? (
                                <div>
                                  <div className="text-muted-foreground">학력</div>
                                  <ul className="list-disc list-inside space-y-0.5">
                                    {prof.educations.map((e, i) => (
                                      <li key={i}>{[e.school, e.major, e.degree].filter(Boolean).join(" · ")}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {prof?.certifications?.length ? (
                                <div>
                                  <div className="text-muted-foreground">자격증</div>
                                  <ul className="space-y-0.5">
                                    {prof.certifications.map((c, i) => (
                                      <li key={i} className="flex items-start gap-1">
                                        {c.is_primary && <Star className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />}
                                        <span>
                                          {c.name}
                                          {c.number && <span className="text-muted-foreground"> ({c.number})</span>}
                                          {c.acquired_date && <span className="text-muted-foreground"> · {c.acquired_date}</span>}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {careers.length > 0 && (
                                <div>
                                  <div className="text-muted-foreground">근무처 ({careers.length}곳)</div>
                                  <ul className="space-y-0.5">
                                    {careers.map((c, i) => (
                                      <li key={i}>
                                        <span className="font-medium">{c.company}</span>
                                        {(c.department || c.position) && (
                                          <span className="text-muted-foreground"> · {[c.department, c.position].filter(Boolean).join(" / ")}</span>
                                        )}
                                        {(c.hire_date || c.resign_date) && (
                                          <div className="text-muted-foreground">
                                            {c.hire_date || "?"} ~ {c.resign_date || "재직중"}
                                          </div>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => openEditTech(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTech(t)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <TechnicianDetail
          tech={selectedTech}
          onBack={() => setSelectedTech(null)}
          onEdit={() => openEditTech(selectedTech)}
          onSpecialtyChanged={(s) => {
            setSelectedTech({ ...selectedTech, specialty: s });
            setTechs((prev) => prev.map((x) => (x.id === selectedTech.id ? { ...x, specialty: s } : x)));
          }}
        />
      )}

      <Dialog open={techDialogOpen} onOpenChange={setTechDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTech ? "기술자 수정" : "기술자 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>이름 *</Label><Input value={techForm.name || ""} onChange={(e) => setTechForm({ ...techForm, name: e.target.value })} /></div>
            <div><Label>전문분야</Label><Input value={techForm.specialty || ""} onChange={(e) => setTechForm({ ...techForm, specialty: e.target.value })} placeholder="예: 대기, 수질, 토목" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechDialogOpen(false)}>취소</Button>
            <Button onClick={saveTech}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTech} onOpenChange={(o) => !o && setDeleteTech(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기술자를 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTech?.name} 및 해당 기술자의 모든 경력 기록이 삭제됩니다. 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={removeTech}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────
// 기술자 상세
// ─────────────────────────────────────────────────────────
function TechnicianDetail({
  tech, onBack, onEdit, onSpecialtyChanged,
}: {
  tech: Technician;
  onBack: () => void;
  onEdit: () => void;
  onSpecialtyChanged: (s: string) => void;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<CareerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [specialtyEdit, setSpecialtyEdit] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState(tech.specialty || "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"recognition" | "overlap">("recognition");
  const [excludePrivate, setExcludePrivate] = useState(false);
  const [calcStandard, setCalcStandard] = useState<string>(tech.calc_standard || "건설기술인협회");

  // 수기 민간 지정 (DB의 career_entries.manual_private_override에 저장 → 모든 디바이스에서 공유)
  const setPrivateOverride = async (entryId: string, value: boolean | null) => {
    // optimistic update
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, manual_private_override: value } : e)));
    const { error } = await (supabase as any)
      .from("career_entries")
      .update({ manual_private_override: value })
      .eq("id", entryId);
    if (error) {
      toast.error(error.message);
      // rollback
      load();
    }
  };


  const saveCalcStandard = async (v: string) => {
    setCalcStandard(v);
    const { error } = await (supabase as any).from("technicians").update({ calc_standard: v }).eq("id", tech.id);
    if (error) toast.error(error.message);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("career_entries")
      .select("*")
      .eq("technician_id", tech.id)
      .order("period_start", { ascending: true });
    if (error) toast.error(error.message);
    else setEntries((data as CareerEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tech.id]);

  const saveSpecialty = async () => {
    const val = specialtyDraft.trim() || null;
    const { error } = await supabase.from("technicians").update({ specialty: val }).eq("id", tech.id);
    if (error) { toast.error(error.message); return; }
    toast.success("전문분야가 저장되었습니다");
    onSpecialtyChanged(val || "");
    setSpecialtyEdit(false);
  };

  // 엑셀 내보내기 — 활성 탭에 따라 다른 데이터 추출
  const exportEntries = () => {
    if (activeTab === "recognition") {
      const rows = entries.map((e) => {
        const r = computeRecognition(e, tech.specialty, excludePrivate);


        return {
          참여시작일: formatIso(e.period_start),
          참여종료일: e.period_end_text || "",
          인정일: r.recognizedDays,
          사업명: e.project_name || "",
          발주처: e.client || "",
          사업공종: e.service_field || "",
          전문분야: e.specialty || "",
          담당업무: e.duties || "",
          평가구분: r.evalGroup,
          가중치: r.weight,
          참여회사: e.participation_company || "",
          참여직위: e.participation_position || "",
          환산일수: r.convertedDays,
          민간: r.isPrivate ? "민간" : "",
        };
      });
      const totalRecog = rows.reduce((s, r) => s + Number(r.인정일 || 0), 0);
      const totalConv = rows.reduce((s, r) => s + Number(r.환산일수 || 0), 0);
      rows.push({
        참여시작일: "", 참여종료일: "", 인정일: totalRecog, 사업명: "합계", 발주처: "",
        사업공종: "", 전문분야: "", 담당업무: "", 평가구분: "", 가중치: 0 as any,
        참여회사: "", 참여직위: "", 환산일수: +totalConv.toFixed(2), 민간: "",
      } as any);
      rows.push({
        참여시작일: "", 참여종료일: "", 인정일: "" as any, 사업명: `환산 (년/월): ${daysToYearMonth(totalConv)}`,
        발주처: "", 사업공종: "", 전문분야: "", 담당업무: "", 평가구분: "", 가중치: "" as any,
        참여회사: "", 참여직위: "", 환산일수: "" as any, 민간: "",
      } as any);
      exportToExcel(rows, `경력_인정일계산_${tech.name}${excludePrivate ? "_민간제외" : ""}`);
      return;
    }
    // 중복일수 계산 (가중 구간 스케줄링)
    const recRows = entries.map((e) => computeRecognition(e, tech.specialty)).filter((r) => r.convertedDays > 0);
    const map = new Map<string, typeof recRows>();
    for (const r of recRows) {
      const key = (r.entry.specialty || "").trim() || "(미지정)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: any[] = [];
    let grandPart = 0, grandConv = 0;
    for (const [specialty, arr] of map) {
      const chosen = selectOptimal(arr);
      let sumPart = 0, sumConv = 0;
      for (const it of chosen) {
        const conv = +(it.participationDays * it.row.weight).toFixed(2);
        sumPart += it.participationDays;
        sumConv += conv;
        out.push({
          사업명: it.row.entry.project_name || "",
          발주처: it.row.entry.client || "",
          전문분야: it.row.entry.specialty || "",
          평가구분: it.row.evalGroup,
          참여회사: it.row.entry.participation_company || "",
          참여직위: it.row.entry.participation_position || "",
          담당업무: it.row.entry.duties || "",
          참여시작일: formatIso(it.row.entry.period_start),
          참여종료일: it.row.entry.period_end_text || "",
          "중복제외 시작일": formatIso(it.row.entry.period_start),
          "중복제외 종료일": it.row.entry.period_end_text || "",
          참여일수: it.participationDays,
          가중치: it.row.weight,
          환산일수: conv,
        });
      }
      out.push({
        사업명: `[${specialty}] 소계`, 발주처: "", 전문분야: "", 평가구분: "",
        참여회사: "", 참여직위: "", 담당업무: "",
        참여시작일: "", 참여종료일: "", "중복제외 시작일": "", "중복제외 종료일": "",
        참여일수: sumPart, 가중치: "" as any, 환산일수: +sumConv.toFixed(2),
      });
      grandPart += sumPart; grandConv += sumConv;
    }
    out.push({
      사업명: "합계", 발주처: "", 전문분야: "", 평가구분: "",
      참여회사: "", 참여직위: "", 담당업무: "",
      참여시작일: "", 참여종료일: "", "중복제외 시작일": "", "중복제외 종료일": "",
      참여일수: grandPart, 가중치: "" as any, 환산일수: +grandConv.toFixed(2),
    });
    out.push({
      사업명: `환산 (년/월): ${daysToYearMonth(grandConv)}`, 발주처: "", 전문분야: "", 평가구분: "",
      참여회사: "", 참여직위: "", 담당업무: "",
      참여시작일: "", 참여종료일: "", "중복제외 시작일": "", "중복제외 종료일": "",
      참여일수: "" as any, 가중치: "" as any, 환산일수: "" as any,
    });
    exportToExcel(out, `경력_중복일수계산_${tech.name}`);
  };

  // 엑셀 업로드 → 기존 데이터 대체
  // 두 가지 형식을 지원합니다:
  // ① 표준 양식 (1행=헤더, 컬럼명: 참여시작일, 참여종료일, 인정일 등)
  // ② 건기협 붙여넣기 형식 (3행=1건, A:참여회사, B행1=시작일/B행2=종료일,
  //    C:인정일, D:사업명, E:발주처, F:사업공종, I:전문분야, J:평가구분, K:참여직위)
  const parseGeonGiHyeop = (sheet: XLSX.WorkSheet) => {
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    const inserts: any[] = [];
    const cell = (row: any[] | undefined, idx: number) => {
      const v = row?.[idx];
      return v == null || v === "" ? null : v;
    };
    const str = (v: any) => (v == null ? null : String(v).trim() || null);
    const numFromDays = (v: any): number | null => {
      if (v == null || v === "") return null;
      const s = String(v).replace(/[일\s,]/g, "");
      const n = Number(s);
      return isNaN(n) ? null : n;
    };
    for (let r = 0; r < aoa.length; r += 3) {
      const r0 = aoa[r], r1 = aoa[r + 1];
      // 한 건이라도 사업명/시작일이 비어있으면 skip
      const projectName = str(cell(r0, 3)); // D
      const startRaw = cell(r0, 1);          // B(row1)
      if (!projectName && !startRaw) continue;

      const company = str(cell(r0, 0)) || str(cell(r1, 0)); // A
      const startIso = toIsoDate(startRaw);
      const endRaw = cell(r1, 1);                            // B(row2)
      const endStr = endRaw == null ? null
        : (endRaw instanceof Date ? formatIso(toIsoDate(endRaw)) : String(endRaw).trim().replace(/-/g, "."));

      inserts.push({
        created_by: user!.id,
        technician_id: tech.id,
        period_start: startIso,
        period_end_text: endStr,
        recognized_days: numFromDays(cell(r0, 2)), // C
        project_name: projectName,
        client: str(cell(r0, 4)),                  // E
        service_field: str(cell(r0, 5)),           // F
        specialty: str(cell(r0, 8)),               // I
        evaluation_category: str(cell(r0, 9)),     // J (가중치 분류용 — 환경/기타)
        duties: str(cell(r0, 9)),                  // J (담당업무)
        participation_company: company,
        participation_position: str(cell(r0, 10)) || str(cell(r1, 10)), // K
      });
    }
    return inserts;
  };

  // 평가협회(환경영향평가 경력관리시스템) 양식 파싱
  // 헤더: 사업명, 발주자, 참여기간 시작일, 참여기간 종료일, 참여일수, 평가종류, 전문분야, 사업종류
  const parseAssoc = async (sheet: XLSX.WorkSheet) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null, raw: false });
    // 동일 기술자의 이력 로드 (참여회사/직위 자동 매핑용)
    const { data: histRows } = await supabase
      .from("personal_careers")
      .select("company,position,hire_date,resign_date")
      .eq("technician_name", tech.name);
    const histories = (histRows || []) as Array<{ company: string; position: string | null; hire_date: string | null; resign_date: string | null }>;
    const findHistory = (startIso: string | null) => {
      if (!startIso) return histories[0] || null;
      const s = new Date(startIso).getTime();
      const match = histories.find((h) => {
        const h1 = h.hire_date ? new Date(h.hire_date).getTime() : -Infinity;
        const h2 = h.resign_date ? new Date(h.resign_date).getTime() : Infinity;
        return s >= h1 && s <= h2;
      });
      return match || null;
    };
    const get = (r: Record<string, any>, ...keys: string[]) => {
      for (const k of keys) {
        if (r[k] != null && r[k] !== "") return r[k];
        // 공백·대소문자 무시 매칭
        const found = Object.keys(r).find((x) => x.replace(/\s/g, "") === k.replace(/\s/g, ""));
        if (found && r[found] != null && r[found] !== "") return r[found];
      }
      return null;
    };
    const cleanSpecialty = (v: any) => {
      if (v == null || v === "") return null;
      return String(v).replace(/[·ㆍ・]/g, "").trim() || null;
    };
    const inserts: any[] = [];
    for (const r of rows) {
      const projectName = get(r, "사업명");
      const startRaw = get(r, "참여기간 시작일", "참여시작일", "시작일");
      if (!projectName && !startRaw) continue;
      const startIso = toIsoDate(startRaw);
      const endRaw = get(r, "참여기간 종료일", "참여종료일", "종료일");
      const endIso = endRaw instanceof Date ? toIsoDate(endRaw) : toIsoDate(endRaw);
      const endStr = endRaw == null ? null
        : (endIso ? formatIso(endIso) : String(endRaw).trim().replace(/-/g, "."));
      const days = get(r, "참여일수", "인정일");
      const hist = findHistory(startIso);
      inserts.push({
        created_by: user!.id,
        technician_id: tech.id,
        period_start: startIso,
        period_end_text: endStr,
        recognized_days: days != null && days !== "" ? Number(String(days).replace(/[일,\s]/g, "")) : null,
        project_name: projectName ? String(projectName).trim() : null,
        client: (() => { const v = get(r, "발주자", "발주처"); return v ? String(v).trim() : null; })(),
        service_field: (() => { const v = get(r, "사업종류", "사업공종"); return v ? String(v).trim() : null; })(),
        specialty: cleanSpecialty(get(r, "전문분야")),
        evaluation_category: (() => { const v = get(r, "평가종류", "평가구분"); return v ? String(v).trim() : null; })(),
        duties: (() => { const v = get(r, "평가종류", "담당업무"); return v ? String(v).trim() : null; })(),
        participation_company: hist?.company || null,
        participation_position: hist?.position || null,
      });
    }
    return inserts;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      // 시트 우선순위: "①붙여넣기" → 첫 시트
      const sheetName = wb.SheetNames.find((n) => n.includes("붙여넣기")) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      // 형식 감지
      const firstRow: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })[0] as any[] || [];
      const headerJoined = firstRow.filter((v) => typeof v === "string").join("|");
      const isAssoc = /발주자|참여기간|평가종류|사업종류/.test(headerJoined);
      const isStandard = !isAssoc && /참여시작일|사업명|인정일/.test(headerJoined);

      let inserts: any[] = [];
      let formatLabel = "";
      if (isAssoc) {
        inserts = await parseAssoc(sheet);
        formatLabel = "평가협회 양식";
        if (!inserts.length) { toast.error("인식된 경력이 없습니다"); return; }
      } else if (isStandard) {
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
        if (!rows.length) { toast.error("엑셀이 비어있습니다"); return; }
        formatLabel = "표준 양식";
        inserts = rows.map((r) => ({
          created_by: user.id,
          technician_id: tech.id,
          period_start: toIsoDate(r["참여시작일"]),
          period_end_text: r["참여종료일"] != null && r["참여종료일"] !== ""
            ? (r["참여종료일"] instanceof Date
                ? formatIso(toIsoDate(r["참여종료일"]))
                : String(r["참여종료일"]).trim().replace(/-/g, "."))
            : null,
          recognized_days: r["인정일"] != null && r["인정일"] !== "" ? Number(r["인정일"]) : null,
          project_name: r["사업명"] ? String(r["사업명"]) : null,
          client: r["발주처"] ? String(r["발주처"]) : null,
          service_field: r["사업공종"] ? String(r["사업공종"]) : null,
          specialty: r["전문분야"] ? String(r["전문분야"]).replace(/[·ㆍ・]/g, "") : null,
          duties: r["담당업무"] ? String(r["담당업무"]) : null,
          evaluation_category: r["평가구분"] ? String(r["평가구분"]) : null,
          participation_company: r["참여회사"] ? String(r["참여회사"]) : null,
          participation_position: r["참여직위"] ? String(r["참여직위"]) : null,
        }));
      } else {
        inserts = parseGeonGiHyeop(sheet);
        formatLabel = "건기협 붙여넣기";
        if (!inserts.length) { toast.error("인식된 경력이 없습니다"); return; }
      }
      // 건설기술인협회 기준이면서 평가협회 양식이 아닌 경우 인정일 소수점 반내림
      if (calcStandard === "건설기술인협회" && !isAssoc) {
        inserts = inserts.map((it) => ({
          ...it,
          recognized_days: it.recognized_days != null ? Math.floor(Number(it.recognized_days)) : it.recognized_days,
        }));
      }
      // 기존 데이터 삭제 후 일괄 insert
      const { error: delErr } = await supabase.from("career_entries").delete().eq("technician_id", tech.id);
      if (delErr) { toast.error(delErr.message); return; }
      const { error: insErr } = await supabase.from("career_entries").insert(inserts);
      if (insErr) { toast.error(insErr.message); return; }
      toast.success(`${inserts.length}건 업로드되었습니다 (${formatLabel})`);
      load();
    } catch (err: any) {
      toast.error("업로드 실패: " + (err?.message || err));
    }
  };

  const clearAll = async () => {
    if (!confirm(`${tech.name}의 모든 경력 기록을 삭제할까요?`)) return;
    const { error } = await supabase.from("career_entries").delete().eq("technician_id", tech.id);
    if (error) toast.error(error.message);
    else { toast.success("삭제되었습니다"); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />목록</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-bold">{tech.name}</div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Label className="text-sm">전문분야:</Label>
              {specialtyEdit ? (
                <>
                  <Input className="h-8 w-48" value={specialtyDraft} onChange={(e) => setSpecialtyDraft(e.target.value)} />
                  <Button size="sm" onClick={saveSpecialty}>저장</Button>
                  <Button size="sm" variant="outline" onClick={() => { setSpecialtyDraft(tech.specialty || ""); setSpecialtyEdit(false); }}>취소</Button>
                </>
              ) : (
                <>
                  {tech.specialty ? <Badge variant="secondary">{tech.specialty}</Badge> : <Badge variant="outline">미지정</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => { setSpecialtyDraft(tech.specialty || ""); setSpecialtyEdit(true); }}>
                    <Pencil className="h-3 w-3 mr-1" />편집
                  </Button>
                </>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4 mr-1" />기술자 정보 수정</Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" />엑셀 업로드</Button>
        <Button variant="outline" size="sm" onClick={exportEntries} disabled={!entries.length}><Download className="h-4 w-4 mr-1" />엑셀 내보내기</Button>
        <Button variant="ghost" size="sm" onClick={clearAll} disabled={!entries.length} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-1" />전체 삭제
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
      </div>

      <Card className="p-3 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox id="exclude-private" checked={excludePrivate} onCheckedChange={(v) => setExcludePrivate(!!v)} />
          <Label htmlFor="exclude-private" className="cursor-pointer">민간제외(민간 자동판독, 체크박스로 민간여부 반영가능)</Label>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm">계산 기준:</Label>
          <Select value={calcStandard} onValueChange={saveCalcStandard}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue placeholder="계산 기준 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="건설기술인협회">건설기술인협회</SelectItem>
              <SelectItem value="환경영향평가 경력관리시스템">환경영향평가 경력관리시스템</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "recognition" | "overlap")}>
        <TabsList>
          <TabsTrigger value="recognition">① 인정일 계산</TabsTrigger>
          <TabsTrigger value="overlap">② 중복일수 계산</TabsTrigger>
        </TabsList>
        <TabsContent value="recognition">
          {loading ? <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
            : <RecognitionView entries={entries} tech={tech} excludePrivate={excludePrivate} setPrivateOverride={setPrivateOverride} />}
        </TabsContent>
        <TabsContent value="overlap">
          {loading ? <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
            : <OverlapView entries={entries} tech={tech} excludePrivate={excludePrivate} />}
        </TabsContent>
      </Tabs>

      {/* 최상단/최하단 스크롤 버튼 */}
      <div className="fixed right-3 bottom-3 sm:right-6 sm:bottom-6 z-50 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="h-10 w-10 rounded-full shadow-lg border"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="최상단으로"
        >
          <ChevronUp className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-10 w-10 rounded-full shadow-lg border"
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
          aria-label="최하단으로"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ① 인정일 계산
// ─────────────────────────────────────────────────────────
function MobileRecognitionList({
  rows, tech, excludePrivate, setPrivateOverride,
}: {
  rows: ReturnType<typeof computeRecognition>[];
  tech: Technician;
  excludePrivate: boolean;
  setPrivateOverride: (id: string, v: boolean | null) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);

  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    if (next) {
      const map: Record<string, boolean> = {};
      rows.forEach((r) => { map[r.entry.id] = true; });
      setExpanded(map);
    } else {
      setExpanded({});
    }
  };

  return (
    <div className="md:hidden space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={toggleAll}>
          {allOpen ? "전체 접기" : "전체 펼치기"}
        </Button>
      </div>
      {rows.map((r, i) => {
        const specialtyMismatch = !!r.entry.specialty && !!tech.specialty && r.entry.specialty.trim() !== tech.specialty.trim();
        const working = isWorkingNow(r.entry.period_end_text);
        const flagged = excludePrivate && (specialtyMismatch || r.isPrivate || working);
        const override = r.entry.manual_private_override;
        const isManual = override === true || override === false;
        const isOpen = !!expanded[r.entry.id];
        return (
          <Card key={r.entry.id || i} className={`p-3 ${flagged ? "border-destructive/50 bg-destructive/5" : ""}`}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setExpanded((p) => ({ ...p, [r.entry.id]: !p[r.entry.id] }))}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm break-words">{r.entry.project_name || "(사업명 없음)"}</div>
                  <div className="mt-1 text-xs text-muted-foreground break-words">
                    발주처: <span className="text-foreground">{r.entry.client || "-"}</span>
                    {excludePrivate && r.isPrivate && <Badge variant="destructive" className="ml-1 text-[10px]">민간{isManual && "(수기)"}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span>인정일 <b>{r.recognizedDays}</b>일</span>
                    <span>환산 <b>{r.convertedDays}</b>일</span>
                    <Badge variant={r.evalGroup === "환경" ? "default" : "secondary"} className="text-[10px]">{r.evalGroup}</Badge>
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" />}
              </div>
            </button>
            {isOpen && (
              <div className="mt-3 pt-3 border-t space-y-1.5 text-xs">
                <DetailRow label="참여기간">{formatIso(r.entry.period_start)} ~ {r.entry.period_end_text || ""}</DetailRow>
                <DetailRow label="사업공종">{r.entry.service_field || "-"}</DetailRow>
                <DetailRow label="전문분야">
                  {r.entry.specialty || "-"}
                  {excludePrivate && specialtyMismatch && <Badge variant="destructive" className="ml-1 text-[10px]">불일치</Badge>}
                </DetailRow>
                <DetailRow label="담당업무">{r.entry.duties || "-"}{r.envByProject && <span className="ml-1 text-[10px] text-accent">(사업명 환경)</span>}</DetailRow>
                <DetailRow label="가중치">{r.weight.toFixed(1)}</DetailRow>
                <DetailRow label="참여회사">{r.entry.participation_company || "-"}</DetailRow>
                <DetailRow label="참여직위">{r.entry.participation_position || "-"}</DetailRow>
                {excludePrivate && (
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      id={`m-priv-${r.entry.id}`}
                      checked={r.isPrivate}
                      onCheckedChange={(v) => setPrivateOverride(r.entry.id, !!v)}
                      onClick={(e) => {
                        if ((e as any).shiftKey) {
                          e.preventDefault();
                          setPrivateOverride(r.entry.id, null);
                        }
                      }}
                    />
                    <Label htmlFor={`m-priv-${r.entry.id}`} className="text-xs cursor-pointer">
                      민간 {isManual && <span className="text-muted-foreground">(수기)</span>}
                    </Label>
                  </div>
                )}
                {flagged && (
                  <div className="pt-2 flex flex-wrap gap-1 text-[10px] font-semibold">
                    {specialtyMismatch && <span className="text-destructive">⚠ 전문분야 불일치</span>}
                    {r.isPrivate && <span className="text-destructive">⚠ 민간사업</span>}
                    {working && <span className="text-destructive">⚠ 근무중</span>}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-20">{label}</span>
      <span className="flex-1 break-words">{children}</span>
    </div>
  );
}

function RecognitionView({ entries, tech, excludePrivate, setPrivateOverride }: { entries: CareerEntry[]; tech: Technician; excludePrivate: boolean; setPrivateOverride: (entryId: string, value: boolean | null) => void }) {
  const rows = useMemo(() => entries.map((e) => computeRecognition(e, tech.specialty, excludePrivate)), [entries, tech.specialty, excludePrivate]);
  const totalRecog = rows.reduce((s, r) => s + r.recognizedDays, 0);
  const totalConv = rows.reduce((s, r) => s + r.convertedDays, 0);

  if (!entries.length) {
    return <div className="text-center py-8 text-muted-foreground">엑셀을 업로드하면 경력이 표시됩니다</div>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground">총 인정일</div><div className="font-bold text-lg">{totalRecog.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">총 환산일수</div><div className="font-bold text-lg">{totalConv.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">환산 (년/월)</div><div className="font-bold text-lg">{daysToYearMonth(totalConv)}</div></div>
        <div><div className="text-muted-foreground">행 수</div><div className="font-bold text-lg">{rows.length}건</div></div>
      </Card>
      {!tech.specialty && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          ⚠️ 기술자의 전문분야가 지정되지 않아 모든 인정일이 0으로 처리됩니다. 위에서 전문분야를 입력해 주세요.
        </div>
      )}
      {/* 모바일: 카드 리스트 (사업명/발주처/인정일 + 펼치기/숨김) */}
      <MobileRecognitionList
        rows={rows}
        tech={tech}
        excludePrivate={excludePrivate}
        setPrivateOverride={setPrivateOverride}
      />

      {/* 데스크탑: 전체 테이블 */}
      <div className="overflow-auto hidden md:block">
        <Table className="min-w-[1100px] text-xs">
          <TableHeader>
            <TableRow>
              {excludePrivate && <TableHead className="text-center w-[80px]">민간</TableHead>}
              <TableHead>참여시작</TableHead>
              <TableHead>참여종료</TableHead>
              <TableHead className="text-right">인정일</TableHead>
              <TableHead>사업명</TableHead>
              <TableHead>발주처</TableHead>
              <TableHead>사업공종</TableHead>
              <TableHead>전문분야</TableHead>
              <TableHead>담당업무</TableHead>
              <TableHead>평가구분</TableHead>
              <TableHead className="text-right">가중치</TableHead>
              <TableHead>참여회사</TableHead>
              <TableHead>참여직위</TableHead>
              <TableHead className="text-right">환산일수</TableHead>
              <TableHead>민간</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const specialtyMismatch = !!r.entry.specialty && !!tech.specialty && r.entry.specialty.trim() !== tech.specialty.trim();
              const working = isWorkingNow(r.entry.period_end_text);
              const flagged = excludePrivate && (specialtyMismatch || r.isPrivate || working);
              const override = r.entry.manual_private_override;
              const isManual = override === true || override === false;
              return (
              <TableRow key={r.entry.id || i} className={flagged ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : ""}>
                {excludePrivate && (
                <TableCell className="text-center">
                  <Checkbox
                    checked={r.isPrivate}
                    onCheckedChange={(v) => setPrivateOverride(r.entry.id, !!v)}
                    title={isManual ? "수기 지정됨 (Shift+클릭으로 자동판정 복원)" : "자동 판정"}
                    onClick={(e) => {
                      if ((e as any).shiftKey) {
                        e.preventDefault();
                        setPrivateOverride(r.entry.id, null);
                      }
                    }}
                  />
                </TableCell>
                )}
                <TableCell>{formatIso(r.entry.period_start)}</TableCell>
                <TableCell>{r.entry.period_end_text || ""}</TableCell>
                <TableCell className="text-right">{r.recognizedDays}</TableCell>
                <TableCell className="max-w-[280px] whitespace-normal break-words align-top">
                  <div>{r.entry.project_name}</div>
                  {flagged && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                      {specialtyMismatch && <span className="text-destructive">⚠ 전문분야 불일치</span>}
                      {r.isPrivate && <span className="text-destructive">⚠ 민간사업</span>}
                      {working && <span className="text-destructive">⚠ 근무중</span>}
                    </div>
                  )}
                </TableCell>
                <TableCell>{r.entry.client}{excludePrivate && r.isPrivate && <Badge variant="destructive" className="ml-1 text-[10px]">민간</Badge>}</TableCell>
                <TableCell>{r.entry.service_field}</TableCell>
                <TableCell>
                  {r.entry.specialty}
                  {excludePrivate && specialtyMismatch && <Badge variant="destructive" className="ml-1 text-[10px]">불일치</Badge>}
                </TableCell>
                <TableCell className={r.envByProject ? "text-accent font-semibold" : ""} title={r.envByProject ? "사업명 기준으로 환경 평가로 인정 (가중치 1.0)" : undefined}>{r.entry.duties}{r.envByProject && <span className="ml-1 text-[10px]">(사업명 환경)</span>}</TableCell>
                <TableCell><Badge variant={r.evalGroup === "환경" ? "default" : "secondary"}>{r.evalGroup}{r.envByProject && "*"}</Badge></TableCell>
                <TableCell className="text-right">{r.weight.toFixed(1)}</TableCell>
                <TableCell>{r.entry.participation_company}</TableCell>
                <TableCell>{r.entry.participation_position}</TableCell>
                <TableCell className="text-right font-medium">
                  <div>{r.convertedDays}</div>
                  {r.convertedDays === 0 && (() => {
                    const reasons: string[] = [];
                    if (specialtyMismatch) reasons.push("전문분야 다름");
                    if (working) reasons.push("근무중");
                    if (excludePrivate && r.isPrivate) reasons.push("민간 제외");
                    if (!Number(r.entry.recognized_days || 0) && !working && !specialtyMismatch) reasons.push("인정일 0");
                    if (reasons.length === 0) reasons.push("계산 제외");
                    return (
                      <div className="mt-1 text-[10px] font-normal text-destructive whitespace-normal">
                        {reasons.map((t, idx) => <div key={idx}>⚠ {t}</div>)}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>{excludePrivate && r.isPrivate && <Badge variant="destructive" className="text-[10px]">민간{isManual && "(수기)"}</Badge>}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────
// ② 중복일수 계산 (가중 구간 스케줄링)
// ─────────────────────────────────────────────────────────
function OverlapView({ entries, tech, excludePrivate }: { entries: CareerEntry[]; tech: Technician; excludePrivate: boolean }) {
  const groups = useMemo(() => {
    const rows = entries.map((e) => computeRecognition(e, tech.specialty, excludePrivate)).filter((r) => r.convertedDays > 0);
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = (r.entry.specialty || "").trim() || "(미지정)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const result: { specialty: string; chosen: ReturnType<typeof selectOptimal> }[] = [];
    for (const [specialty, arr] of map) {
      result.push({ specialty, chosen: selectOptimal(arr) });
    }
    return result;
  }, [entries, tech.specialty, excludePrivate]);

  const grandConv = +groups.reduce((s, g) => s + g.chosen.reduce((a, b) => a + b.participationDays * b.row.weight, 0), 0).toFixed(2);
  const grandPart = groups.reduce((s, g) => s + g.chosen.reduce((a, b) => a + b.participationDays, 0), 0);
  const grandCount = groups.reduce((s, g) => s + g.chosen.length, 0);

  if (!entries.length) {
    return <div className="text-center py-8 text-muted-foreground">엑셀을 업로드하면 결과가 표시됩니다</div>;
  }
  if (!grandCount) {
    return <div className="text-center py-8 text-muted-foreground">계산 가능한 경력이 없습니다 (전문분야 불일치 또는 "근무중" 항목)</div>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground">선택된 건수</div><div className="font-bold text-lg">{grandCount}건</div></div>
        <div><div className="text-muted-foreground">총 참여일수</div><div className="font-bold text-lg">{grandPart.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">총 환산일수</div><div className="font-bold text-lg">{grandConv.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">환산 (년/월)</div><div className="font-bold text-lg">{daysToYearMonth(grandConv)}</div></div>
      </Card>
      <div className="text-xs text-muted-foreground">
        같은 전문분야 안에서 기간이 겹치지 않는 조합 중 환산일수 합이 최대가 되도록 선택된 항목만 표시합니다.
      </div>
      {groups.map((g) => {
        if (!g.chosen.length) return null;
        const itemsConv = g.chosen.map((it) => ({ it, conv: +(it.participationDays * it.row.weight).toFixed(2) }));
        const sumConv = +itemsConv.reduce((a, b) => a + b.conv, 0).toFixed(2);
        const sumPart = g.chosen.reduce((a, b) => a + b.participationDays, 0);
        return (
          <Card key={g.specialty} className="p-3">
            <div className="font-semibold mb-2">전문분야: {g.specialty}</div>
            <div className="overflow-auto">
              <Table className="min-w-[1100px] text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>사업명</TableHead>
                    <TableHead>발주처</TableHead>
                    <TableHead>전문분야</TableHead>
                    <TableHead>담당업무</TableHead>
                    <TableHead>평가구분</TableHead>
                    <TableHead>참여시작일</TableHead>
                    <TableHead>참여종료일</TableHead>
                    <TableHead>중복제외 시작일</TableHead>
                    <TableHead>중복제외 종료일</TableHead>
                    <TableHead className="text-right">참여일수</TableHead>
                    <TableHead className="text-right">가중치</TableHead>
                    <TableHead className="text-right">환산일수</TableHead>
                    <TableHead>참여회사</TableHead>
                    <TableHead>참여직위</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsConv.map(({ it, conv }, i) => (
                    <TableRow key={it.row.entry.id || i}>
                      <TableCell className="max-w-[280px] whitespace-normal break-words align-top">{it.row.entry.project_name}</TableCell>
                      <TableCell>{it.row.entry.client}</TableCell>
                      <TableCell>{it.row.entry.specialty}</TableCell>
                      <TableCell className={it.row.envByProject ? "text-accent font-semibold" : ""} title={it.row.envByProject ? "사업명 기준으로 환경 평가로 인정 (가중치 1.0)" : undefined}>{it.row.entry.duties}{it.row.envByProject && <span className="ml-1 text-[10px]">(사업명 환경)</span>}</TableCell>
                      <TableCell><Badge variant={it.row.evalGroup === "환경" ? "default" : "secondary"}>{it.row.evalGroup}{it.row.envByProject && "*"}</Badge></TableCell>
                      <TableCell>{formatIso(it.row.entry.period_start)}</TableCell>
                      <TableCell>{it.row.entry.period_end_text}</TableCell>
                      <TableCell>{formatIso(it.row.entry.period_start)}</TableCell>
                      <TableCell>{it.row.entry.period_end_text}</TableCell>
                      <TableCell className="text-right">{it.participationDays}</TableCell>
                      <TableCell className="text-right">{it.row.weight.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium">{conv}</TableCell>
                      <TableCell>{it.row.entry.participation_company}</TableCell>
                      <TableCell>{it.row.entry.participation_position}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm justify-end">
              <span className="text-muted-foreground">소계 — 참여일수 <b className="text-foreground">{sumPart.toLocaleString()}</b>일 / 환산일수 <b className="text-foreground">{sumConv.toLocaleString()}</b>일 ({daysToYearMonth(sumConv)})</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
