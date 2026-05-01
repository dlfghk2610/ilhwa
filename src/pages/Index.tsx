import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Award, Briefcase, Layers, Building2, ArrowRight } from "lucide-react";

const menus = [
  { title: "입찰참가관리", url: "/bids", icon: FileText, table: "bid_participations", desc: "입찰 사업 진행 현황" },
  { title: "PQ 개인별 실적", url: "/performances", icon: Award, table: "personal_performances", desc: "기술자 개별 실적" },
  { title: "PQ 개인별 경력", url: "/careers", icon: Briefcase, table: "personal_careers", desc: "기술자 경력 이력" },
  { title: "업무중첩도", url: "/overlaps", icon: Layers, table: "technician_overlaps", desc: "기술자별 참여 일정" },
  { title: "유사용역(회사실적)", url: "/similar-services", icon: Building2, table: "similar_services", desc: "회사 누적 실적" },
];

export default function Index() {
  const [counts, setCounts] = useState<Record<string, number>>({});

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

  return (
    <AppLayout title="대시보드">
      <div className="space-y-6">
        <div className="rounded-xl gradient-primary p-6 text-primary-foreground shadow-elevated">
          <h2 className="text-2xl font-bold">엔지니어링 PQ Manager</h2>
          <p className="mt-1 text-primary-foreground/80">사업수행능력평가 데이터를 한 곳에서 관리하세요</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {menus.map((m) => (
            <Link key={m.url} to={m.url}>
              <Card className="hover:shadow-elevated transition-shadow cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{m.title}</CardTitle>
                  <m.icon className="h-5 w-5 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{counts[m.table] ?? "-"}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></div>
                  <div className="flex items-center justify-between mt-2">
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
