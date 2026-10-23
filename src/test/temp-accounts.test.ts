import { describe, it, expect } from "vitest";
import { expiryFromOption, isTempExpired, toLoginEmail } from "@/lib/temp-accounts";

const now = new Date("2026-10-23T12:00:00Z");

describe("temporary accounts", () => {
  it("expires 7 days after creation when 7일 is chosen", () => {
    expect(expiryFromOption("7d", now)).toBe("2026-10-30T12:00:00.000Z");
  });

  it("never expires when 무기한 is chosen", () => {
    expect(expiryFromOption("none", now)).toBeNull();
    expect(isTempExpired(null, now)).toBe(false);
  });

  it("blocks sign-in once the expiry time has passed", () => {
    expect(isTempExpired("2026-10-23T11:59:00Z", now)).toBe(true);
    expect(isTempExpired("2026-10-23T12:01:00Z", now)).toBe(false);
  });

  it("turns a bare ID into a test login email", () => {
    expect(toLoginEmail("Test01")).toBe("test01@pq-test.local");
    expect(toLoginEmail("a@b.com")).toBe("a@b.com");
  });
});
