import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Award, Briefcase, Layers, Building2, ArrowRight, CalendarClock, User, GraduationCap, FlaskConical } from "lucide-react";

const menus = [
  { title: "입찰참가관리", url: "/bids", icon: FileText, table: "bid_participations", desc: "입찰 사업 진행 현황" },
  { title: "PQ 기술자 실적관리", url: "/performances", icon: Award, table: "personal_performances", desc: "기술자 개별 실적" },
  { title: "PQ 기술자 경력관리", url: "/careers", icon: Briefcase, table: "personal_careers", desc: "기술자 경력 이력" },
  { title: "PQ 기술자 이력사항", url: "/personal-history", icon: User, table: "personal_profiles", desc: "기술자 프로필/근무처/자격" },
  { title: "PQ 기술자 업무중첩도", url: "/overlaps", icon: Layers, table: "technician_overlaps", desc: "기술자별 참여 일정" },
  { title: "PQ 기술자 교육현황", url: "/pq-educations", icon: GraduationCap, table: "pq_educations", desc: "기술자 교육 이수 현황" },
  { title: "PQ 유사용역 (회사실적)", url: "/similar-services", icon: Building2, table: "similar_services", desc: "회사 누적 실적" },
  { title: "PQ 개발·투자·활용실적", url: "/pq-dev-records", icon: FlaskConical, table: "pq_dev_records", desc: "개발/투자/활용 실적" },
];

const fmtDT = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type UpcomingBid = { id: string; project_name: string; client: string | null; bid_end_at: string | null; opening_at: string | null };

export default function Index() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [companyName, setCompanyName] = useState<string>("");
  const [upcomingOpenings, setUpcomingOpenings] = useState<UpcomingBid[]>([]);

  useEffect(() => {
    (async () => {
      const result: Record<string, number> = {};
      await Promise.all(menus.map(async (m) => {
        const { count } = await (supabase as any).from(m.table).select("*", { count: "exact", head: true });
        result[m.table] = count ?? 0;
      }));
      setCounts(result);
    })();
  }, []);

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

  return (
    <AppLayout title="대시보드">
      <div className="space-y-6">
        <div className="rounded-xl gradient-primary p-6 text-primary-foreground shadow-elevated">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold">엔지니어링 PQ Manager</h2>
              <p className="mt-1 text-primary-foreground/80">사업수행능력평가 데이터를 한 곳에서 관리하세요</p>
            </div>
            {companyName && (
              <div className="flex items-center gap-2 rounded-lg bg-primary-foreground/15 backdrop-blur px-4 py-2.5 border border-primary-foreground/20">
                <Building2 className="h-5 w-5" />
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wider text-primary-foreground/70">접속 회사</div>
                  <div className="text-base font-bold">{companyName}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <Card className="shadow-card">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {menus.map((m) => (
            <Link key={m.url} to={m.url}>
              <Card className="hover:shadow-elevated transition-shadow cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{m.title}</CardTitle>
                  <m.icon className="h-5 w-5 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
