import { describe, expect, it } from "vitest";
import { autoOpenTargets, isOpenedBid, isPastOpening } from "@/lib/bid-opening";

const opening = "2026-10-22T01:00:00.000Z"; // 10:00 KST

describe("개찰 1시간 후 자동 개찰완료", () => {
  it("개찰 59분 후에는 아직 진행중", () => {
    expect(isPastOpening(opening, new Date("2026-10-22T01:59:00.000Z"))).toBe(false);
  });
  it("개찰 정확히 1시간 후부터 개찰완료", () => {
    expect(isPastOpening(opening, new Date("2026-10-22T02:00:00.000Z"))).toBe(true);
  });
  it("개찰일시가 없으면 옮기지 않음", () => {
    expect(isPastOpening(null, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
  it("이미 개찰완료이거나 직접 진행중으로 되돌린 사업은 제외", () => {
    const now = new Date("2026-10-22T03:00:00.000Z");
    const rows = [
      { id: "a", status: "검토중", opening_at: opening, bid_start_date: "2026-10-15" },
      { id: "b", status: "개찰완료", opening_at: opening, bid_start_date: "2026-10-15" },
      { id: "c", status: "검토중", opening_at: opening, bid_start_date: "2026-10-15" },
      { id: "d", status: "검토중", opening_at: "2026-10-22T02:30:00.000Z", bid_start_date: "2026-10-15" },
      { id: "e", status: "검토중", opening_at: opening, bid_start_date: null },
    ];
    expect(autoOpenTargets(rows, now, new Set(["c"]))).toEqual(["a"]);
  });
  it("입찰참가시작일이 없으면 개찰 후에도 진행중으로 둠", () => {
    const now = new Date("2026-10-22T03:00:00.000Z");
    expect(isOpenedBid({ opening_at: opening, bid_start_date: null }, now)).toBe(false);
    expect(isOpenedBid({ opening_at: opening, bid_start_date: "" }, now)).toBe(false);
  });
  it("새로고침으로 입찰참가시작일이 채워지면 개찰완료 대상", () => {
    const now = new Date("2026-10-22T03:00:00.000Z");
    expect(isOpenedBid({ opening_at: opening, bid_start_date: "2026-10-15" }, now)).toBe(true);
  });
});
