import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Pencil, ArrowLeft, Loader2, X } from "lucide-react";

// ---------- 기본 배점 기준표 (환경관련용역 사업수행능력평가) ----------
type CriteriaItem = { code: string; label: string; max: number; note?: string };
type CriteriaSection = { code: string; label: string; max: number; items: CriteriaItem[] };
const DEFAULT_CRITERIA: CriteriaSection[] = [
  {
    code: "1", label: "참여평가자 능력평가", max: 70, items: [
      { code: "1-1-가", label: "총괄평가자 - 등급", max: 3 },
      { code: "1-1-나", label: "총괄평가자 - 경력", max: 4, note: "(5)" },
      { code: "1-1-다", label: "총괄평가자 - 실적", max: 4, note: "(5)" },
      { code: "1-1-라", label: "총괄평가자 - 기술능력", max: 1 },
      { code: "1-1-마", label: "총괄평가자 - 업무관리능력", max: 1 },
      { code: "1-2-가", label: "분야별책임평가자 - 등급", max: 6 },
      { code: "1-2-나", label: "분야별책임평가자 - 경력", max: 7 },
      { code: "1-2-다", label: "분야별책임평가자 - 실적", max: 7 },
      { code: "1-3-가", label: "분야별참여평가자 - 등급", max: 5 },
      { code: "1-3-나", label: "분야별참여평가자 - 경력", max: 6 },
      { code: "1-3-다", label: "분야별참여평가자 - 실적", max: 6 },
      { code: "1-4-가", label: "업무여유도 - 총괄평가자", max: 4 },
      { code: "1-4-나", label: "업무여유도 - 분야별 책임평가자", max: 7 },
      { code: "1-4-다", label: "업무여유도 - 분야별 참여평가자", max: 6 },
      { code: "1-5", label: "교육훈련", max: 2 },
      { code: "1-6", label: "과업의 이해도(前次)", max: 1 },
    ],
  },
  {
    code: "2", label: "환경평가업체 능력평가", max: 30, items: [
      { code: "2-1-가", label: "환경영향평가등 수행건수", max: 7 },
      { code: "2-1-나", label: "환경영향평가등 수행금액", max: 7 },
      { code: "2-2-가", label: "신용도 - 부실평가자 및 부실업체 등", max: 6 },
      { code: "2-2-나", label: "신용도 - 재정상태 건실도", max: 3 },
      { code: "2-3-가", label: "기술개발 - 개발실적", max: 2 },
      { code: "2-3-나", label: "기술개발 - 투자실적", max: 2 },
      { code: "2-3-다", label: "기술개발 - 활용실적", max: 2 },
      { code: "2-4", label: "공동도급", max: 1 },
      { code: "2-5", label: "하도급준수 (감점)", max: 0, note: "감점" },
      { code: "2-6", label: "청년고용 (가점)", max: 0, note: "가점" },
      { code: "2-7", label: "평가사 고용가점", max: 0, note: "가점" },
    ],
  },
];

type Company = { name: string; share_rate: number | null };
type Person = { role: "총괄" | "책임" | "참여"; name: string; specialty?: string };
type ProjectOptions = {
  task_understanding_max?: number;       // 과업의 이해도 배점한도
  joint_contract_type?: string;          // 공동도급 선택
  company_capability_max?: number;       // 업체능력평가 배점한도
  company_capability_relative?: boolean; // 상대평가
  similar_eval_filter?: string[];        // 평가종류 필터
  similar_service_filter?: string[];     // 사업종류 필터
};
type ProjectRow = {
  id: string;
  project_name: string;
  client: string | null;
  announcement_date: string | null;
  companies: Company[];
  personnel: { chief: Person | null; leads: Person[]; members: Person[] };
  options: ProjectOptions;
  notes: string | null;
  created_at?: string;
};

