export const PARTICIPATION_TYPES = ["대표참여", "도급참여"] as const;
export type ParticipationType = typeof PARTICIPATION_TYPES[number];
export type ParticipationFilter = "all" | "unclassified" | ParticipationType;

export function normalizeParticipation(value: unknown): ParticipationType | null {
  return value === "대표참여" || value === "도급참여" ? value : null;
}

export function matchesParticipation(value: unknown, filter: ParticipationFilter): boolean {
  if (filter === "all") return true;
  const type = normalizeParticipation(value);
  return filter === "unclassified" ? type === null : type === filter;
}