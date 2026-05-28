import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, ChevronDown, ChevronRight } from "lucide-react";

type PersonalCareer = {
  id: string;
  technician_name: string;
  company: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  resign_date: string | null;
  duties: string | null;
  notes: string | null;
};

type PeriodForm = {
  id?: string;
  company: string;
  department: string;
  position: string;
  hire_date: string;
};

const parseDate = (s?: string | null) => (s ? new Date(s + "T00:00:00") : null);

const diffYM = (start?: string | null, end?: string | null) => {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return "";
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}년 ${m}개월`;
};

const diffDays = (start?: string | null, end?: string | null) => {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
};

export default function PersonalHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonalCareer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [announcementDate, setAnnouncementDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<string | null>(null);
  const [techName, setTechName] = useState("");
  const [periods, setPeriods] = useState<PeriodForm[]>([{ company: "", department: "", position: "", hire_date: "" }]);
  const [deleteTech, setDeleteTech] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (name: string) => setCollapsed((p) => ({ ...p, [name]: !p[name] }));
  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    filtered.forEach(([n]) => { next[n] = true; });
    setCollapsed(next);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("personal_careers")
      .select("*")
      .order("technician_name", { ascending: true })
      .order("hire_date", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as PersonalCareer[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group by technician_name
  const grouped = useMemo(() => {
    const map = new Map<string, PersonalCareer[]>();
    for (const r of rows) {
      const arr = map.get(r.technician_name) || [];
      arr.push(r);
      map.set(r.technician_name, arr);
    }
    // sort each group by hire_date asc
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.hire_date || "").localeCompare(b.hire_date || ""));
    }
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter(([name, list]) =>
      name.toLowerCase().includes(q) ||
      list.some((r) => [r.company, r.department, r.position].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
    );
  }, [grouped, search]);

  const openNew = () => {
    setEditingTech(null);
    setTechName("");
    setPeriods([{ company: "", department: "", position: "", hire_date: "" }]);
    setDialogOpen(true);
  };

  const openEdit = (name: string, list: PersonalCareer[]) => {
    setEditingTech(name);
    setTechName(name);
    setPeriods(list.map((r) => ({
      id: r.id,
      company: r.company || "",
      department: r.department || "",
      position: r.position || "",
      hire_date: r.hire_date || "",
    })));
    setDialogOpen(true);
  };

  const updatePeriod = (i: number, patch: Partial<PeriodForm>) => {
    setPeriods((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const addPeriod = () => setPeriods((p) => [...p, { company: "", department: "", position: "", hire_date: "" }]);
  const removePeriod = (i: number) => setPeriods((p) => p.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!user) return;
    if (!techName.trim()) { toast.error("기술자명을 입력하세요"); return; }
    const cleaned = periods.filter((p) => p.company.trim() || p.hire_date);
    if (cleaned.length === 0) { toast.error("근무처를 1개 이상 입력하세요"); return; }
    for (const p of cleaned) {
      if (!p.company.trim()) { toast.error("근무처(회사명)을 입력하세요"); return; }
    }

    // Delete existing rows for this technician (if editing), then insert all
    if (editingTech) {
      const { error: delErr } = await supabase.from("personal_careers").delete().eq("technician_name", editingTech);
      if (delErr) { toast.error(delErr.message); return; }
    }
    const payload = cleaned.map((p) => ({
      technician_name: techName.trim(),
      company: p.company.trim(),
      department: p.department.trim() || null,
      position: p.position.trim() || null,
      hire_date: p.hire_date || null,
      resign_date: null,
      duties: null,
      notes: null,
      created_by: user.id,
    }));
    const { error } = await supabase.from("personal_careers").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingTech ? "수정되었습니다" : "등록되었습니다");
    setDialogOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteTech) return;
    const { error } = await supabase.from("personal_careers").delete().eq("technician_name", deleteTech);
    if (error) toast.error(error.message);
    else { toast.success("삭제되었습니다"); load(); }
    setDeleteTech(null);
  };

  return (
    <AppLayout title="PQ 개인별 이력사항">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end sm:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Label className="text-xs text-muted-foreground">검색</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="기술자명·회사명·직위 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="w-full sm:w-56">
              <Label className="text-xs text-muted-foreground">공고일</Label>
              <Input type="date" value={announcementDate} onChange={(e) => setAnnouncementDate(e.target.value)} />
            </div>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />이력 추가</Button>
        </div>

        <Card className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <div className="text-xs text-muted-foreground">
              기술자별로 근무처 이력을 시간 순으로 입력하세요. 마지막 근무처가 현재 재직중이라면 입사일만 입력하면 공고일 기준으로 근무기간이 계산됩니다.
            </div>
            {filtered.length > 0 && (
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={expandAll}>모두 펼치기</Button>
                <Button size="sm" variant="outline" onClick={collapseAll}>모두 접기</Button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">등록된 이력이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(([name, list]) => {
                const firstHire = list[0]?.hire_date;
                const totalDays = announcementDate && firstHire ? diffDays(firstHire, announcementDate) : 0;
                const totalYM = announcementDate && firstHire ? diffYM(firstHire, announcementDate) : "";
                const isCollapsed = !!collapsed[name];
                return (
                  <div key={name} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(name)}
                        className="flex items-start gap-2 text-left flex-1 min-w-0"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-semibold text-base">{name} <span className="text-xs text-muted-foreground font-normal">({list.length}곳)</span></div>
                          {announcementDate && firstHire && (
                            <div className="text-xs text-muted-foreground mt-1">
                              이적일수: <span className="font-medium text-foreground">{totalDays.toLocaleString()}일</span>
                              {" · "}이적개월: <span className="font-medium text-foreground">{totalYM}</span>
                            </div>
                          )}
                        </div>
                      </button>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => openEdit(name, list)}><Pencil className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">수정</span></Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTech(name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <>
                        {/* Desktop: table */}
                        <div className="hidden md:block overflow-auto">
                          <Table className="min-w-[700px] text-sm">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">순번</TableHead>
                                <TableHead>근무처(회사)</TableHead>
                                <TableHead>부서</TableHead>
                                <TableHead>직위</TableHead>
                                <TableHead>입사일</TableHead>
                                <TableHead>근무기간</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {list.map((r, idx) => {
                                const isLast = idx === list.length - 1;
                                const next = list[idx + 1];
                                const endDate = isLast ? (announcementDate || null) : (next?.hire_date || null);
                                const period = diffYM(r.hire_date, endDate);
                                return (
                                  <TableRow key={r.id}>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell className="font-medium">{r.company}{isLast && announcementDate ? <span className="ml-1 text-xs text-primary">(현재)</span> : null}</TableCell>
                                    <TableCell>{r.department || ""}</TableCell>
                                    <TableCell>{r.position || ""}</TableCell>
                                    <TableCell>{r.hire_date || ""}</TableCell>
                                    <TableCell>{period || <span className="text-muted-foreground text-xs">{isLast && !announcementDate ? "공고일 입력 시 계산" : ""}</span>}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-2">
                          {list.map((r, idx) => {
                            const isLast = idx === list.length - 1;
                            const next = list[idx + 1];
                            const endDate = isLast ? (announcementDate || null) : (next?.hire_date || null);
                            const period = diffYM(r.hire_date, endDate);
                            return (
                              <div key={r.id} className="rounded-md border bg-muted/30 p-2.5 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium truncate">
                                    <span className="text-xs text-muted-foreground mr-1">#{idx + 1}</span>
                                    {r.company}
                                    {isLast && announcementDate ? <span className="ml-1 text-xs text-primary">(현재)</span> : null}
                                  </div>
                                </div>
                                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  {r.department && <div>부서: <span className="text-foreground">{r.department}</span></div>}
                                  {r.position && <div>직위: <span className="text-foreground">{r.position}</span></div>}
                                  {r.hire_date && <div>입사: <span className="text-foreground">{r.hire_date}</span></div>}
                                  <div>기간: <span className="text-foreground">{period || (isLast && !announcementDate ? "공고일 필요" : "-")}</span></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTech ? "이력 수정" : "이력 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>기술자명 *</Label>
              <Input value={techName} onChange={(e) => setTechName(e.target.value)} disabled={!!editingTech} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>근무처 이력 (시간순)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addPeriod}><Plus className="h-3.5 w-3.5 mr-1" />추가</Button>
              </div>
              {periods.map((p, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">근무처 #{i + 1} {i === periods.length - 1 && <span className="text-primary">(가장 최근/현재)</span>}</div>
                    {periods.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePeriod(i)}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                  <div><Label className="text-xs">회사명 *</Label><Input value={p.company} onChange={(e) => updatePeriod(i, { company: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">부서</Label><Input value={p.department} onChange={(e) => updatePeriod(i, { department: e.target.value })} /></div>
                    <div><Label className="text-xs">직급</Label><Input value={p.position} onChange={(e) => updatePeriod(i, { position: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-xs">입사일</Label><Input type="date" value={p.hire_date} onChange={(e) => updatePeriod(i, { hire_date: e.target.value })} /></div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                각 근무처의 퇴사일은 다음 근무처의 입사일로 자동 계산됩니다. 마지막 근무처는 공고일 기준으로 근무기간이 계산됩니다.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={save}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTech} onOpenChange={(o) => !o && setDeleteTech(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTech}님의 모든 근무이력을 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
