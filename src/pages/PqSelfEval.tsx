import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, FolderOpen, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";

type Source = "tech" | "similar" | "credit" | "overlap" | "manual";
type Item = {
  id: string; name: string; source: Source; full: number; base: number;
  /** higher = 값이 클수록 유리, lower = 작을수록 유리 */
  dir: "higher" | "lower"; step: number; deduct: number; unit: string; manual?: number;
};
type Template = { items: Item[] };
type Partner = { id: string; name: string; share: number; score: number };

const CLIENTS = ["LH", "한국도로공사", "지자체", "환경청", "직접 입력"];
const TPL_KEY = "pq_self_eval_templates_v1";
const uid = () => Math.random().toString(36).slice(2, 10);

const defaultItems = (): Item[] => [
  { id: uid(), name: "참여기술인", source: "tech", full: 40, base: 10, dir: "higher", step: 1, deduct: 2, unit: "명" },
  { id: uid(), name: "유사용역실적", source: "similar", full: 30, base: 300, dir: "higher", step: 50, deduct: 3, unit: "% (사업비 대비)" },
  { id: uid(), name: "신용도", source: "credit", full: 10, base: 7, dir: "higher", step: 1, deduct: 1, unit: "등급점수", manual: 7 },
  { id: uid(), name: "업무중복도", source: "overlap", full: 20, base: 3, dir: "lower", step: 1, deduct: 2, unit: "건/인" },
];

