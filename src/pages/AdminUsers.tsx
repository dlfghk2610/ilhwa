import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, X, Trash2, UserPlus, Copy, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import {
  EXPIRY_OPTIONS, ExpiryOption, expiryFromOption, formatExpiry, generateTempPassword, isTempExpired, toLoginEmail, TEMP_EMAIL_DOMAIN,
} from "@/lib/temp-accounts";

type TempInfo = { login_email: string; label: string | null; expires_at: string | null };

type Row = {
  id: string;
  display_name: string | null;
  company: string | null;
  approved: boolean;
  created_at: string;
  is_admin?: boolean;
  temp?: TempInfo;
};

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);

  // 임시 계정 만들기
  const [createOpen, setCreateOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState<ExpiryOption>("7d");
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string; expires_at: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  async function load() {
    setBusy(true);
    const [{ data: profiles, error }, { data: roles }, { data: temps }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, company, approved, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
      supabase.from("temp_accounts").select("user_id, login_email, label, expires_at"),
    ]);
    if (error) toast.error(error.message);
    else {
      const adminIds = new Set((roles || []).map((r) => r.user_id));
      const tempMap = new Map((temps || []).map((t) => [t.user_id, t as TempInfo]));
      setRows((profiles || []).map((p) => ({ ...p, is_admin: adminIds.has(p.id), temp: tempMap.get(p.id) })));
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      // 만료된 임시 계정은 먼저 정리
      const { data } = await supabase.functions.invoke("admin-temp-accounts", { body: { action: "cleanup" } });
      if ((data as any)?.removed > 0) toast.info(`만료된 임시 계정 ${(data as any).removed}개를 삭제했습니다`);
      load();
    })();
  }, [isAdmin]);

  async function setApproved(id: string, approved: boolean) {
    const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(approved ? "승인 처리되었습니다" : "승인이 취소되었습니다");
    load();
  }

  async function deleteUser(id: string, name: string, temp: boolean) {
    const msg = temp ? `임시 계정 ${name}을(를) 삭제하시겠습니까? 이 계정으로 입력한 자료도 함께 삭제될 수 있습니다.` : `${name} 회원을 거절하고 계정을 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { target_user_id: id } });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "삭제 실패"); return; }
    toast.success(temp ? "임시 계정이 삭제되었습니다" : "거절되어 계정이 삭제되었습니다");
    load();
  }

  async function extend(id: string, option: ExpiryOption) {
    const { data, error } = await supabase.functions.invoke("admin-temp-accounts", {
      body: { action: "extend", target_user_id: id, expires_at: expiryFromOption(option) },
    });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "변경 실패"); return; }
    toast.success(option === "none" ? "무기한으로 변경했습니다" : `오늘부터 ${EXPIRY_OPTIONS.find((o) => o.value === option)?.label}로 변경했습니다`);
    load();
  }

  function openCreate() {
    setNewId(`test${Math.floor(1000 + Math.random() * 9000)}`);
    setNewPw(generateTempPassword());
    setNewLabel("");
    setNewExpiry("7d");
    setCreatedInfo(null);
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const email = toLoginEmail(newId);
    if (!email) { toast.error("아이디를 입력하세요"); return; }
    if (newPw.length < 8) { toast.error("비밀번호는 8자 이상이어야 합니다"); return; }
    setCreating(true);
    const expires_at = expiryFromOption(newExpiry);
    const { data, error } = await supabase.functions.invoke("admin-temp-accounts", {
      body: { action: "create", email, password: newPw, label: newLabel, expires_at },
    });
    setCreating(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "생성 실패"); return; }
    toast.success("임시 계정을 만들었습니다");
    setCreatedInfo({ email, password: newPw, expires_at });
    load();
  }

  function copyCreds() {
    if (!createdInfo) return;
    const text = `아이디(이메일): ${createdInfo.email}\n비밀번호: ${createdInfo.password}\n사용기한: ${formatExpiry(createdInfo.expires_at)}`;
    navigator.clipboard.writeText(text).then(() => toast.success("복사했습니다"), () => toast.error("복사 실패"));
  }

  if (loading || isAdmin === null) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const pending = rows.filter((r) => !r.approved);
  const tempCount = rows.filter((r) => r.temp).length;

  return (
    <AppLayout title="회원 승인 관리">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">승인 대기 ({pending.length}명)</h2>
            <span className="text-xs text-muted-foreground">· 임시 계정 {tempCount}개</span>
            <Button size="sm" className="ml-auto" onClick={openCreate}>
              <UserPlus className="h-4 w-4 mr-1" />테스트·임시 계정 만들기
            </Button>
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
                ) : rows.map((r) => {
                  const name = r.display_name || r.company || "-";
                  const expired = r.temp ? isTempExpired(r.temp.expires_at) : false;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{name}</span>
                          {r.is_admin && <Badge variant="outline" className="border-primary/40 text-primary">관리자</Badge>}
                          {r.temp && <Badge variant="secondary">임시</Badge>}
                        </div>
                        {r.temp && (
                          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                            <div>아이디: <span className="font-mono">{r.temp.login_email}</span></div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {expired ? <span className="text-destructive">만료됨</span> : <>사용기한: {formatExpiry(r.temp.expires_at)}</>}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{r.created_at?.slice(0, 10)}</TableCell>
                      <TableCell>
                        {r.approved ? <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">승인됨</Badge> : <Badge variant="destructive">승인 대기</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {r.is_admin ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : r.temp ? (
                            <>
                              <Select onValueChange={(v) => extend(r.id, v as ExpiryOption)}>
                                <SelectTrigger className="h-8 w-[118px] text-xs"><RefreshCw className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="기한 변경" /></SelectTrigger>
                                <SelectContent>
                                  {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="destructive" onClick={() => deleteUser(r.id, name, true)}>
                                <Trash2 className="h-4 w-4 mr-1" />삭제
                              </Button>
                            </>
                          ) : r.approved ? (
                            <Button size="sm" variant="outline" onClick={() => setApproved(r.id, false)}>
                              <X className="h-4 w-4 mr-1" />승인 취소
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => setApproved(r.id, true)}>
                                <ShieldCheck className="h-4 w-4 mr-1" />승인
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteUser(r.id, name, false)}>
                                <Trash2 className="h-4 w-4 mr-1" />거절
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>테스트·임시 계정 만들기</DialogTitle>
            <DialogDescription>
              만든 계정은 승인 없이 바로 로그인할 수 있고, 사용기한이 지나면 로그인이 막히고 자동 삭제됩니다.
            </DialogDescription>
          </DialogHeader>

          {createdInfo ? (
            <div className="space-y-3">
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm space-y-1">
                <div>아이디(이메일): <span className="font-mono font-semibold">{createdInfo.email}</span></div>
                <div>비밀번호: <span className="font-mono font-semibold">{createdInfo.password}</span></div>
                <div>사용기한: {formatExpiry(createdInfo.expires_at)}</div>
              </div>
              <p className="text-xs text-muted-foreground">비밀번호는 이 창을 닫으면 다시 볼 수 없습니다. 지금 복사해 두세요.</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={copyCreds}><Copy className="h-4 w-4 mr-1" />복사</Button>
                <Button variant="outline" onClick={openCreate}>하나 더 만들기</Button>
                <Button onClick={() => setCreateOpen(false)}>닫기</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tmp-label">이름/회사명 (표시용)</Label>
                <Input id="tmp-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="예: 테스트용, 홍길동 체험" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmp-id">아이디</Label>
                <Input id="tmp-id" value={newId} onChange={(e) => setNewId(e.target.value)} required maxLength={200} />
                <p className="text-xs text-muted-foreground">
                  로그인 아이디: <span className="font-mono">{toLoginEmail(newId) || "-"}</span>
                  <br />'@' 없이 입력하면 뒤에 @{TEMP_EMAIL_DOMAIN}이 붙습니다.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmp-pw">비밀번호 (8자 이상)</Label>
                <div className="flex gap-2">
                  <Input id="tmp-pw" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} maxLength={72} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setNewPw(generateTempPassword())} aria-label="비밀번호 새로 만들기">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>사용기한</Label>
                <Select value={newExpiry} onValueChange={(v) => setNewExpiry(v as ExpiryOption)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}만들기
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
