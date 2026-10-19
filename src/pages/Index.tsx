import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, CalendarClock, Building2, ImagePlus, RotateCcw, Move, ZoomIn, ZoomOut, Check } from "lucide-react";
import { toast } from "sonner";
import { DashboardBackground } from "@/components/DashboardBackground";
import { BidParticipationBadge } from "@/components/BidParticipation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const BG_KEY = "dashboard_bg_v1";
const BG_TF_KEY = "dashboard_bg_tf_v1";
type BgTransform = { scale: number; x: number; y: number };
const DEFAULT_TF: BgTransform = { scale: 1, x: 0, y: 0 };
const loadTf = (): BgTransform => {
  try {
    const raw = localStorage.getItem(BG_TF_KEY);
    if (!raw) return DEFAULT_TF;
    const p = JSON.parse(raw);
    return { scale: Number(p.scale) || 1, x: Number(p.x) || 0, y: Number(p.y) || 0 };
  } catch { return DEFAULT_TF; }
};

const fmtDT = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type UpcomingBid = { id: string; project_name: string; client: string | null; bid_end_at: string | null; opening_at: string | null; participation_type: string | null };

const fileToCompressedDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1920;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });

const srgbLuma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const hslLuma = (spec: string): number | null => {
  const m = spec.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return srgbLuma(ch(0), ch(8), ch(4));
};

