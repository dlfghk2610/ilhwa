// 관리자가 만드는 테스트/임시 계정 규칙

export const TEMP_EMAIL_DOMAIN = "pq-test.local";

export type ExpiryOption = "1d" | "7d" | "30d" | "none";

export const EXPIRY_OPTIONS: { value: ExpiryOption; label: string }[] = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "none", label: "무기한 (테스트 계정)" },
];

const DAYS: Record<Exclude<ExpiryOption, "none">, number> = { "1d": 1, "7d": 7, "30d": 30 };

/** 선택한 기간으로 만료 시각 계산. 무기한이면 null */
export function expiryFromOption(option: ExpiryOption, now: Date = new Date()): string | null {
  if (option === "none") return null;
  return new Date(now.getTime() + DAYS[option] * 24 * 60 * 60 * 1000).toISOString();
}

/** 만료 시각이 지났으면 true. 무기한(null)은 만료되지 않음 */
export function isTempExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now.getTime();
}

/** '@' 없이 아이디만 입력하면 테스트용 도메인을 붙여 로그인 이메일로 만든다 */
export function toLoginEmail(id: string): string {
  const v = id.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v}@${TEMP_EMAIL_DOMAIN}`;
}

/** 읽기 쉬운 임시 비밀번호 (헷갈리는 글자 제외) */
export function generateTempPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out + "!7";
}

export function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "무기한";
  const d = new Date(expiresAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
