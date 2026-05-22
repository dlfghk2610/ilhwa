// Bid deadline notification dispatcher
// Triggered by pg_cron every 5 minutes. Sends SMS (Solapi) + email (if configured)
// for bids whose deadline window has been entered and notified_at is null.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildSolapiAuth(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const signature = await hmacSha256Hex(apiSecret, date + salt);
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, "");
}

async function sendSms(opts: {
  to: string;
  from: string;
  text: string;
  apiKey: string;
  apiSecret: string;
}) {
  const auth = await buildSolapiAuth(opts.apiKey, opts.apiSecret);
  const res = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        to: normalizePhone(opts.to),
        from: normalizePhone(opts.from),
        text: opts.text,
      },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Solapi ${res.status}: ${body}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SOLAPI_KEY = Deno.env.get("SOLAPI_API_KEY");
  const SOLAPI_SECRET = Deno.env.get("SOLAPI_API_SECRET");
  const SOLAPI_FROM = Deno.env.get("SOLAPI_SENDER_PHONE");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();

  // Pull candidate rows: have deadline, not yet notified, status not 종료
  const { data: bids, error } = await supabase
    .from("bid_participations")
    .select(
      "id, project_name, client, bid_end_at, notify_hours_before, notify_browser, notify_email, notify_phone, notified_at, status",
    )
    .is("notified_at", null)
    .not("bid_end_at", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const b of bids ?? []) {
    const endAt = new Date(b.bid_end_at as string);
    const hours = b.notify_hours_before ?? 24;
    const triggerAt = new Date(endAt.getTime() - hours * 3600 * 1000);
    if (now < triggerAt) continue; // not yet
    if (now > endAt) {
      // already past deadline; mark as notified to avoid future spam but don't send
      await supabase
        .from("bid_participations")
        .update({ notified_at: now.toISOString() })
        .eq("id", b.id);
      results.push({ id: b.id, skipped: "past_deadline" });
      continue;
    }

    const msLeft = endAt.getTime() - now.getTime();
    const hoursLeft = Math.round(msLeft / 3600000);
    const text =
      `[입찰마감 알림]\n사업: ${b.project_name}\n` +
      (b.client ? `발주처: ${b.client}\n` : "") +
      `마감: ${endAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n` +
      `남은시간: 약 ${hoursLeft}시간`;

    const log: any = { id: b.id, sms: null, email: null };

    // SMS
    if (b.notify_phone && SOLAPI_KEY && SOLAPI_SECRET && SOLAPI_FROM) {
      try {
        await sendSms({
          to: b.notify_phone,
          from: SOLAPI_FROM,
          text,
          apiKey: SOLAPI_KEY,
          apiSecret: SOLAPI_SECRET,
        });
        log.sms = "sent";
      } catch (e) {
        log.sms = `error: ${(e as Error).message}`;
      }
    }

    // Email via transactional-email function (if scaffolded)
    if (b.notify_email) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({
            templateName: "bid-deadline-alert",
            recipientEmail: b.notify_email,
            idempotencyKey: `bid-alert-${b.id}`,
            templateData: {
              projectName: b.project_name,
              client: b.client,
              deadline: endAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
              hoursLeft,
            },
          }),
        });
        log.email = r.ok ? "sent" : `error: ${r.status}`;
      } catch (e) {
        log.email = `error: ${(e as Error).message}`;
      }
    }

    await supabase
      .from("bid_participations")
      .update({ notified_at: now.toISOString() })
      .eq("id", b.id);

    results.push(log);
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
