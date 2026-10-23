import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isTempExpired } from "@/lib/temp-accounts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// 임시 계정 만료 여부를 사용자별로 한 번만 확인 (페이지 이동마다 다시 조회하지 않음)
const tempExpiry = new Map<string, string | null>();

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = (expiresAt: string | null) => {
      if (cancelled || !isTempExpired(expiresAt)) return;
      setExpired(true);
      supabase.auth.signOut();
      toast.error("사용기한이 지난 임시 계정입니다. 관리자에게 문의해주세요.");
    };
    if (tempExpiry.has(user.id)) {
      check(tempExpiry.get(user.id) ?? null);
    } else {
      supabase.from("temp_accounts").select("expires_at").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        tempExpiry.set(user.id, data?.expires_at ?? null);
        check(data?.expires_at ?? null);
      });
    }
    return () => { cancelled = true; };
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user || expired) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};
