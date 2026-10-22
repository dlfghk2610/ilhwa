/** 개찰일시로부터 이 시간이 지나면 개찰완료로 본다 */
export const OPENING_GRACE_MS = 60 * 60 * 1000;

/** 개찰일시 + 1시간이 지났는지 */
export function isPastOpening(openingAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!openingAt) return false;
  const t = new Date(openingAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() >= t + OPENING_GRACE_MS;
}

type Row = { id: string; status: string | null; opening_at: string | null };

/** 자동으로 개찰완료로 옮길 사업 id (직접 진행중으로 되돌린 사업은 제외) */
export function autoOpenTargets(rows: Row[], now: Date = new Date(), keepOngoing: Set<string> = new Set()): string[] {
  return rows
    .filter((r) => r.status !== "개찰완료" && !keepOngoing.has(r.id) && isPastOpening(r.opening_at, now))
    .map((r) => r.id);
}

const keepKey = (userId: string) => `bids_keep_ongoing_v1:${userId}`;

export function loadKeepOngoing(userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(keepKey(userId)) || "[]")); } catch { return new Set(); }
}

export function setKeepOngoing(userId: string | undefined, id: string, keep: boolean) {
  if (!userId) return;
  const s = loadKeepOngoing(userId);
  if (keep) s.add(id); else s.delete(id);
  try { localStorage.setItem(keepKey(userId), JSON.stringify([...s])); } catch { /* ignore */ }
}