const imageLuma = (src: string): Promise<number | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 24;
      c.height = 24;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += srgbLuma(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      resolve(sum / (d.length / 4));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

export default function Index() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState<string>("");
  const [upcomingOpenings, setUpcomingOpenings] = useState<UpcomingBid[]>([]);
  const [bgUrl, setBgUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(BG_KEY); } catch { return null; }
  });
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgTf, setBgTf] = useState<BgTransform>(loadTf);
  const [adjusting, setAdjusting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const saveTf = (tf: BgTransform) => {
    setBgTf(tf);
    try { localStorage.setItem(BG_TF_KEY, JSON.stringify(tf)); } catch { /* ignore */ }
  };
  const zoomBy = (delta: number) =>
    saveTf({ ...bgTf, scale: Math.min(5, Math.max(1, Math.round((bgTf.scale + delta) * 100) / 100)) });
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (!adjusting) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: bgTf.x, baseY: bgTf.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    saveTf({ ...bgTf, x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) });
  };
  const onBgPointerUp = () => { dragRef.current = null; };

  useEffect(() => {
    document.documentElement.setAttribute("data-dash-bg", bgUrl ? "1" : "0");
    return () => document.documentElement.removeAttribute("data-dash-bg");
  }, [bgUrl]);

  // 배경(사진 또는 화면 바탕색)이 연한지 진한지 측정해 히어로 글자색을 고른다
  useEffect(() => {
    const root = document.documentElement;
    const ref = { current: null as number | null };
    const apply = () => {
      const cs = getComputedStyle(root);
      const base = ref.current ?? hslLuma(cs.getPropertyValue("--background")) ?? 0.95;
      const prim = hslLuma(cs.getPropertyValue("--primary")) ?? 0.3;
      root.setAttribute("data-dash-hero", base * 0.75 + prim * 0.25 < 0.34 ? "dark" : "light");
    };
    let alive = true;
    if (bgUrl) imageLuma(bgUrl).then((l) => { if (alive) { ref.current = l; apply(); } });
    else apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => { alive = false; mo.disconnect(); };
  }, [bgUrl]);


  useEffect(() => {
    (async () => {
      const now = new Date();
      const in7days = new Date(now.getTime() + 7 * 86400000);
      const { data } = await (supabase as any)
        .from("bid_participations")
        .select("id, project_name, client, bid_end_at, opening_at, participation_type")
        .not("bid_end_at", "is", null)
        .lte("bid_end_at", in7days.toISOString())
        .order("bid_end_at", { ascending: true });
      const filtered = ((data || []) as UpcomingBid[]).filter((b) => {
        const ref = b.opening_at || b.bid_end_at;
        if (!ref) return false;
        const refDate = new Date(ref);
        // 개찰일(없으면 입찰마감일)의 다음달 1일부터는 숨김
        const cutoff = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
        return now < cutoff;
      });
      setUpcomingOpenings(filtered);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("company, display_name").eq("id", user.id).maybeSingle();
      setCompanyName(data?.company || data?.display_name || user.email?.split("@")[0] || "");
    })();
  }, [user]);

  const handleBgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      localStorage.setItem(BG_KEY, dataUrl);
      setBgUrl(dataUrl);
      toast.success("대시보드 배경 이미지를 설정했습니다.");
    } catch {
      toast.error("이미지를 저장하지 못했습니다. 다른 이미지를 시도해 주세요.");
    }
  };

  const clearBg = () => {
    try { localStorage.removeItem(BG_KEY); } catch { /* ignore */ }
    setBgUrl(null);
  };

  return (
    <AppLayout title="대시보드" headerActions={
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="대시보드 배경 설정" title="대시보드 배경 설정">
            <ImagePlus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-4">
          <h2 className="text-sm font-semibold">대시보드 배경 설정</h2>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => bgInputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />배경 이미지 {bgUrl ? "변경" : "설정"}
          </Button>
          {bgUrl && <>
            <div className="flex items-center justify-between">
              <span className="text-sm">확대·축소</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="축소" title="축소" disabled={bgTf.scale <= 1} onClick={() => zoomBy(-0.1)}><ZoomOut className="h-4 w-4" /></Button>
                <span className="w-12 text-center text-xs tabular-nums">{Math.round(bgTf.scale * 100)}%</span>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="확대" title="확대" disabled={bgTf.scale >= 5} onClick={() => zoomBy(0.1)}><ZoomIn className="h-4 w-4" /></Button>
              </div>
            </div>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => { setAdjusting(!adjusting); setSettingsOpen(false); }}>
              {adjusting ? <Check className="h-4 w-4" /> : <Move className="h-4 w-4" />}{adjusting ? "배경 조정 완료" : "배경 위치 이동"}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => saveTf(DEFAULT_TF)}><RotateCcw className="h-4 w-4" />위치·크기 초기화</Button>
            <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={() => { clearBg(); saveTf(DEFAULT_TF); setAdjusting(false); }}><RotateCcw className="h-4 w-4" />배경 이미지 삭제</Button>
          </>}
        </PopoverContent>
      </Popover>
    }>
      <div className="relative flow-root space-y-6">
        <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgChange} />
        {bgUrl && (
          <>
            <DashboardBackground
              url={bgUrl}
              transform={bgTf}
              adjusting={adjusting}
              onPointerDown={onBgPointerDown}
              onPointerMove={onBgPointerMove}
              onPointerUp={onBgPointerUp}
            />
            <div className="fixed inset-0 z-0 bg-background/10 pointer-events-none" aria-hidden />
            {adjusting && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/85 backdrop-blur px-3 py-2 shadow-elevated">
                <Button variant="outline" size="icon" aria-label="축소" title="축소" className="h-8 w-8 rounded-full" onClick={() => zoomBy(-0.1)} disabled={bgTf.scale <= 1}>
                  <ZoomOut />
                </Button>
                <span className="text-xs font-medium w-12 text-center tabular-nums">{Math.round(bgTf.scale * 100)}%</span>
                <Button variant="outline" size="icon" aria-label="확대" title="확대" className="h-8 w-8 rounded-full" onClick={() => zoomBy(0.1)} disabled={bgTf.scale >= 5}>
                  <ZoomIn />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => saveTf(DEFAULT_TF)}>
                  위치 초기화
                </Button>
                <Button size="sm" className="h-8 rounded-full text-xs" onClick={() => setAdjusting(false)}>
                  완료
                </Button>
              </div>
            )}
          </>
        )}

        <div className="dash-hero relative z-10 rounded-xl p-6 shadow-elevated">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold">PQ</h2>
              <p className="dash-hero-sub mt-1">사업수행능력평가 관리</p>
            </div>
            {companyName && (
              <div className="dash-hero-chip flex items-center gap-2 rounded-lg backdrop-blur px-4 py-2.5">
                <Building2 className="h-5 w-5" />
                <div className="leading-tight">
                  <div className="dash-hero-sub text-[11px] uppercase tracking-wider">접속회사</div>
                  <div className="text-base font-bold">{companyName}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <Card className="relative z-10 shadow-card bg-card/25 backdrop-blur-md border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-accent" />
              다가오는 입찰 및 개찰예정사업
            </CardTitle>
            <Link to="/bids" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              전체보기 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {upcomingOpenings.length === 0 ? (
              <p className="text-sm text-muted-foreground">예정된 입찰/개찰이 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {upcomingOpenings.map((b) => (
                  <li key={b.id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="mb-1"><BidParticipationBadge value={b.participation_type} /></div>
                      <div className="font-medium break-words">{b.project_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.client || "-"}</div>
                    </div>
                    <div className="text-xs whitespace-nowrap space-y-0.5 sm:text-right">
                      <div><span className="text-muted-foreground">입찰마감 </span><span className="font-medium text-destructive">{fmtDT(b.bid_end_at)}</span></div>
                      <div><span className="text-muted-foreground">개찰일시 </span><span className="font-medium text-primary">{fmtDT(b.opening_at)}</span></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
