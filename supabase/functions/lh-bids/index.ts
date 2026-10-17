import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// 한국토지주택공사(LH) 입찰공고정보 - 입찰공고일자 기준 목록 조회 (XML)
const API_URL =
  "http://openapi.ebid.lh.or.kr/ebid.com.openapi.service.OpenBidInfoList.dev";

type FetchBody = {
  keyword?: string;
  beginDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  pageNo?: number;
  numOfRows?: number;
};

const toApiDt = (d: string) => d.replaceAll("-", "");

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const getTag = (xml: string, names: string[]): string => {
  for (const name of names) {
    const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    if (m) return decodeXml(m[1]).trim();
  }
  return "";
};

const num = (s: string): number | null => {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return s && !Number.isNaN(n) ? n : null;
};

// "2020/01/10 11:00", "2020-01-10", "20200110" 등 → "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD"
const normDate = (s: string, withTime: boolean) => {
  if (!s) return "";
  const m = s.replace(/[./]/g, "-").match(/(\d{4})-?(\d{2})-?(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?/);
  if (!m) return s;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!withTime) return date;
  return `${date} ${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKeys = [Deno.env.get("LH_API_KEY"), Deno.env.get("G2B_API_KEY")].filter(
      (k, i, a): k is string => !!k && a.indexOf(k) === i,
    );
    if (serviceKeys.length === 0) {
      return new Response(JSON.stringify({ error: "LH API 인증키가 설정되지 않았습니다." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: FetchBody = await req.json().catch(() => ({}));
    const keyword = (body.keyword || "").trim();
    const pageNo = Math.max(1, Number(body.pageNo) || 1);
    const numOfRows = Math.min(100, Math.max(1, Number(body.numOfRows) || 50));

    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const endDate = body.endDate || fmt(today);
    const beginDate = body.beginDate || fmt(new Date(today.getTime() - 30 * 86400000));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return new Response(JSON.stringify({ error: "날짜 형식이 올바르지 않습니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    let lastErr = "";
    let ok = false;
    for (const key of serviceKeys) {
      const params = new URLSearchParams({
        serviceKey: key,
        numOfRows: String(numOfRows),
        pageNo: String(pageNo),
        tndrbidRegDtStart: toApiDt(beginDate),
        tndrbidRegDtEnd: toApiDt(endDate),
      });
      const res = await fetch(`${API_URL}?${params.toString()}`);
      text = await res.text();
      if (text.includes("SERVICE KEY IS NOT REGISTERED")) {
        lastErr = "SERVICE KEY IS NOT REGISTERED";
        continue; // 다음 인증키로 재시도
      }
      ok = true;
      break;
    }

    if (!ok || (text.includes("<resultCode>") && !text.includes("<resultCode>00</resultCode>"))) {
      const msg = getTag(text, ["resultMsg", "returnReasonCode", "errMsg"]) || lastErr || "알 수 없는 오류";
      const hint = lastErr
        ? " 공공데이터포털에서 '한국토지주택공사 입찰공고정보' 서비스 활용신청이 필요합니다."
        : "";
      return new Response(JSON.stringify({ error: `LH API 오류: ${msg}.${hint}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalCount = Number(getTag(text, ["totalCount"])) || 0;
    const itemBlocks = text.match(/<item>[\s\S]*?<\/item>/g) || [];

    let mapped = itemBlocks.map((it) => ({
      bidNtceNo: getTag(it, ["bidNum", "bidNtceNo", "tndrbidNum"]),
      bidNtceOrd: getTag(it, ["bidDegree", "bidNtceOrd"]),
      projectName: getTag(it, ["bidnmKor", "bidNtceNm", "bidNm"]),
      client: "한국토지주택공사",
      demandInstt: getTag(it, ["areaNm", "dminsttNm", "rgnNm"]),
      announcementDate: normDate(getTag(it, ["tndrbidRegDt", "bidNtceDt", "regDt"]), true),
      bidBeginDate: normDate(getTag(it, ["bidBgnDt", "tndrbidBgnDt", "bidStartDtm"]), true),
      bidCloseDate: normDate(getTag(it, ["bidClseDt", "tndrbidClseDt", "bidEndDtm", "tndrbidDdlnDt"]), true),
      openingDate: normDate(getTag(it, ["openDtm", "opengDt", "openDt"]), true),
      estimatedPrice: num(getTag(it, ["expectPrc", "presmptPrce", "prearngerPrc", "designPrc"])),
      budgetAmount: num(getTag(it, ["fdmtlAmt", "asignBdgtAmt"])),
      noticeUrl: getTag(it, ["bidNtceDtlUrl", "bidNtceUrl", "detailUrl"]),
      noticeType: getTag(it, ["cstrtnJobGbNm", "ntceKindNm", "jobGbNm"]),
      contractMethod: getTag(it, ["cntrctCnclsMthdNm", "cntrctMthdNm"]),
      bidMethod: getTag(it, ["bidMthdNm", "tndrbidMthdNm"]),
      region: getTag(it, ["areaNm", "prtcptLmtRgnNm"]),
    }));

    if (keyword) {
      const kw = keyword.toLowerCase();
      mapped = mapped.filter((it) => it.projectName.toLowerCase().includes(kw));
    }

    return new Response(
      JSON.stringify({
        totalCount: totalCount || mapped.length,
        pageNo,
        numOfRows,
        items: mapped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
