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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, ChevronDown, ChevronRight, Star } from "lucide-react";

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

type Education = { school: string; major: string; degree: "학사" | "석사" | "박사" | "" };
type Certification = { name: string; number: string; acquired_date: string; is_primary: boolean };

type PersonalProfile = {
  id?: string;
  technician_name: string;
  birth_date: string | null;
  specialty: string | null;
  address: string | null;
  grade_kepa: string | null;
  grade_eval: string | null;
  educations: Education[];
  certifications: Certification[];
};

type PeriodForm = {
  id?: string;
  company: string;
  department: string;
  position: string;
  hire_date: string;
  resign_date: string;
  is_current: boolean;
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

const koreanAge = (birth?: string | null, ref?: string | null) => {
  const b = parseDate(birth);
  const r = parseDate(ref);
  if (!b || !r) return "";
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age -= 1;
  return age >= 0 ? `${age}세` : "";
};

const formatBirth = (s?: string | null) => {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return y && m && d ? `${y}.${m}.${d}` : s;
};

export default function PersonalHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonalCareer[]>([]);
  const [profiles, setProfiles] = useState<PersonalProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [announcementDate, setAnnouncementDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<string | null>(null);
  const [techName, setTechName] = useState("");
  const [periods, setPeriods] = useState<PeriodForm[]>([{ company: "", department: "", position: "", hire_date: "", resign_date: "", is_current: true }]);
  const [birthDate, setBirthDate] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [educations, setEducations] = useState<Education[]>([{ school: "", major: "", degree: "학사" }]);
  const [certifications, setCertifications] = useState<Certification[]>([{ name: "", number: "", acquired_date: "", is_primary: true }]);
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
    const [{ data: cData, error: cErr }, { data: pData, error: pErr }] = await Promise.all([
      supabase.from("personal_careers").select("*").order("technician_name", { ascending: true }).order("hire_date", { ascending: true }),
      supabase.from("personal_profiles" as any).select("*"),
    ]);
    if (cErr) toast.error(cErr.message);
    else setRows((cData as PersonalCareer[]) || []);
    if (pErr) toast.error(pErr.message);
    else setProfiles(((pData as any[]) || []).map((p) => ({
      id: p.id,
      technician_name: p.technician_name,
      birth_date: p.birth_date,
      specialty: p.specialty,
      address: p.address ?? null,
      grade_kepa: p.grade_kepa ?? null,
      grade_eval: p.grade_eval ?? null,
      educations: Array.isArray(p.educations) ? p.educations : [],
      certifications: Array.isArray(p.certifications) ? p.certifications : [],
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const profileMap = useMemo(() => {
    const m = new Map<string, PersonalProfile>();
    profiles.forEach((p) => m.set(p.technician_name, p));
    return m;
  }, [profiles]);

  const grouped = useMemo(() => {
    const map = new Map<string, PersonalCareer[]>();
    for (const r of rows) {
      const arr = map.get(r.technician_name) || [];
      arr.push(r);
      map.set(r.technician_name, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.hire_date || "").localeCompare(b.hire_date || ""));
    }
    // Include techs that have profile only
    profiles.forEach((p) => { if (!map.has(p.technician_name)) map.set(p.technician_name, []); });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, profiles]);

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
    setPeriods([{ company: "", department: "", position: "", hire_date: "", resign_date: "", is_current: true }]);
    setBirthDate("");
    setSpecialty("");
    setEducations([{ school: "", major: "", degree: "학사" }]);
    setCertifications([{ name: "", number: "", acquired_date: "", is_primary: true }]);
    setDialogOpen(true);
  };

  const openEdit = (name: string, list: PersonalCareer[]) => {
    setEditingTech(name);
    setTechName(name);
    setPeriods(list.length ? list.map((r) => ({
      id: r.id,
      company: r.company || "",
      department: r.department || "",
      position: r.position || "",
      hire_date: r.hire_date || "",
      resign_date: r.resign_date || "",
      is_current: !r.resign_date,
    })) : [{ company: "", department: "", position: "", hire_date: "", resign_date: "", is_current: true }]);
    const prof = profileMap.get(name);
    setBirthDate(prof?.birth_date || "");
    setSpecialty(prof?.specialty || "");
    setEducations(prof?.educations?.length ? prof.educations : [{ school: "", major: "", degree: "학사" }]);
    setCertifications(prof?.certifications?.length ? prof.certifications : [{ name: "", number: "", acquired_date: "", is_primary: true }]);
    setDialogOpen(true);
  };

  const updatePeriod = (i: number, patch: Partial<PeriodForm>) => setPeriods((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPeriod = () => setPeriods((p) => [...p, { company: "", department: "", position: "", hire_date: "", resign_date: "", is_current: false }]);
  const removePeriod = (i: number) => setPeriods((p) => p.filter((_, idx) => idx !== i));

  const updateEdu = (i: number, patch: Partial<Education>) => setEducations((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addEdu = () => setEducations((p) => [...p, { school: "", major: "", degree: "학사" }]);
  const removeEdu = (i: number) => setEducations((p) => p.filter((_, idx) => idx !== i));

  const updateCert = (i: number, patch: Partial<Certification>) => setCertifications((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addCert = () => setCertifications((p) => [...p, { name: "", number: "", acquired_date: "", is_primary: p.length === 0 }]);
  const removeCert = (i: number) => setCertifications((p) => p.filter((_, idx) => idx !== i));
  const setPrimaryCert = (i: number) => setCertifications((p) => p.map((c, idx) => ({ ...c, is_primary: idx === i })));

  const save = async () => {
    if (!user) return;
    if (!techName.trim()) { toast.error("기술자명을 입력하세요"); return; }
    const cleanedPeriods = periods.filter((p) => p.company.trim() || p.hire_date);
    for (const p of cleanedPeriods) {
      if (!p.company.trim()) { toast.error("근무처(회사명)을 입력하세요"); return; }
    }

    if (editingTech) {
      const { error: delErr } = await supabase.from("personal_careers").delete().eq("technician_name", editingTech);
      if (delErr) { toast.error(delErr.message); return; }
    }
    if (cleanedPeriods.length > 0) {
      const payload = cleanedPeriods.map((p) => ({
        technician_name: techName.trim(),
        company: p.company.trim(),
        department: p.department.trim() || null,
        position: p.position.trim() || null,
        hire_date: p.hire_date || null,
        resign_date: p.is_current ? null : (p.resign_date || null),
        duties: null,
        notes: null,
        created_by: user.id,
      }));
      const { error } = await supabase.from("personal_careers").insert(payload);
      if (error) { toast.error(error.message); return; }
    }

    // Save profile (upsert)
    const cleanedEdu = educations.filter((e) => e.school.trim() || e.major.trim());
    const cleanedCert = certifications.filter((c) => c.name.trim() || c.number.trim());
    if (cleanedCert.length > 0 && !cleanedCert.some((c) => c.is_primary)) cleanedCert[0].is_primary = true;
    const profilePayload = {
      created_by: user.id,
      technician_name: techName.trim(),
      birth_date: birthDate || null,
      specialty: specialty.trim() || null,
      educations: cleanedEdu,
      certifications: cleanedCert,
    };
    const { error: pErr } = await supabase
      .from("personal_profiles" as any)
      .upsert(profilePayload, { onConflict: "created_by,technician_name" });
    if (pErr) { toast.error(pErr.message); return; }

    toast.success(editingTech ? "수정되었습니다" : "등록되었습니다");
    setDialogOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteTech) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("personal_careers").delete().eq("technician_name", deleteTech),
      supabase.from("personal_profiles" as any).delete().eq("technician_name", deleteTech),
    ]);
    if (e1 || e2) toast.error((e1 || e2)!.message);
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
              기술자별로 인적사항·학력·자격증·근무처 이력을 입력하세요. 재직중인 경우 공고일 기준으로 근무기간이 계산됩니다.
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
                const prof = profileMap.get(name);
                const age = koreanAge(prof?.birth_date, announcementDate);
                const primaryCert = prof?.certifications?.find((c) => c.is_primary) || prof?.certifications?.[0];
                return (
                  <div key={name} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => toggle(name)} className="flex items-start gap-2 text-left flex-1 min-w-0">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 mt-1 shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-semibold text-base">
                            {name}
                            {list.length > 0 && <span className="text-xs text-muted-foreground font-normal"> ({list.length}곳)</span>}
                            {prof?.specialty && <span className="ml-2 text-xs text-muted-foreground font-normal">· {prof.specialty}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 space-x-2">
                            {prof?.birth_date && <span>생년월일: <span className="font-medium text-foreground">{formatBirth(prof.birth_date)}</span></span>}
                            {age && <span>만 {age}</span>}
                            {primaryCert?.name && <span>· 대표자격: <span className="font-medium text-foreground">{primaryCert.name}</span></span>}
                          </div>
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
                        {/* Profile details */}
                        {(prof?.educations?.length || prof?.certifications?.length) ? (
                          <div className="rounded-md bg-muted/30 p-2.5 text-xs space-y-1.5">
                            {prof?.educations?.length ? (
                              <div>
                                <span className="text-muted-foreground">학력: </span>
                                <span>{prof.educations.map((e, i) => `${e.school || ""}${e.major ? ` ${e.major}` : ""}${e.degree ? ` (${e.degree})` : ""}`).filter((s) => s.trim()).join(" / ")}</span>
                              </div>
                            ) : null}
                            {prof?.certifications?.length ? (
                              <div>
                                <span className="text-muted-foreground">자격증: </span>
                                <span>{prof.certifications.map((c) => `${c.is_primary ? "★ " : ""}${c.name}${c.number ? `(${c.number})` : ""}${c.acquired_date ? ` ${c.acquired_date}` : ""}`).filter((s) => s.trim()).join(" / ")}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {/* Desktop: table */}
                        {list.length > 0 && (
                        <div className="hidden md:block overflow-auto">
                          <Table className="min-w-[780px] text-sm">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">순번</TableHead>
                                <TableHead>근무처(회사)</TableHead>
                                <TableHead>부서</TableHead>
                                <TableHead>직위</TableHead>
                                <TableHead>입사일</TableHead>
                                <TableHead>퇴사일</TableHead>
                                <TableHead>근무기간</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {list.map((r, idx) => {
                                const isLast = idx === list.length - 1;
                                const next = list[idx + 1];
                                const isCurrent = !r.resign_date && isLast;
                                const endDate = r.resign_date || (isLast ? (announcementDate || null) : (next?.hire_date || null));
                                const period = diffYM(r.hire_date, endDate);
                                return (
                                  <TableRow key={r.id}>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell className="font-medium">{r.company}{isCurrent && announcementDate ? <span className="ml-1 text-xs text-primary">(재직중)</span> : null}</TableCell>
                                    <TableCell>{r.department || ""}</TableCell>
                                    <TableCell>{r.position || ""}</TableCell>
                                    <TableCell>{r.hire_date || ""}</TableCell>
                                    <TableCell>{r.resign_date || (isCurrent ? <span className="text-xs text-primary">재직중</span> : "")}</TableCell>
                                    <TableCell>{period || <span className="text-muted-foreground text-xs">{isCurrent && !announcementDate ? "공고일 입력 시 계산" : ""}</span>}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        )}
                        {/* Mobile: cards */}
                        {list.length > 0 && (
                        <div className="md:hidden space-y-2">
                          {list.map((r, idx) => {
                            const isLast = idx === list.length - 1;
                            const next = list[idx + 1];
                            const isCurrent = !r.resign_date && isLast;
                            const endDate = r.resign_date || (isLast ? (announcementDate || null) : (next?.hire_date || null));
                            const period = diffYM(r.hire_date, endDate);
                            return (
                              <div key={r.id} className="rounded-md border bg-muted/30 p-2.5 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium truncate">
                                    <span className="text-xs text-muted-foreground mr-1">#{idx + 1}</span>
                                    {r.company}
                                    {isCurrent && announcementDate ? <span className="ml-1 text-xs text-primary">(재직중)</span> : null}
                                  </div>
                                </div>
                                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  {r.department && <div>부서: <span className="text-foreground">{r.department}</span></div>}
                                  {r.position && <div>직위: <span className="text-foreground">{r.position}</span></div>}
                                  {r.hire_date && <div>입사: <span className="text-foreground">{r.hire_date}</span></div>}
                                  <div>퇴사: <span className="text-foreground">{r.resign_date || (isCurrent ? "재직중" : "-")}</span></div>
                                  <div className="col-span-2">기간: <span className="text-foreground">{period || (isCurrent && !announcementDate ? "공고일 필요" : "-")}</span></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        )}
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">생년월일</Label>
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                {birthDate && announcementDate && (
                  <div className="text-xs text-muted-foreground mt-1">공고일 기준 만 {koreanAge(birthDate, announcementDate)}</div>
                )}
              </div>
              <div>
                <Label className="text-xs">전문분야</Label>
                <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="예: 도시계획" />
              </div>
            </div>

            {/* Educations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>학력</Label>
                <Button type="button" size="sm" variant="outline" onClick={addEdu}><Plus className="h-3.5 w-3.5 mr-1" />추가</Button>
              </div>
              {educations.map((e, i) => (
                <div key={i} className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">학력 #{i + 1}</div>
                    {educations.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeEdu(i)}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">학교명</Label><Input value={e.school} onChange={(ev) => updateEdu(i, { school: ev.target.value })} /></div>
                    <div><Label className="text-xs">학과</Label><Input value={e.major} onChange={(ev) => updateEdu(i, { major: ev.target.value })} /></div>
                  </div>
                  <div>
                    <Label className="text-xs">학위</Label>
                    <Select value={e.degree || "학사"} onValueChange={(v) => updateEdu(i, { degree: v as Education["degree"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="학사">학사</SelectItem>
                        <SelectItem value="석사">석사</SelectItem>
                        <SelectItem value="박사">박사</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {/* Certifications */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>자격증 <span className="text-xs text-muted-foreground font-normal">(★ 대표자격증 선택)</span></Label>
                <Button type="button" size="sm" variant="outline" onClick={addCert}><Plus className="h-3.5 w-3.5 mr-1" />추가</Button>
              </div>
              <RadioGroup value={String(certifications.findIndex((c) => c.is_primary))} onValueChange={(v) => setPrimaryCert(Number(v))}>
                {certifications.map((c, i) => (
                  <div key={i} className="border rounded-md p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <RadioGroupItem value={String(i)} id={`cert-${i}`} />
                        <span>자격증 #{i + 1} {c.is_primary && <Star className="inline h-3 w-3 text-primary fill-primary" />}</span>
                      </label>
                      {certifications.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeCert(i)}><X className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">자격증명</Label><Input value={c.name} onChange={(ev) => updateCert(i, { name: ev.target.value })} /></div>
                      <div><Label className="text-xs">자격증번호</Label><Input value={c.number} onChange={(ev) => updateCert(i, { number: ev.target.value })} /></div>
                    </div>
                    <div><Label className="text-xs">취득일</Label><Input type="date" value={c.acquired_date} onChange={(ev) => updateCert(i, { acquired_date: ev.target.value })} /></div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>근무처 이력 (시간순)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addPeriod}><Plus className="h-3.5 w-3.5 mr-1" />추가</Button>
              </div>
              {periods.map((p, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">근무처 #{i + 1}</div>
                    {periods.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePeriod(i)}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                  <div><Label className="text-xs">회사명 *</Label><Input value={p.company} onChange={(e) => updatePeriod(i, { company: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">부서</Label><Input value={p.department} onChange={(e) => updatePeriod(i, { department: e.target.value })} /></div>
                    <div><Label className="text-xs">직급</Label><Input value={p.position} onChange={(e) => updatePeriod(i, { position: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">입사일</Label><Input type="date" value={p.hire_date} onChange={(e) => updatePeriod(i, { hire_date: e.target.value })} /></div>
                    <div>
                      <Label className="text-xs">퇴사일</Label>
                      <Input type="date" value={p.resign_date} disabled={p.is_current} onChange={(e) => updatePeriod(i, { resign_date: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <Checkbox checked={p.is_current} onCheckedChange={(c) => updatePeriod(i, { is_current: !!c, resign_date: c ? "" : p.resign_date })} />
                    재직중 (체크 시 근무기간을 공고일 기준으로 산정)
                  </label>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                입사일 기준으로 자동 정렬됩니다. 퇴사일을 비워두면 다음 근무처의 입사일이, 재직중이면 공고일이 종료일로 사용됩니다.
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
            <AlertDialogTitle>{deleteTech}님의 모든 이력 정보를 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>인적사항·학력·자격증·근무이력이 모두 삭제됩니다. 되돌릴 수 없습니다.</AlertDialogDescription>
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
