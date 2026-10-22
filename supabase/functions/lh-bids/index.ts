import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// 한국토지주택공사(LH) 입찰공고정보_GW - 입찰공고일자 기준 목록 조회 (XML, EUC-KR)
const API_URL = "https://apis.data.go.kr/B552555/OpenBidInfoList/getOpenBidInfo";
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

type FetchBody = {
  keyword?: string;
  beginDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  bidNum?: string;    // 공고번호로 재조회
  numOfRows?: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    if (m) {
      const v = decodeXml(m[1]).trim();
      if (v) return v;
    }
  }
  return "";
};

const num = (s: string): number | null => {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return s && !Number.isNaN(n) ? n : null;
};

// "2026/10/01 15:00", "20261001" → "YYYY-MM-DD HH:mm:ss"
const normDate = (s: string) => {
  if (!s) return "";
  const m = s.replace(/[./]/g, "-").match(/(\d{4})-?(\d{2})-?(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]} ${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
};

// 응답 XML 선언의 인코딩(EUC-KR/UTF-8)에 맞춰 디코딩
const decodeBody = (buf: ArrayBuffer) => {
  const head = new TextDecoder("ascii").decode(buf.slice(0, 120));
  const enc = head.match(/encoding="([^"]+)"/i)?.[1]?.toLowerCase() || "utf-8";
  try {
    return new TextDecoder(enc).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
};

const fetchPage = async (key: string, params: Record<string, string>) => {
  const res = await fetch(`${API_URL}?${new URLSearchParams({ serviceKey: key, ...params })}`);
  return decodeBody(await res.arrayBuffer());
};

const isKeyError = (t: string) =>
  /SERVICE_?KEY_?IS_?NOT_?REGISTERED|SERVICE KEY IS NOT REGISTERED|<returnReasonCode>30</.test(t);
const isOk = (t: string) => t.includes("<resultCode>00</resultCode>");

const mapItem = (it: string) => ({
  bidNtceNo: getTag(it, ["bidNum"]),
  bidNtceOrd: getTag(it, ["bidDegree"]),
  projectName: getTag(it, ["bidnmKor"]),
  client: "한국토지주택공사",
  demandInstt: getTag(it, ["zoneHqCd"]).replace(/\s+/g, ""),
  announcementDate: normDate(getTag(it, ["tndrbidRegDt"])),
  bidBeginDate: normDate(getTag(it, ["tndrdocAcptBgninDtm"])),
  bidCloseDate: normDate(getTag(it, ["tndrdocAcptEndDtm"])),
  openingDate: normDate(getTag(it, ["openDtm"])),
  estimatedPrice: num(getTag(it, ["presmtPrc"])),
  budgetAmount: num(getTag(it, ["fdmtlAmt", "designPrc"])),
  noticeUrl: "",
  noticeType: getTag(it, ["cstrtnJobGbNm"]),
  contractMethod: getTag(it, ["tndrCtrctMedCd"]),
  bidMethod: getTag(it, ["sunjungNm"]),
  region: getTag(it, ["zoneHqCd"]).replace(/\s+/g, ""),
  status: getTag(it, ["bidProgrsStatus"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKeys = [Deno.env.get("LH_API_KEY"), Deno.env.get("G2B_API_KEY")].filter(
      (k, i, a): k is string => !!k && a.indexOf(k) === i,
    );
    if (serviceKeys.length === 0) return json({ error: "LH API 인증키가 설정되지 않았습니다." }, 500);

    const body: FetchBody = await req.json().catch(() => ({}));
    const keyword = (body.keyword || "").trim();
    const bidNum = (body.bidNum || "").replace(/[^0-9]/g, "");

    const today = new Date(Date.now() + 9 * 3600000); // KST
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const endDate = body.endDate || fmt(today);
    const beginDate = body.beginDate ||
      fmt(new Date(today.getTime() - (bidNum ? 365 : 30) * 86400000));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return json({ error: "날짜 형식이 올바르지 않습니다." }, 400);
    }

    const base: Record<string, string> = {
      tndrbidRegDtStart: toApiDt(beginDate),
      tndrbidRegDtEnd: toApiDt(endDate),
    };
    if (bidNum) base.bidNum = bidNum;
    const quick = Number(body.numOfRows) === 1; // 연결 확인용

    // 사용할 인증키 결정 (첫 페이지)
    let key = "";
    let first = "";
    let keyRejected = false;
    for (const k of serviceKeys) {
      first = await fetchPage(k, { ...base, pageNo: "1", numOfRows: quick ? "1" : String(PAGE_SIZE) });
      if (isKeyError(first)) { keyRejected = true; continue; }
      key = k;
      break;
    }

    if (!key || !isOk(first)) {
      const msg = getTag(first, ["resultMsg", "errMsg", "returnAuthMsg"]) || "알 수 없는 오류";
      return json({
        error: keyRejected && !key
          ? "LH API 오류: 인증키가 LH 입찰공고 서비스에 등록되지 않았습니다. 공공데이터포털에서 '한국토지주택공사 입찰공고정보_GW' 활용신청이 필요합니다."
          : `LH API 오류: ${msg}`,
        code: keyRejected && !key ? "KEY_NOT_REGISTERED" : "LH_API_ERROR",
        items: [],
        totalCount: 0,
      });
    }

    const totalCount = Number(getTag(first, ["totalCount"])) || 0;
    const pages = [first];
    if (!quick) {
      const lastPage = Math.min(MAX_PAGES, Math.ceil(totalCount / PAGE_SIZE));
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) =>
          fetchPage(key, { ...base, pageNo: String(i + 2), numOfRows: String(PAGE_SIZE) })),
      );
      pages.push(...rest.filter(isOk));
    }

    let items = pages.flatMap((t) => (t.match(/<item>[\s\S]*?<\/item>/g) || []).map(mapItem));
    if (keyword) {
      const kw = keyword.toLowerCase();
      items = items.filter((it) => it.projectName.toLowerCase().includes(kw));
    }
    // 최근 공고 먼저
    items.sort((a, b) => b.announcementDate.localeCompare(a.announcementDate));

    return json({ totalCount: keyword ? items.length : totalCount, items });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
