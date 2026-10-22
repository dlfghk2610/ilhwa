/** 개찰일시로부터 이 시간이 지나면 개찰완료로 본다 */
export const OPENING_GRACE_MS = 60 * 60 * 1000;

/** 개찰일시 + 1시간이 지났는지 */
export function isPastOpening(openingAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!openingAt) return false;
  const t = new Date(openingAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() >= t + OPENING_GRACE_MS;
}

/**
 * 개찰완료로 볼 사업인지: 입찰참가시작일이 있고 개찰일시 + 1시간이 지났을 때만.
 * 입찰참가시작일이 없으면 PQ 제출기한이 입찰마감·개찰일시로 들어간 경우일 수 있어 진행중으로 둔다.
 */
export function isOpenedBid(
  row: { bid_start_date?: string | null; opening_at: string | null },
  now: Date = new Date(),
): boolean {
  if (!row.bid_start_date || !String(row.bid_start_date).trim()) return false;
  return isPastOpening(row.opening_at, now);
}

type Row = { id: string; status: string | null; opening_at: string | null; bid_start_date?: string | null };

/** 자동으로 개찰완료로 옮길 사업 id (직접 진행중으로 되돌린 사업은 제외) */
export function autoOpenTargets(rows: Row[], now: Date = new Date(), keepOngoing: Set<string> = new Set()): string[] {
  return rows
    .filter((r) => r.status !== "개찰완료" && !keepOngoing.has(r.id) && isOpenedBid(r, now))
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
