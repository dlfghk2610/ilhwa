import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // 만료된 임시 계정 정리: 로그인 화면에서도 호출 가능 (만료된 계정만 삭제)
    if (action === "cleanup") {
      const { data: expired } = await admin
        .from("temp_accounts")
        .select("user_id")
        .not("expires_at", "is", null)
        .lte("expires_at", new Date().toISOString());
      let removed = 0;
      for (const row of expired || []) {
        const { data: isAdmin } = await admin.from("user_roles").select("role").eq("user_id", row.user_id).eq("role", "admin").maybeSingle();
        if (isAdmin) continue;
        const { error } = await admin.auth.admin.deleteUser(row.user_id);
        if (!error) removed++;
      }
      return json({ success: true, removed });
    }

    // 이하 관리자 전용
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return json({ error: "관리자만 사용할 수 있습니다" }, 403);

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const label = String(body.label || "").trim().slice(0, 100) || null;
      const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
      if (!EMAIL_RE.test(email) || email.length > 255) return json({ error: "올바른 아이디(이메일)를 입력하세요" }, 400);
      if (password.length < 8 || password.length > 72) return json({ error: "비밀번호는 8자 이상이어야 합니다" }, 400);
      if (expiresAt && Number.isNaN(expiresAt.getTime())) return json({ error: "만료일이 올바르지 않습니다" }, 400);

      const name = label || email.split("@")[0];
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, company: name },
      });
      if (error || !created.user) {
        const msg = error?.message || "계정 생성 실패";
        if (/already|registered|exists/i.test(msg)) return json({ error: "이미 사용 중인 아이디입니다" }, 400);
        if (/weak|pwned|password/i.test(msg)) return json({ error: "비밀번호가 너무 쉽습니다. 다른 비밀번호를 사용하세요" }, 400);
        return json({ error: msg }, 500);
      }
      const uid = created.user.id;
      await admin.from("profiles").update({ approved: true, display_name: name, company: name }).eq("id", uid);
      const { error: tErr } = await admin.from("temp_accounts").insert({
        user_id: uid,
        login_email: email,
        label,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        created_by: userData.user.id,
      });
      if (tErr) {
        await admin.auth.admin.deleteUser(uid);
        return json({ error: tErr.message }, 500);
      }
      return json({ success: true, user_id: uid, email });
    }

    if (action === "extend") {
      const target = String(body.target_user_id || "");
      const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
      if (!target) return json({ error: "target_user_id required" }, 400);
      if (expiresAt && Number.isNaN(expiresAt.getTime())) return json({ error: "만료일이 올바르지 않습니다" }, 400);
      const { error } = await admin.from("temp_accounts").update({ expires_at: expiresAt ? expiresAt.toISOString() : null }).eq("user_id", target);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
