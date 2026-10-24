// 입찰 사업의 링크(불러온 공고 링크 + 직접 넣은 링크) 처리

const NOTICE_LINK_RE = /^\s*공고링크:\s*(\S+)\s*$/m;

/** 비고에 기록된 나라장터 공고 링크를 꺼낸다 */
export const noticeLinkFromNotes = (notes: string | null | undefined): string | null => {
  const m = (notes || "").match(NOTICE_LINK_RE);
  return m ? normalizeUrl(m[1]) : null;
};

/** 링크 버튼으로 따로 보여주므로 비고에서는 공고링크 줄을 뺀다 */
export const notesWithoutLink = (notes: string | null | undefined): string =>
  (notes || "").split("\n").filter((l) => !NOTICE_LINK_RE.test(l)).join("\n").trim();

/** 사용자가 입력한 주소를 열 수 있는 http(s) 주소로 바꾼다. 주소가 아니면 null */
export const normalizeUrl = (input: string): string | null => {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
};

/** 링크 목록에 추가 (같은 주소는 중복 추가하지 않음) */
export const addLink = (links: string[], input: string): string[] | null => {
  const url = normalizeUrl(input);
  if (!url) return null;
  return links.includes(url) ? links : [...links, url];
};

export const linkHost = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};
