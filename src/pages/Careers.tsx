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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Download, ArrowLeft, Search } from "lucide-react";
import { exportToExcel, importFromExcel } from "@/lib/excel";
import * as XLSX from "xlsx";
import {
  CareerEntry, classifyEval, computeRecognition, daysToYearMonth,
  dateDiffDaysInclusive, evalWeight, selectOptimal,
} from "@/lib/career-calc";

type Technician = {
  id: string;
  name: string;
  birth_date: string | null;
  specialty: string | null;
  company: string | null;
  position: string | null;
  notes: string | null;
};

const EXCEL_HEADERS = [
  "참여시작일", "참여종료일", "인정일", "사업명", "발주처",
  "사업공종", "전문분야", "담당업무", "평가구분", "참여회사", "참여직위",
];

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

  const loadTechs = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("technicians").select("*").order("name");
    if (error) toast.error(error.message);
    else setTechs((data as Technician[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadTechs(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return techs;
    return techs.filter((t) =>
      [t.name, t.specialty, t.company].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
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
              <Input className="pl-8" placeholder="이름·전문분야·회사 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openNewTech}><Plus className="h-4 w-4 mr-1" />기술자 추가</Button>
          </div>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">등록된 기술자가 없습니다</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((t) => (
                <Card key={t.id} className="p-4 hover:bg-accent/30 cursor-pointer transition" onClick={() => setSelectedTech(t)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-base truncate">{t.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.specialty ? <Badge variant="secondary">{t.specialty}</Badge> : <Badge variant="outline">전문분야 미지정</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 truncate">
                        {[t.company, t.position].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => openEditTech(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTech(t)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
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
            <div className="grid grid-cols-2 gap-2">
              <div><Label>생년월일</Label><Input type="date" value={techForm.birth_date || ""} onChange={(e) => setTechForm({ ...techForm, birth_date: e.target.value })} /></div>
              <div><Label>회사</Label><Input value={techForm.company || ""} onChange={(e) => setTechForm({ ...techForm, company: e.target.value })} /></div>
            </div>
            <div><Label>직위</Label><Input value={techForm.position || ""} onChange={(e) => setTechForm({ ...techForm, position: e.target.value })} /></div>
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

  // 엑셀 양식 다운로드
  const downloadTemplate = () => {
    const sample = [Object.fromEntries(EXCEL_HEADERS.map((h) => [h, ""]))];
    exportToExcel(sample, `경력_업로드양식_${tech.name}`);
  };

  // 엑셀 내보내기 (현재 데이터)
  const exportEntries = () => {
    const rows = entries.map((e) => ({
      참여시작일: formatIso(e.period_start),
      참여종료일: e.period_end_text || "",
      인정일: e.recognized_days ?? "",
      사업명: e.project_name || "",
      발주처: e.client || "",
      사업공종: e.service_field || "",
      전문분야: e.specialty || "",
      담당업무: e.duties || "",
      평가구분: e.evaluation_category || "",
      참여회사: e.participation_company || "",
      참여직위: e.participation_position || "",
    }));
    exportToExcel(rows, `경력_${tech.name}`);
  };

  // 엑셀 업로드 → 기존 데이터 대체
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    try {
      const rows = await importFromExcel<Record<string, any>>(f);
      if (!rows.length) { toast.error("엑셀이 비어있습니다"); return; }
      const inserts = rows.map((r) => ({
        created_by: user.id,
        technician_id: tech.id,
        period_start: toIsoDate(r["참여시작일"]),
        period_end_text: r["참여종료일"] != null && r["참여종료일"] !== ""
          ? (r["참여종료일"] instanceof Date
              ? formatIso(toIsoDate(r["참여종료일"]))
              : String(r["참여종료일"]))
          : null,
        recognized_days: r["인정일"] != null && r["인정일"] !== "" ? Number(r["인정일"]) : null,
        project_name: r["사업명"] ? String(r["사업명"]) : null,
        client: r["발주처"] ? String(r["발주처"]) : null,
        service_field: r["사업공종"] ? String(r["사업공종"]) : null,
        specialty: r["전문분야"] ? String(r["전문분야"]) : null,
        duties: r["담당업무"] ? String(r["담당업무"]) : null,
        evaluation_category: r["평가구분"] ? String(r["평가구분"]) : null,
        participation_company: r["참여회사"] ? String(r["참여회사"]) : null,
        participation_position: r["참여직위"] ? String(r["참여직위"]) : null,
      }));
      // 기존 데이터 삭제 후 일괄 insert
      const { error: delErr } = await supabase.from("career_entries").delete().eq("technician_id", tech.id);
      if (delErr) { toast.error(delErr.message); return; }
      const { error: insErr } = await supabase.from("career_entries").insert(inserts);
      if (insErr) { toast.error(insErr.message); return; }
      toast.success(`${inserts.length}건 업로드되었습니다`);
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
            <div className="text-sm text-muted-foreground mt-1">
              {[tech.company, tech.position, tech.birth_date].filter(Boolean).join(" · ") || "—"}
            </div>
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
        <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" />엑셀 양식</Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" />엑셀 업로드</Button>
        <Button variant="outline" size="sm" onClick={exportEntries} disabled={!entries.length}><Download className="h-4 w-4 mr-1" />엑셀 내보내기</Button>
        <Button variant="ghost" size="sm" onClick={clearAll} disabled={!entries.length} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-1" />전체 삭제
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
      </div>

      <Tabs defaultValue="recognition">
        <TabsList>
          <TabsTrigger value="recognition">① 인정일 계산</TabsTrigger>
          <TabsTrigger value="overlap">② 중복일수 계산</TabsTrigger>
        </TabsList>
        <TabsContent value="recognition">
          {loading ? <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
            : <RecognitionView entries={entries} tech={tech} />}
        </TabsContent>
        <TabsContent value="overlap">
          {loading ? <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
            : <OverlapView entries={entries} tech={tech} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ① 인정일 계산
// ─────────────────────────────────────────────────────────
function RecognitionView({ entries, tech }: { entries: CareerEntry[]; tech: Technician }) {
  const rows = useMemo(() => entries.map((e) => computeRecognition(e, tech.specialty)), [entries, tech.specialty]);
  const totalRecog = rows.reduce((s, r) => s + r.recognizedDays, 0);
  const totalConv = rows.reduce((s, r) => s + r.convertedDays, 0);

  if (!entries.length) {
    return <div className="text-center py-8 text-muted-foreground">엑셀을 업로드하면 경력이 표시됩니다</div>;
  }

  return (
    <div className="space-y-3">
      {!tech.specialty && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          ⚠️ 기술자의 전문분야가 지정되지 않아 모든 인정일이 0으로 처리됩니다. 위에서 전문분야를 입력해 주세요.
        </div>
      )}
      <div className="overflow-auto">
        <Table className="min-w-[1100px] text-xs">
          <TableHeader>
            <TableRow>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.entry.id || i} className={r.recognizedDays === 0 ? "opacity-60" : ""}>
                <TableCell>{formatIso(r.entry.period_start)}</TableCell>
                <TableCell>{r.entry.period_end_text || ""}</TableCell>
                <TableCell className="text-right">{r.recognizedDays}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.entry.project_name}</TableCell>
                <TableCell>{r.entry.client}</TableCell>
                <TableCell>{r.entry.service_field}</TableCell>
                <TableCell>
                  {r.entry.specialty}
                  {r.entry.specialty && tech.specialty && r.entry.specialty.trim() !== tech.specialty.trim() &&
                    <Badge variant="outline" className="ml-1 text-[10px]">불일치</Badge>}
                </TableCell>
                <TableCell>{r.entry.duties}</TableCell>
                <TableCell><Badge variant={r.evalGroup === "환경" ? "default" : "secondary"}>{r.evalGroup}</Badge></TableCell>
                <TableCell className="text-right">{r.weight.toFixed(1)}</TableCell>
                <TableCell>{r.entry.participation_company}</TableCell>
                <TableCell>{r.entry.participation_position}</TableCell>
                <TableCell className="text-right font-medium">{r.convertedDays}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground">총 인정일</div><div className="font-bold text-lg">{totalRecog.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">총 환산일수</div><div className="font-bold text-lg">{totalConv.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">환산 (년/월)</div><div className="font-bold text-lg">{daysToYearMonth(totalConv)}</div></div>
        <div><div className="text-muted-foreground">행 수</div><div className="font-bold text-lg">{rows.length}건</div></div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ② 중복일수 계산 (가중 구간 스케줄링)
// ─────────────────────────────────────────────────────────
function OverlapView({ entries, tech }: { entries: CareerEntry[]; tech: Technician }) {
  const groups = useMemo(() => {
    const rows = entries.map((e) => computeRecognition(e, tech.specialty)).filter((r) => r.convertedDays > 0);
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
  }, [entries, tech.specialty]);

  const grandConv = groups.reduce((s, g) => s + g.chosen.reduce((a, b) => a + b.row.convertedDays, 0), 0);
  const grandPart = groups.reduce((s, g) => s + g.chosen.reduce((a, b) => a + b.participationDays, 0), 0);

  if (!entries.length) {
    return <div className="text-center py-8 text-muted-foreground">엑셀을 업로드하면 결과가 표시됩니다</div>;
  }
  if (groups.every((g) => g.chosen.length === 0)) {
    return <div className="text-center py-8 text-muted-foreground">계산 가능한 경력이 없습니다 (전문분야 불일치 또는 "근무중" 항목)</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        같은 전문분야 안에서 기간이 겹치지 않는 조합 중 환산일수 합이 최대가 되도록 선택된 항목만 표시합니다.
      </div>
      {groups.map((g) => {
        if (!g.chosen.length) return null;
        const sumConv = g.chosen.reduce((a, b) => a + b.row.convertedDays, 0);
        const sumPart = g.chosen.reduce((a, b) => a + b.participationDays, 0);
        return (
          <Card key={g.specialty} className="p-3">
            <div className="font-semibold mb-2">전문분야: {g.specialty}</div>
            <div className="overflow-auto">
              <Table className="min-w-[900px] text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>사업명</TableHead>
                    <TableHead>발주처</TableHead>
                    <TableHead>전문분야</TableHead>
                    <TableHead>평가구분</TableHead>
                    <TableHead>참여시작일</TableHead>
                    <TableHead>참여종료일</TableHead>
                    <TableHead>중복제외 시작일</TableHead>
                    <TableHead>중복제외 종료일</TableHead>
                    <TableHead className="text-right">참여일수</TableHead>
                    <TableHead className="text-right">환산일수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.chosen.map((it, i) => (
                    <TableRow key={it.row.entry.id || i}>
                      <TableCell className="max-w-[200px] truncate">{it.row.entry.project_name}</TableCell>
                      <TableCell>{it.row.entry.client}</TableCell>
                      <TableCell>{it.row.entry.specialty}</TableCell>
                      <TableCell><Badge variant={it.row.evalGroup === "환경" ? "default" : "secondary"}>{it.row.evalGroup}</Badge></TableCell>
                      <TableCell>{formatIso(it.row.entry.period_start)}</TableCell>
                      <TableCell>{it.row.entry.period_end_text}</TableCell>
                      <TableCell>{formatIso(it.row.entry.period_start)}</TableCell>
                      <TableCell>{it.row.entry.period_end_text}</TableCell>
                      <TableCell className="text-right">{it.participationDays}</TableCell>
                      <TableCell className="text-right font-medium">{it.row.convertedDays}</TableCell>
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
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground">선택된 건수</div><div className="font-bold text-lg">{groups.reduce((s, g) => s + g.chosen.length, 0)}건</div></div>
        <div><div className="text-muted-foreground">총 참여일수</div><div className="font-bold text-lg">{grandPart.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">총 환산일수</div><div className="font-bold text-lg">{grandConv.toLocaleString()}일</div></div>
        <div><div className="text-muted-foreground">환산 (년/월)</div><div className="font-bold text-lg">{daysToYearMonth(grandConv)}</div></div>
      </Card>
    </div>
  );
}