const blankPerson = (role: Person["role"]): Person => ({ role, name: "", specialty: "" });
const blankProject = (): Omit<ProjectRow, "id"> => ({
  project_name: "",
  client: "",
  announcement_date: null,
  companies: [{ name: "", share_rate: 100 }],
  personnel: { chief: blankPerson("총괄"), leads: [blankPerson("책임"), blankPerson("책임")], members: [blankPerson("참여"), blankPerson("참여")] },
  options: { task_understanding_max: 1, company_capability_max: 30, company_capability_relative: false, similar_eval_filter: [], similar_service_filter: [] },
  notes: "",
});

// ============================================================
export default function PqCalculator() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  if (projectId) return <ProjectDetail projectId={projectId} onBack={() => navigate("/pq-calculator")} />;
  return <ProjectList onOpen={(id) => navigate(`/pq-calculator/${id}`)} />;
}

// ============================================================
function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newDate, setNewDate] = useState("");
  const [delId, setDelId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("pq_calc_projects").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setRows((data || []) as ProjectRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!user || !newName.trim()) { toast.error("사업명을 입력하세요"); return; }
    const init = blankProject();
    const { data, error } = await (supabase as any).from("pq_calc_projects").insert({
      ...init,
      project_name: newName.trim(),
      client: newClient.trim() || null,
      announcement_date: newDate || null,
      created_by: user.id,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("사업 추가 완료");
    setNewOpen(false); setNewName(""); setNewClient(""); setNewDate("");
    onOpen(data.id);
  };

  const duplicate = async (r: ProjectRow) => {
    if (!user) return;
    const { id, created_at, ...rest } = r as any;
    const { data, error } = await (supabase as any).from("pq_calc_projects").insert({
      ...rest,
      project_name: `${r.project_name} (복제)`,
      created_by: user.id,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("복제 완료");
    setRows((p) => [data as ProjectRow, ...p]);
  };

  const remove = async () => {
    if (!delId) return;
    const { error } = await (supabase as any).from("pq_calc_projects").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("삭제 완료"); load(); }
    setDelId(null);
  };

  return (
    <AppLayout title="PQ 배점계산기">
      <div className="space-y-4">
        <Card className="p-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">PQ에 참가하는 사업별로 점수를 관리합니다.</div>
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" />사업 추가</Button>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사업명</TableHead>
                <TableHead>발주처</TableHead>
                <TableHead>공고일</TableHead>
                <TableHead>참여회사</TableHead>
                <TableHead className="w-40 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="inline h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">사업을 추가하세요</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(r.id)}>
                  <TableCell className="font-medium">{r.project_name}</TableCell>
                  <TableCell>{r.client || "-"}</TableCell>
                  <TableCell>{r.announcement_date || "-"}</TableCell>
                  <TableCell className="text-xs">{(r.companies || []).map((c) => c.name).filter(Boolean).join(", ") || "-"}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" title="복제" onClick={() => duplicate(r)}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="삭제" onClick={() => setDelId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>신규 사업 추가</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>사업명 *</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div><Label>발주처</Label><Input value={newClient} onChange={(e) => setNewClient(e.target.value)} /></div>
              <div><Label>공고일</Label><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)}>취소</Button>
              <Button onClick={create}>추가</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>사업을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={remove}>삭제</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// ============================================================
function ProjectDetail({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [row, setRow] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState<CriteriaSection[]>(DEFAULT_CRITERIA);
  const [scores, setScores] = useState<Record<string, number>>({}); // code → 자기평가 점수
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("pq_calc_projects").select("*").eq("id", projectId).maybeSingle();
    if (error) { toast.error(error.message); setLoading(false); return; }
    if (!data) { toast.error("사업을 찾을 수 없습니다"); onBack(); return; }
    // ensure structure
    const r = data as ProjectRow;
    r.companies = r.companies || [];
    r.personnel = r.personnel || { chief: blankPerson("총괄"), leads: [], members: [] };
    if (!r.personnel.chief) r.personnel.chief = blankPerson("총괄");
    r.personnel.leads = r.personnel.leads || [];
    r.personnel.members = r.personnel.members || [];
    r.options = r.options || {};
    setRow(r);
    setScores((r.options as any)?.scores || {});

    // load shared criteria
    const { data: c } = await (supabase as any).from("pq_score_criteria").select("*").maybeSingle();
    if (c?.criteria && Array.isArray(c.criteria) && c.criteria.length) setCriteria(c.criteria);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const payload = {
      project_name: row.project_name,
      client: row.client,
      announcement_date: row.announcement_date,
      companies: row.companies,
      personnel: row.personnel,
      options: { ...row.options, scores },
      notes: row.notes,
    };
    const { error } = await (supabase as any).from("pq_calc_projects").update(payload).eq("id", projectId);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("저장 완료");
  };

  const saveCriteria = async (next: CriteriaSection[]) => {
    if (!user) return;
    setCriteria(next);
    const { data: existing } = await (supabase as any).from("pq_score_criteria").select("id").maybeSingle();
    if (existing?.id) {
      await (supabase as any).from("pq_score_criteria").update({ criteria: next }).eq("id", existing.id);
    } else {
      await (supabase as any).from("pq_score_criteria").insert({ created_by: user.id, criteria: next });
    }
    toast.success("배점기준표 저장됨 (다른 사업에도 동일하게 반영)");
  };

  if (loading || !row) {
    return <AppLayout title="PQ 배점계산기"><Card className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></Card></AppLayout>;
  }

  const totalShare = (row.companies || []).reduce((s, c) => s + Number(c.share_rate || 0), 0);
  const totalScore = criteria.reduce((s, sec) => s + sec.items.reduce((ss, it) => ss + Number(scores[it.code] || 0), 0), 0);
  const totalMax = criteria.reduce((s, sec) => s + sec.items.reduce((ss, it) => ss + it.max, 0), 0);

  return (
    <AppLayout title={`PQ 배점계산기 - ${row.project_name}`}>
      <div className="space-y-4">
        <Card className="p-4 flex flex-wrap justify-between items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />사업 목록</Button>
          <div className="text-sm">
            <span className="text-muted-foreground">합계 점수: </span>
            <span className="text-xl font-bold text-primary">{totalScore.toFixed(2)}</span>
            <span className="text-muted-foreground"> / {totalMax}</span>
          </div>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}저장</Button>
        </Card>

        <Tabs defaultValue="input">
          <TabsList>
            <TabsTrigger value="input">1. 기술자·유사용역 입력</TabsTrigger>
            <TabsTrigger value="criteria">2. 배점기준표</TabsTrigger>
            <TabsTrigger value="summary">3. 점수 요약</TabsTrigger>
          </TabsList>

          {/* TAB 1 — INPUTS */}
          <TabsContent value="input" className="space-y-4">
            <Card className="p-4 space-y-3">
              <div className="font-semibold text-sm">사업 정보</div>
              <div className="grid md:grid-cols-3 gap-3">
                <div><Label>사업명</Label><Input value={row.project_name} onChange={(e) => setRow({ ...row, project_name: e.target.value })} /></div>
                <div><Label>발주처</Label><Input value={row.client || ""} onChange={(e) => setRow({ ...row, client: e.target.value })} /></div>
                <div><Label>공고일</Label><Input type="date" value={row.announcement_date || ""} onChange={(e) => setRow({ ...row, announcement_date: e.target.value || null })} /></div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">참여 회사 / 지분율</div>
                <Button size="sm" variant="outline" onClick={() => setRow({ ...row, companies: [...row.companies, { name: "", share_rate: 0 }] })}>
                  <Plus className="h-4 w-4 mr-1" />회사 추가
                </Button>
              </div>
              {row.companies.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="flex-1" placeholder="회사명" value={c.name} onChange={(e) => {
                    const next = [...row.companies]; next[i] = { ...c, name: e.target.value }; setRow({ ...row, companies: next });
                  }} />
                  <Input className="w-32" type="number" placeholder="지분율(%)" value={c.share_rate ?? ""} onChange={(e) => {
                    const next = [...row.companies]; next[i] = { ...c, share_rate: e.target.value === "" ? null : Number(e.target.value) }; setRow({ ...row, companies: next });
                  }} />
                  <Button size="icon" variant="ghost" onClick={() => setRow({ ...row, companies: row.companies.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className={`text-xs ${Math.abs(totalShare - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>지분율 합계: {totalShare}%</div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="font-semibold text-sm">참여 인력</div>
              <PersonRow label="총괄평가자 (1인)" person={row.personnel.chief!} onChange={(p) => setRow({ ...row, personnel: { ...row.personnel, chief: p } })} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>책임평가자</Label>
                  <Button size="sm" variant="outline" onClick={() => setRow({ ...row, personnel: { ...row.personnel, leads: [...row.personnel.leads, blankPerson("책임")] } })}><Plus className="h-3 w-3 mr-1" />추가</Button>
                </div>
                {row.personnel.leads.map((p, i) => (
                  <PersonRow key={i} person={p}
                    onChange={(np) => { const next = [...row.personnel.leads]; next[i] = np; setRow({ ...row, personnel: { ...row.personnel, leads: next } }); }}
                    onRemove={() => setRow({ ...row, personnel: { ...row.personnel, leads: row.personnel.leads.filter((_, j) => j !== i) } })}
                  />
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>참여평가자</Label>
                  <Button size="sm" variant="outline" onClick={() => setRow({ ...row, personnel: { ...row.personnel, members: [...row.personnel.members, blankPerson("참여")] } })}><Plus className="h-3 w-3 mr-1" />추가</Button>
                </div>
                {row.personnel.members.map((p, i) => (
                  <PersonRow key={i} person={p}
                    onChange={(np) => { const next = [...row.personnel.members]; next[i] = np; setRow({ ...row, personnel: { ...row.personnel, members: next } }); }}
                    onRemove={() => setRow({ ...row, personnel: { ...row.personnel, members: row.personnel.members.filter((_, j) => j !== i) } })}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">※ 등록된 기술인력의 등급·경력·실적·교육시간·이적계수 자동연동은 다음 단계에서 추가됩니다.</p>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="font-semibold text-sm">옵션</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>과업의 이해도 배점한도</Label>
                  <Input type="number" step="0.5" value={row.options.task_understanding_max ?? ""} onChange={(e) => setRow({ ...row, options: { ...row.options, task_understanding_max: Number(e.target.value) } })} />
                </div>
                <div>
                  <Label>공동도급 선택</Label>
                  <Select value={row.options.joint_contract_type || ""} onValueChange={(v) => setRow({ ...row, options: { ...row.options, joint_contract_type: v } })}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1종-2종">1종업체 ↔ 2종업체</SelectItem>
                      <SelectItem value="1종-소기업">1종업체 ↔ 소기업</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>업체능력평가 배점한도</Label>
                  <Input type="number" value={row.options.company_capability_max ?? ""} onChange={(e) => setRow({ ...row, options: { ...row.options, company_capability_max: Number(e.target.value) } })} />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!row.options.company_capability_relative} onChange={(e) => setRow({ ...row, options: { ...row.options, company_capability_relative: e.target.checked } })} />
                    상대평가 적용
                  </label>
                </div>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea value={row.notes || ""} onChange={(e) => setRow({ ...row, notes: e.target.value })} />
              </div>
            </Card>
          </TabsContent>

          {/* TAB 2 — CRITERIA */}
          <TabsContent value="criteria" className="space-y-3">
            <Card className="p-3 text-xs text-muted-foreground">
              ※ 이 배점기준표는 모든 사업에 공통 적용됩니다. 수정 후 저장하면 다른 사업에도 동일하게 반영됩니다. (기본값: 환경관련용역 사업수행능력평가 세부평가기준)
            </Card>
            {criteria.map((sec, si) => (
              <Card key={sec.code} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Input className="w-16" value={sec.code} onChange={(e) => {
                    const next = [...criteria]; next[si] = { ...sec, code: e.target.value }; setCriteria(next);
                  }} />
                  <Input className="flex-1" value={sec.label} onChange={(e) => {
                    const next = [...criteria]; next[si] = { ...sec, label: e.target.value }; setCriteria(next);
                  }} />
                  <Input className="w-20" type="number" value={sec.max} onChange={(e) => {
                    const next = [...criteria]; next[si] = { ...sec, max: Number(e.target.value) }; setCriteria(next);
                  }} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">코드</TableHead>
                      <TableHead>평가요소</TableHead>
                      <TableHead className="w-20 text-right">배점</TableHead>
                      <TableHead className="w-20">비고</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sec.items.map((it, ii) => (
                      <TableRow key={ii}>
                        <TableCell><Input value={it.code} onChange={(e) => {
                          const next = [...criteria]; next[si].items[ii] = { ...it, code: e.target.value }; setCriteria(next);
                        }} /></TableCell>
                        <TableCell><Input value={it.label} onChange={(e) => {
                          const next = [...criteria]; next[si].items[ii] = { ...it, label: e.target.value }; setCriteria(next);
                        }} /></TableCell>
                        <TableCell><Input type="number" step="0.5" value={it.max} onChange={(e) => {
                          const next = [...criteria]; next[si].items[ii] = { ...it, max: Number(e.target.value) }; setCriteria(next);
                        }} /></TableCell>
                        <TableCell><Input value={it.note || ""} onChange={(e) => {
                          const next = [...criteria]; next[si].items[ii] = { ...it, note: e.target.value }; setCriteria(next);
                        }} /></TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => {
                            const next = [...criteria]; next[si].items = next[si].items.filter((_, k) => k !== ii); setCriteria(next);
                          }}><X className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                  const next = [...criteria]; next[si].items.push({ code: "", label: "", max: 0 }); setCriteria(next);
                }}><Plus className="h-3 w-3 mr-1" />항목 추가</Button>
              </Card>
            ))}
            <div className="flex gap-2">
              <Button onClick={() => saveCriteria(criteria)}>배점기준표 저장 (공통 적용)</Button>
              <Button variant="outline" onClick={() => setCriteria(DEFAULT_CRITERIA)}>기본값 복원</Button>
            </div>
          </TabsContent>

          {/* TAB 3 — SUMMARY */}
          <TabsContent value="summary">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-40">평가항목</TableHead>
                    <TableHead>평가요소</TableHead>
                    <TableHead className="w-20 text-right">배점</TableHead>
                    <TableHead className="w-32 text-right">자기평가</TableHead>
                    <TableHead>산출근거</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map((sec) => (
                    <>
                      <TableRow key={`s-${sec.code}`} className="bg-muted/30 font-semibold">
                        <TableCell rowSpan={sec.items.length + 1}>{sec.code}. {sec.label}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">[{sec.max}]</TableCell>
                        <TableCell className="text-right">
                          {sec.items.reduce((s, it) => s + Number(scores[it.code] || 0), 0).toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                      {sec.items.map((it) => (
                        <TableRow key={it.code}>
                          <TableCell>{it.label}</TableCell>
                          <TableCell className="text-right">{it.max}{it.note ? ` ${it.note}` : ""}</TableCell>
                          <TableCell>
                            <Input className="text-right" type="number" step="0.01" value={scores[it.code] ?? ""}
                              onChange={(e) => setScores({ ...scores, [it.code]: e.target.value === "" ? 0 : Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">자동계산 (개발 예정)</TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                  <TableRow className="bg-primary/10 font-bold">
                    <TableCell colSpan={2}>합계</TableCell>
                    <TableCell className="text-right">{totalMax}</TableCell>
                    <TableCell className="text-right">{totalScore.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function PersonRow({ label, person, onChange, onRemove }: { label?: string; person: Person; onChange: (p: Person) => void; onRemove?: () => void }) {
  return (
    <div className="space-y-1">
      {label && <Label className="text-xs">{label}</Label>}
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="기술자명" value={person.name} onChange={(e) => onChange({ ...person, name: e.target.value })} />
        <Input className="w-40" placeholder="전문분야" value={person.specialty || ""} onChange={(e) => onChange({ ...person, specialty: e.target.value })} />
        {onRemove && <Button size="icon" variant="ghost" onClick={onRemove}><X className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}
