import { useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    (async () => {
      // 자동로그인 미체크 시: 새 탭/브라우저 재시작이면 세션 종료
      const sessionOnly = localStorage.getItem("pq-session-only") === "1";
      const tabAlive = sessionStorage.getItem("pq-tab-alive") === "1";
      if (sessionOnly && !tabAlive) {
        await supabase.auth.signOut();
        localStorage.removeItem("pq-session-only");
      }
      sessionStorage.setItem("pq-tab-alive", "1");
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    })();
    return () => subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
