import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

type Row = {
  id: string;
  display_name: string | null;
  company: string | null;
  approved: boolean;
  created_at: string;
  is_admin?: boolean;
};

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  async function load() {
    setBusy(true);
    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, company, approved, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    if (error) toast.error(error.message);
    else {
      const adminIds = new Set((roles || []).map((r: any) => r.user_id));
      setRows(((profiles as any) || []).map((p: any) => ({ ...p, is_admin: adminIds.has(p.id) })));
    }
    setBusy(false);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function setApproved(id: string, approved: boolean) {
    const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(approved ? "승인 처리되었습니다" : "승인이 취소되었습니다");
    load();
  }

  async function rejectUser(id: string, name: string) {
    if (!confirm(`${name} 회원을 거절하고 계정을 삭제하시겠습니까?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { target_user_id: id } });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "삭제 실패"); return; }
    toast.success("거절되어 계정이 삭제되었습니다");
    load();
  }

  if (loading || isAdmin === null) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const pending = rows.filter((r) => !r.approved);

  return (
    <AppLayout title="회원 승인 관리">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">승인 대기 ({pending.length}명)</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회사명/이름</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {busy ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline text-primary" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">데이터가 없습니다.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.display_name || r.company || "-"}
                      {r.is_admin && <Badge variant="outline" className="ml-2 border-primary/40 text-primary">관리자</Badge>}
                    </TableCell>
                    <TableCell>{r.created_at?.slice(0, 10)}</TableCell>
                    <TableCell>
                      {r.approved ? <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">승인됨</Badge> : <Badge variant="destructive">승인 대기</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {r.is_admin ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : r.approved ? (
                        <Button size="sm" variant="outline" onClick={() => setApproved(r.id, false)}>
                          <X className="h-4 w-4 mr-1" />승인 취소
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setApproved(r.id, true)}>
                            <ShieldCheck className="h-4 w-4 mr-1" />승인
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => rejectUser(r.id, r.display_name || r.company || "이 사용자")}>
                            <Trash2 className="h-4 w-4 mr-1" />거절
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