const loadTpls = (): Record<string, Template> => {
  try { return JSON.parse(localStorage.getItem(TPL_KEY) || "{}"); } catch { return {}; }
};
const num = (v: string) => { const n = Number(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; };
const fmt = (n: number, d = 2) => n.toLocaleString("ko-KR", { maximumFractionDigits: d });
const rate = (s: string | null, n: number | null) => {
  if (n != null) return n > 1 ? n / 100 : n;
  const m = String(s ?? "").match(/[\d.]+/);
  if (!m) return 1;
  const v = Number(m[0]);
  return v > 1 ? v / 100 : v;
};

export default function PqSelfEval() {
  const [client, setClient] = useState("LH");
  const [customClient, setCustomClient] = useState("");
  const clientKey = client === "직접 입력" ? customClient.trim() || "직접 입력" : client;
  const [projectName, setProjectName] = useState("");
  const [budget, setBudget] = useState("");
  const [ourShare, setOurShare] = useState("100");
  const [items, setItems] = useState<Item[]>(defaultItems);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [data, setData] = useState({ tech: 0, similarAmt: 0, overlapAvg: 0, loading: true });

  const loadData = async () => {
    setData((d) => ({ ...d, loading: true }));
    const fiveY = new Date(); fiveY.setFullYear(fiveY.getFullYear() - 5);
    const [t, s, o] = await Promise.all([
      supabase.from("technicians").select("id,name,employment_status"),
      supabase.from("similar_services").select("contract_amount,share_amount,participation_rate,company_share_rate,completion_date,is_progress"),
      supabase.from("technician_overlaps").select("technician_name,project_status"),
    ]);
    const techs = (t.data ?? []).filter((x: any) => !/퇴사/.test(x.employment_status ?? ""));
    const similarAmt = (s.data ?? []).reduce((sum: number, r: any) => {
      if (r.completion_date && new Date(r.completion_date) < fiveY) return sum;
      const amt = r.share_amount ?? (r.contract_amount ?? 0) * rate(r.company_share_rate, r.participation_rate);
      return sum + (amt || 0);
    }, 0);
    const ongoing = (o.data ?? []).filter((r: any) => (r.project_status ?? "진행중") !== "준공");
    const names = new Set(ongoing.map((r: any) => r.technician_name).filter(Boolean));
    const overlapAvg = names.size ? ongoing.length / names.size : 0;
    setData({ tech: techs.length, similarAmt, overlapAvg, loading: false });
  };
  useEffect(() => { loadData(); }, []);

  const budgetN = num(budget);
  const ourShareN = num(ourShare);
  // 지분율 반영: 공동수급 시 우리회사 분담 사업비 기준으로 실적 비율 산출
  const ourBudget = budgetN * (ourShareN / 100);

  const current = (it: Item): number => {
    switch (it.source) {
      case "tech": return data.tech;
      case "similar": return ourBudget > 0 ? (data.similarAmt / ourBudget) * 100 : 0;
      case "overlap": return data.overlapAvg;
      default: return it.manual ?? 0;
    }
  };
  const evalItem = (it: Item) => {
    const cur = current(it);
    const gap = it.dir === "higher" ? it.base - cur : cur - it.base;
    if (gap <= 0) return { cur, score: it.full, deduct: 0, reason: "기준 충족" };
    const steps = Math.ceil(gap / Math.max(it.step, 0.0001));
    const d = Math.min(it.full, steps * it.deduct);
    const reason = `기준 ${it.dir === "higher" ? "미달" : "초과"} ${fmt(gap)}${it.unit.split(" ")[0]} → ${steps}단계 × ${it.deduct}점`;
    return { cur, score: it.full - d, deduct: d, reason };
  };
  const evals = items.map((it) => ({ it, ...evalItem(it) }));
  const ourScore = evals.reduce((s, e) => s + e.score, 0);
  const fullTotal = items.reduce((s, i) => s + i.full, 0);
  const shareSum = ourShareN + partners.reduce((s, p) => s + p.share, 0);
  const finalScore = ourScore * (ourShareN / 100) + partners.reduce((s, p) => s + p.score * (p.share / 100), 0);

  const upd = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const updP = (id: string, patch: Partial<Partner>) => setPartners((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const saveTpl = () => {
    const all = loadTpls(); all[clientKey] = { items }; localStorage.setItem(TPL_KEY, JSON.stringify(all));
    toast.success(`'${clientKey}' 템플릿을 저장했습니다`);
  };
  const loadTpl = () => {
    const tpl = loadTpls()[clientKey];
    if (!tpl) { toast.error(`'${clientKey}' 저장된 템플릿이 없습니다`); return; }
    setItems(tpl.items.map((i) => ({ ...i, id: uid() }))); toast.success("템플릿을 불러왔습니다");
  };
  const savedList = useMemo(() => Object.keys(loadTpls()), [items, client, customClient]);

  return (
    <AppLayout title="PQ 점수 자기평가서">
      <div className="space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 w-full sm:w-auto">
              <Label>발주처</Label>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{CLIENTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {client === "직접 입력" && (
              <div className="space-y-1"><Label>발주처명</Label><Input className="w-44" value={customClient} onChange={(e) => setCustomClient(e.target.value)} /></div>
            )}
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={saveTpl}><Save className="h-4 w-4 mr-1" />설정 저장</Button>
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={loadTpl}><FolderOpen className="h-4 w-4 mr-1" />템플릿 불러오기</Button>
            {savedList.length > 0 && <span className="text-xs text-muted-foreground">저장됨: {savedList.join(", ")}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>사업명</Label><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
            <div className="space-y-1"><Label>총 사업비 (원)</Label><Input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, "") ? Number(e.target.value.replace(/[^\d]/g, "")).toLocaleString() : "")} /></div>
            <div className="space-y-1"><Label>우리회사 지분율 (%)</Label><Input type="number" value={ourShare} onChange={(e) => setOurShare(e.target.value)} /></div>
          </div>
        </Card>

        <Card className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">항목별 자기평가표</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={loadData} disabled={data.loading}><RefreshCw className={`h-4 w-4 mr-1 ${data.loading ? "animate-spin" : ""}`} />DB 다시 불러오기</Button>
              <Button size="sm" variant="outline" onClick={() => setItems((x) => [...x, { id: uid(), name: "새 항목", source: "manual", full: 10, base: 0, dir: "higher", step: 1, deduct: 1, unit: "", manual: 0 }])}><Plus className="h-4 w-4 mr-1" />항목 추가</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            DB 연동: 재직 기술자 {data.tech}명 · 최근 5년 유사용역 지분금액 {fmt(data.similarAmt / 1e6, 0)}백만원 · 진행중 업무 {fmt(data.overlapAvg)}건/인 · 우리 분담 사업비 {fmt(ourBudget / 1e6, 0)}백만원
          </p>
          <div className="md:hidden space-y-3">
            {evals.map(({ it, cur, score, deduct, reason }) => (
              <div key={it.id} className={`rounded-lg border p-3 space-y-2 ${deduct > 0 ? "bg-destructive/5 border-destructive/30" : ""}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-9 flex-1" value={it.name} onChange={(e) => upd(it.id, { name: e.target.value })} />
                  <Button size="icon" variant="ghost" onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-muted-foreground">현재 산출값</div>
                    {it.source === "credit" || it.source === "manual"
                      ? <Input type="number" className="h-9 w-24" value={it.manual ?? 0} onChange={(e) => upd(it.id, { manual: num(e.target.value) })} />
                      : <div className="text-lg font-semibold">{fmt(cur)} <span className="text-xs font-normal text-muted-foreground">{it.unit}</span></div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">획득 점수</div>
                    <div className="text-2xl font-bold tabular-nums">{fmt(score)}<span className="text-sm text-muted-foreground font-normal"> / {it.full}</span></div>
                  </div>
                </div>
                <div className="text-xs">{deduct > 0 ? <><Badge variant="destructive" className="mr-1">-{fmt(deduct)}</Badge>{reason}</> : <span className="text-muted-foreground">{reason}</span>}</div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground py-1">배점 기준 수정</summary>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">연동</Label>
                      <Select value={it.source} onValueChange={(v) => upd(it.id, { source: v as Source })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tech">기술자 DB</SelectItem><SelectItem value="similar">유사용역</SelectItem>
                          <SelectItem value="overlap">업무중첩</SelectItem><SelectItem value="credit">신용도(입력)</SelectItem>
                          <SelectItem value="manual">직접 입력</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">만점</Label><Input type="number" className="h-9" value={it.full} onChange={(e) => upd(it.id, { full: num(e.target.value) })} /></div>
                    <div className="space-y-1"><Label className="text-xs">기준값</Label>
                      <div className="flex gap-1">
                        <Select value={it.dir} onValueChange={(v) => upd(it.id, { dir: v as Item["dir"] })}>
                          <SelectTrigger className="h-9 w-16"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="higher">이상</SelectItem><SelectItem value="lower">이하</SelectItem></SelectContent>
                        </Select>
                        <Input type="number" className="h-9 flex-1" value={it.base} onChange={(e) => upd(it.id, { base: num(e.target.value) })} />
                      </div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">감점 단위</Label><Input type="number" className="h-9" value={it.step} onChange={(e) => upd(it.id, { step: num(e.target.value) })} /></div>
                    <div className="space-y-1"><Label className="text-xs">단위당 감점</Label><Input type="number" className="h-9" value={it.deduct} onChange={(e) => upd(it.id, { deduct: num(e.target.value) })} /></div>
                  </div>
                </details>
              </div>
            ))}
            <div className="flex justify-between rounded-lg bg-muted px-3 py-2 font-semibold"><span>우리회사 합계</span><span>{fmt(ourScore)} / {fullTotal}</span></div>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="min-w-32">평가 항목</TableHead><TableHead>연동</TableHead><TableHead>만점</TableHead>
                <TableHead>기준값</TableHead><TableHead className="min-w-36">감점 기준</TableHead><TableHead>현재 산출값</TableHead>
                <TableHead>획득 점수</TableHead><TableHead className="min-w-48">감점/사유</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {evals.map(({ it, cur, score, deduct, reason }) => (
                  <TableRow key={it.id} className={deduct > 0 ? "bg-destructive/5" : ""}>
                    <TableCell><Input className="h-8" value={it.name} onChange={(e) => upd(it.id, { name: e.target.value })} /></TableCell>
                    <TableCell>
                      <Select value={it.source} onValueChange={(v) => upd(it.id, { source: v as Source })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tech">기술자 DB</SelectItem><SelectItem value="similar">유사용역</SelectItem>
                          <SelectItem value="overlap">업무중첩</SelectItem><SelectItem value="credit">신용도(입력)</SelectItem>
                          <SelectItem value="manual">직접 입력</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" className="h-8 w-16" value={it.full} onChange={(e) => upd(it.id, { full: num(e.target.value) })} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Select value={it.dir} onValueChange={(v) => upd(it.id, { dir: v as Item["dir"] })}>
                          <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="higher">이상</SelectItem><SelectItem value="lower">이하</SelectItem></SelectContent>
                        </Select>
                        <Input type="number" className="h-8 w-20" value={it.base} onChange={(e) => upd(it.id, { base: num(e.target.value) })} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{it.unit}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <Input type="number" className="h-8 w-14" value={it.step} onChange={(e) => upd(it.id, { step: num(e.target.value) })} />당
                        <Input type="number" className="h-8 w-14" value={it.deduct} onChange={(e) => upd(it.id, { deduct: num(e.target.value) })} />점
                      </div>
                    </TableCell>
                    <TableCell>
                      {it.source === "credit" || it.source === "manual"
                        ? <Input type="number" className="h-8 w-20" value={it.manual ?? 0} onChange={(e) => upd(it.id, { manual: num(e.target.value) })} />
                        : <span className="font-medium">{fmt(cur)}</span>}
                    </TableCell>
                    <TableCell><span className="font-semibold">{fmt(score)}</span><span className="text-xs text-muted-foreground"> / {it.full}</span></TableCell>
                    <TableCell className="text-xs">
                      {deduct > 0 ? <><Badge variant="destructive" className="mr-1">-{fmt(deduct)}</Badge>{reason}</> : <span className="text-muted-foreground">{reason}</span>}
                    </TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell colSpan={2}>우리회사 합계</TableCell><TableCell>{fullTotal}</TableCell>
                  <TableCell colSpan={3} /><TableCell>{fmt(ourScore)}</TableCell><TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">공동수급(도급사) 구성</h2>
              <Button size="sm" onClick={() => setPartners((x) => [...x, { id: uid(), name: "", share: 0, score: 0 }])}><Plus className="h-4 w-4 mr-1" />도급사 추가</Button>
            </div>
            <div className="md:hidden space-y-2">
              <div className="flex justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">우리회사 {fmt(ourShareN)}%</span><span>{fmt(ourScore)}점 → {fmt(ourScore * ourShareN / 100)}</span></div>
              {partners.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex gap-2"><Input className="h-9 flex-1" placeholder="회사명" value={p.name} onChange={(e) => updP(p.id, { name: e.target.value })} />
                    <Button size="icon" variant="ghost" onClick={() => setPartners((x) => x.filter((y) => y.id !== p.id))}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="grid grid-cols-3 gap-2 items-end text-xs">
                    <div className="space-y-1"><Label className="text-xs">지분율(%)</Label><Input type="number" className="h-9" value={p.share} onChange={(e) => updP(p.id, { share: num(e.target.value) })} /></div>
                    <div className="space-y-1"><Label className="text-xs">PQ점수</Label><Input type="number" className="h-9" value={p.score} onChange={(e) => updP(p.id, { score: num(e.target.value) })} /></div>
                    <div className="text-right pb-2"><div className="text-muted-foreground">반영</div><div className="font-semibold text-sm">{fmt(p.score * p.share / 100)}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>회사명</TableHead><TableHead>지분율(%)</TableHead><TableHead>도급사 PQ점수</TableHead><TableHead>반영 점수</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-medium">우리회사</TableCell><TableCell>{fmt(ourShareN)}</TableCell>
                    <TableCell>{fmt(ourScore)}</TableCell><TableCell>{fmt(ourScore * ourShareN / 100)}</TableCell><TableCell />
                  </TableRow>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><Input className="h-8 min-w-32" value={p.name} onChange={(e) => updP(p.id, { name: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" className="h-8 w-20" value={p.share} onChange={(e) => updP(p.id, { share: num(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" className="h-8 w-24" value={p.score} onChange={(e) => updP(p.id, { score: num(e.target.value) })} /></TableCell>
                      <TableCell>{fmt(p.score * p.share / 100)}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setPartners((x) => x.filter((y) => y.id !== p.id))}><Trash2 className="h-4 w-4 mr-1" />삭제</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {Math.abs(shareSum - 100) > 0.001 && <p className="text-xs text-destructive">지분율 합계가 {fmt(shareSum)}%입니다. 100%가 되도록 맞춰주세요.</p>}
          </Card>

          <Card className="p-6 order-first lg:order-none sticky top-2 z-10 lg:static flex flex-col justify-center items-center text-center bg-primary text-primary-foreground">
            <Trophy className="h-8 w-8 mb-2 opacity-90" />
            <div className="text-sm opacity-90">{projectName || "사업명 미입력"} · {clientKey}</div>
            <div className="text-xs opacity-80 mt-1">최종 PQ 점수</div>
            <div className="text-5xl font-bold my-2 tabular-nums">{fmt(finalScore)}</div>
            <div className="text-xs opacity-80">만점 {fullTotal} · 우리회사 {fmt(ourScore)}점 × {fmt(ourShareN)}%{partners.length ? ` + 도급사 ${partners.length}곳` : ""}</div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
