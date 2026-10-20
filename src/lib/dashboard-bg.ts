import { supabase } from "@/integrations/supabase/client";

export const DASH_BG_BUCKET = "dashboard-backgrounds";
export type BgTransform = { scale: number; x: number; y: number };
export type BgDevice = "pc" | "mobile";
export type BgTransforms = Partial<Record<BgDevice, BgTransform>>;
export const DEFAULT_TF: BgTransform = { scale: 1, x: 0, y: 0 };

/** 768px 미만은 모바일, 그 이상은 PC로 본다 (화면 크기가 달라 위치·크기는 기기 종류별로 따로 저장). */
export const deviceForWidth = (width: number): BgDevice => (width < 768 ? "mobile" : "pc");

const toTf = (v: unknown): BgTransform | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  const scale = Math.min(5, Math.max(1, Number(p.scale) || 1));
  return { scale, x: Number(p.x) || 0, y: Number(p.y) || 0 };
};

export const parseTransforms = (raw: unknown): BgTransforms => {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: BgTransforms = {};
  const pc = toTf(r.pc);
  const mobile = toTf(r.mobile);
  if (pc) out.pc = pc;
  if (mobile) out.mobile = mobile;
  return out;
};

export const transformFor = (all: BgTransforms, device: BgDevice): BgTransform => all[device] ?? DEFAULT_TF;

/** 이 계정의 배경을 이 기기에 저장해 두는 키 — 계정마다 분리된다. */
export const bgCacheKey = (userId: string) => `dashboard_bg_cache_v2:${userId}`;

/** 예전에 계정 구분 없이 기기에 저장되던 배경 (다른 계정에도 같은 배경이 뜨던 원인). */
export const LEGACY_BG_KEYS = ["dashboard_bg_v1", "dashboard_bg_tf_v1"];

const readCache = (userId: string): { path: string; dataUrl: string } | null => {
  try {
    const raw = localStorage.getItem(bgCacheKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.path === "string" && typeof p?.dataUrl === "string" ? p : null;
  } catch { return null; }
};
const writeCache = (userId: string, path: string | null, dataUrl?: string) => {
  try {
    if (!path || !dataUrl) localStorage.removeItem(bgCacheKey(userId));
    else localStorage.setItem(bgCacheKey(userId), JSON.stringify({ path, dataUrl }));
  } catch { /* 저장 공간 부족 시 캐시 없이 동작 */ }
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export type LoadedBg = { path: string | null; dataUrl: string | null; transforms: BgTransforms };

export async function loadAccountBg(userId: string): Promise<LoadedBg> {
  const { data, error } = await supabase
    .from("profiles")
    .select("dashboard_bg_path, dashboard_bg_tf")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const path = data?.dashboard_bg_path ?? null;
  const transforms = parseTransforms(data?.dashboard_bg_tf);
  if (!path) { writeCache(userId, null); return { path: null, dataUrl: null, transforms }; }
  const cached = readCache(userId);
  if (cached?.path === path) return { path, dataUrl: cached.dataUrl, transforms };
  const { data: blob, error: dlErr } = await supabase.storage.from(DASH_BG_BUCKET).download(path);
  if (dlErr || !blob) throw dlErr ?? new Error("download failed");
  const dataUrl = await blobToDataUrl(blob);
  writeCache(userId, path, dataUrl);
  return { path, dataUrl, transforms };
}

/** 캐시에 있는 이 계정의 배경을 즉시 보여주기 위해 사용. */
export const cachedAccountBg = (userId: string) => readCache(userId);

export async function uploadAccountBg(userId: string, dataUrl: string, oldPath: string | null): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/bg-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(DASH_BG_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ dashboard_bg_path: path, dashboard_bg_tf: {} })
    .eq("id", userId);
  if (upErr) {
    await supabase.storage.from(DASH_BG_BUCKET).remove([path]);
    throw upErr;
  }
  if (oldPath && oldPath !== path) await supabase.storage.from(DASH_BG_BUCKET).remove([oldPath]);
  writeCache(userId, path, dataUrl);
  return path;
}

export async function clearAccountBg(userId: string, path: string | null) {
  const { error } = await supabase
    .from("profiles")
    .update({ dashboard_bg_path: null, dashboard_bg_tf: {} })
    .eq("id", userId);
  if (error) throw error;
  if (path) await supabase.storage.from(DASH_BG_BUCKET).remove([path]);
  writeCache(userId, null);
}

export async function saveAccountTransforms(userId: string, transforms: BgTransforms) {
  const { error } = await supabase
    .from("profiles")
    .update({ dashboard_bg_tf: transforms })
    .eq("id", userId);
  if (error) throw error;
}
