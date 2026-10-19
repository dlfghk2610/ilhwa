import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// 나라장터 입찰공고정보서비스(용역) - 조달청 검색조건 입찰공고목록
const API_URL =
  "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch";

type FetchBody = {
  keyword?: string;
  beginDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  pageNo?: number;
  numOfRows?: number;
};

const toApiDt = (d: string, endOfDay: boolean) =>
  d.replaceAll("-", "") + (endOfDay ? "2359" : "0000");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("G2B_API_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "API 인증키가 설정되지 않았습니다." }), {
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
    const beginDate =
      body.beginDate || fmt(new Date(today.getTime() - 30 * 86400000));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return new Response(JSON.stringify({ error: "날짜 형식이 올바르지 않습니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      serviceKey,
      type: "json",
      inqryDiv: "1", // 공고일시 기준
      inqryBgnDt: toApiDt(beginDate, false),
      inqryEndDt: toApiDt(endDate, true),
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
    });
    if (keyword) params.set("bidNtceNm", keyword);
    // 공고번호로 단건 재조회 (새로고침용)
    const bidNo = String((body as any).bidNtceNo || "").trim();
    if (/^[A-Za-z0-9-]{4,40}$/.test(bidNo)) {
      params.set("inqryDiv", "2");
      params.set("bidNtceNo", bidNo);
      params.delete("inqryBgnDt");
      params.delete("inqryEndDt");
      params.delete("bidNtceNm");
    }

    const url = params.get("inqryDiv") === "2" ? API_URL.replace("ServcPPSSrch", "Servc") : API_URL;
    const res = await fetch(`${url}?${params.toString()}`);
    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: "조달청 API 응답을 해석할 수 없습니다.", detail: text.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const header = json?.response?.header;
    if (header && header.resultCode !== "00") {
      return new Response(
        JSON.stringify({ error: `조달청 API 오류: ${header.resultMsg || header.resultCode}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bodyData = json?.response?.body || {};
    let items = bodyData.items || [];
    if (!Array.isArray(items)) items = [items];

    const mapped = items.map((it: any) => ({
      bidNtceNo: it.bidNtceNo ?? "",
      bidNtceOrd: it.bidNtceOrd ?? "",
      projectName: it.bidNtceNm ?? "",
      client: it.ntceInsttNm ?? it.dminsttNm ?? "",
      demandInstt: it.dminsttNm ?? "",
      announcementDate: it.bidNtceDt ?? "",     // "YYYY-MM-DD HH:mm:ss"
      bidBeginDate: it.bidBeginDt ?? it.bidBgnDt ?? "",
      pqDueDate: it.pqApplDocRcptDt ?? "",
      bidCloseDate: it.bidClseDt ?? "",
      openingDate: it.opengDt ?? "",
      estimatedPrice: it.presmptPrce ? Number(it.presmptPrce) : null,
      budgetAmount: it.asignBdgtAmt ? Number(it.asignBdgtAmt) : null,
      noticeUrl: it.bidNtceDtlUrl ?? it.bidNtceUrl ?? "",
      noticeType: it.ntceKindNm ?? "",
      contractMethod: it.cntrctCnclsMthdNm ?? "",
      bidMethod: it.bidMethdNm ?? "",
      region: it.prtcptLmtRgnNm ?? "",
    }));

    return new Response(
      JSON.stringify({
        totalCount: Number(bodyData.totalCount) || mapped.length,
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
