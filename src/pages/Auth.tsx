import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력하세요").max(255),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다").max(72),
});

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  // displayName 입력값은 회사명으로 사용됩니다
  const [autoLogin, setAutoLogin] = useState<boolean>(() => localStorage.getItem("pq-auto-login") !== "0");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedEmail = z.string().trim().email("올바른 이메일을 입력하세요").safeParse(forgotEmail);
    if (!parsedEmail.success) { toast.error(parsedEmail.error.errors[0].message); return; }
    setForgotSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("비밀번호 재설정 메일을 발송했습니다. 메일함을 확인해주세요.");
    setForgotOpen(false);
    setForgotEmail("");
  };

  const applyAutoLoginPref = (checked: boolean) => {
    localStorage.setItem("pq-auto-login", checked ? "1" : "0");
    if (checked) {
      localStorage.removeItem("pq-session-only");
    } else {
      localStorage.setItem("pq-session-only", "1");
    }
    sessionStorage.setItem("pq-tab-alive", "1");
  };

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setSubmitting(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setSubmitting(false); toast.error(error.message); return; }
    // 관리자 승인 여부 확인
    const uid = signInData.user?.id;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("approved").eq("id", uid).maybeSingle();
      if (!prof?.approved) {
        await supabase.auth.signOut();
        setSubmitting(false);
        toast.error("관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.");
        return;
      }
    }
    setSubmitting(false);
    applyAutoLoginPref(autoLogin); toast.success("로그인 성공"); navigate("/");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setSubmitting(true);
    const companyName = displayName || email.split("@")[0];
    const { data: signUpData, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: companyName, company: companyName },
      },
    });
    if (error) {
      setSubmitting(false);
      const code = (error as any).code;
      if (code === "weak_password") {
        toast.error("비밀번호가 너무 약하거나 유출된 적이 있습니다. 대문자/숫자/특수문자를 조합한 더 복잡한 비밀번호를 사용해주세요.");
      } else if (code === "user_already_exists" || error.message.includes("already")) {
        toast.error("이미 가입된 이메일입니다. 로그인 탭을 이용해주세요.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    // profiles.company 동기화
    if (signUpData?.user) {
      await supabase.from("profiles").update({ company: companyName }).eq("id", signUpData.user.id);
    }
    // 승인 여부 확인 (관리자/첫 가입자는 자동 승인)
    let approved = false;
    if (signUpData?.user) {
      const { data: prof } = await supabase.from("profiles").select("approved").eq("id", signUpData.user.id).maybeSingle();
      approved = !!prof?.approved;
    }
    setSubmitting(false);
    if (!approved) {
      await supabase.auth.signOut();
      toast.success("회원가입이 접수되었습니다. 관리자의 승인 후 로그인할 수 있습니다.");
      return;
    }
    applyAutoLoginPref(autoLogin); toast.success("회원가입 완료. 로그인되었습니다."); navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg gradient-primary text-primary-foreground font-bold text-lg">PQ</div>
          <CardTitle className="text-2xl">엔지니어링 PQ Manager</CardTitle>
          <CardDescription>사업수행능력평가 통합 관리 시스템</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">로그인</TabsTrigger>
              <TabsTrigger value="signup">회원가입</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">이메일</Label>
                  <Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pw">비밀번호</Label>
                  <Input id="si-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="auto-login" checked={autoLogin} onCheckedChange={(c) => setAutoLogin(c === true)} />
                  <Label htmlFor="auto-login" className="text-sm font-normal cursor-pointer">자동로그인</Label>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}로그인
                </Button>
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                  <span>아이디(이메일)를 잊으셨나요? 가입 시 사용한 이메일을 확인해주세요.</span>
                  <button type="button" className="text-primary hover:underline font-medium" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}>
                    비밀번호 찾기
                  </button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">회사명</Label>
                  <Input id="su-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="(주)○○엔지니어링" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">이메일</Label>
                  <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">비밀번호 (8자 이상, 흔하지 않은 비밀번호)</Label>
                  <Input id="su-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}회원가입
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
