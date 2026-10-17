import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, CalendarClock, Building2, ImagePlus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const BG_KEY = "dashboard_bg_v1";

const fmtDT = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type UpcomingBid = { id: string; project_name: string; client: string | null; bid_end_at: string | null; opening_at: string | null };

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

export default function Index() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState<string>("");
  const [upcomingOpenings, setUpcomingOpenings] = useState<UpcomingBid[]>([]);
  const [bgUrl, setBgUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(BG_KEY); } catch { return null; }
  });
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-dash-bg", bgUrl ? "1" : "0");
    return () => document.documentElement.removeAttribute("data-dash-bg");
  }, [bgUrl]);


  useEffect(() => {
    (async () => {
      const now = new Date();
      const in7days = new Date(now.getTime() + 7 * 86400000);
      const { data } = await (supabase as any)
        .from("bid_participations")
        .select("id, project_name, client, bid_end_at, opening_at")
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
    <AppLayout title="대시보드">
      <div className="relative space-y-6">
        {bgUrl && (
          <>
            <div
              className="fixed inset-0 z-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bgUrl})` }}
              aria-hidden
            />
            <div className="fixed inset-0 z-0 bg-background/30" aria-hidden />

          </>
        )}
        <div className="relative z-10 flex justify-end gap-2">
          <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgChange} />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => bgInputRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" />
            배경 이미지 {bgUrl ? "변경" : "설정"}
          </Button>
          {bgUrl && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearBg}>
              <RotateCcw className="h-3.5 w-3.5" />
              배경 초기화
            </Button>
          )}
        </div>

        <div className="relative z-10 rounded-xl gradient-primary p-6 text-primary-foreground shadow-elevated">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold">PQ</h2>
              <p className="mt-1 text-primary-foreground/80">사업수행능력평가 관리</p>
            </div>
            {companyName && (
              <div className="flex items-center gap-2 rounded-lg bg-primary-foreground/15 backdrop-blur px-4 py-2.5 border border-primary-foreground/20">
                <Building2 className="h-5 w-5" />
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wider text-primary-foreground/70">접속회사</div>
                  <div className="text-base font-bold">{companyName}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <Card className="relative z-10 shadow-card">
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
