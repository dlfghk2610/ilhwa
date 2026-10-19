import { describe, expect, it } from "vitest";
import { matchesParticipation, normalizeParticipation } from "@/lib/bid-participation";

describe("입찰 참여 구분", () => {
  it("대표참여 탭은 대표참여 사업만 포함한다", () => {
    expect(["대표참여", "도급참여", null].filter(v => matchesParticipation(v, "대표참여"))).toEqual(["대표참여"]);
  });
  it("도급참여 탭은 도급참여 사업만 포함한다", () => {
    expect(["대표참여", "도급참여", null].filter(v => matchesParticipation(v, "도급참여"))).toEqual(["도급참여"]);
  });
  it("기존 미분류 사업은 어느 참여 유형에도 임의로 배정하지 않는다", () => {
    expect(normalizeParticipation(null)).toBeNull();
    expect(matchesParticipation(null, "unclassified")).toBe(true);
    expect(matchesParticipation(null, "all")).toBe(true);
  });
});