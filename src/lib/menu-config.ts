import { useEffect, useState } from "react";

export type MenuDef = { url: string; title: string; parent?: string };

export const DEFAULT_MENU: MenuDef[] = [
  { url: "/", title: "대시보드" },
  { url: "/bids", title: "입찰참가관리" },
  { url: "/performances", title: "PQ 기술자 실적관리" },
  { url: "/careers", title: "PQ 기술자 경력관리" },
  { url: "/career-highlight", title: "경력증명서 형광펜 표시", parent: "/careers" },
  { url: "/personal-history", title: "PQ 기술자 이력사항" },
  { url: "/overlaps", title: "PQ 기술자 업무중첩도" },
  { url: "/pq-educations", title: "PQ 기술자 교육현황" },
  { url: "/similar-services", title: "PQ 유사용역 (회사실적)" },
  { url: "/pq-dev-records", title: "PQ 개발·투자·활용실적" },
  { url: "/pq-self-eval", title: "PQ 점수 자기평가서" },
  { url: "/pq-forms", title: "PQ 작성양식관리" },
  { url: "/performance-database", title: "실적 데이터베이스 관리" },
  { url: "/external-performance-database", title: "타회사 실적 데이터베이스 관리" },
];

const KEY = "menu_overrides_v1";
const ORDER_KEY = "menu_order_v1";
const EVT = "menu-overrides-changed";
type Overrides = Record<string, { title?: string; parent?: string | null }>;

function load(): Overrides {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function getMenu(): MenuDef[] {
  const o = load();
  let order: string[] = [];
  try { order = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); } catch { /* ignore */ }
  const idx = (u: string) => { const i = order.indexOf(u); return i < 0 ? 1000 + DEFAULT_MENU.findIndex((d) => d.url === u) : i; };
  return [...DEFAULT_MENU].sort((a, b) => idx(a.url) - idx(b.url)).map((m) => {
    const ov = o[m.url] ?? {};
    const parent = ov.parent === undefined ? m.parent : ov.parent || undefined;
    return { url: m.url, title: ov.title?.trim() || m.title, parent: parent && parent !== m.url ? parent : undefined };
  });
}

export function saveMenu(items: MenuDef[]) {
  const o: Overrides = {};
  items.forEach((m) => {
    const d = DEFAULT_MENU.find((x) => x.url === m.url)!;
    const e: Overrides[string] = {};
    if (m.title.trim() && m.title.trim() !== d.title) e.title = m.title.trim();
    if ((m.parent ?? undefined) !== d.parent) e.parent = m.parent ?? null;
    if (Object.keys(e).length) o[m.url] = e;
  });
  localStorage.setItem(KEY, JSON.stringify(o));
  localStorage.setItem(ORDER_KEY, JSON.stringify(items.map((m) => m.url)));
  window.dispatchEvent(new Event(EVT));
}

export function resetMenu() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(ORDER_KEY);
  window.dispatchEvent(new Event(EVT));
}

export function useMenu() {
  const [menu, setMenu] = useState<MenuDef[]>(getMenu);
  useEffect(() => {
    const h = () => setMenu(getMenu());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener("storage", h); };
  }, []);
  return menu;
}
