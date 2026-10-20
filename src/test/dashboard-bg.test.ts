import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { bgCacheKey, deviceForWidth, parseTransforms, transformFor, DEFAULT_TF } from "@/lib/dashboard-bg";

describe("dashboard background per account", () => {
  it("keeps each account's cached background under its own key", () => {
    expect(bgCacheKey("user-a")).not.toBe(bgCacheKey("user-b"));
  });

  it("treats narrow screens as mobile and wide screens as PC", () => {
    expect(deviceForWidth(390)).toBe("mobile");
    expect(deviceForWidth(1280)).toBe("pc");
  });

  it("stores position and zoom separately for PC and mobile", () => {
    const all = parseTransforms({ pc: { scale: 2, x: 10, y: -5 }, mobile: { scale: 1.5, x: 0, y: 30 } });
    expect(transformFor(all, "pc")).toEqual({ scale: 2, x: 10, y: -5 });
    expect(transformFor(all, "mobile")).toEqual({ scale: 1.5, x: 0, y: 30 });
  });

  it("uses the default fit on a device type that has not been adjusted yet", () => {
    const all = parseTransforms({ pc: { scale: 3, x: 1, y: 1 } });
    expect(transformFor(all, "mobile")).toEqual(DEFAULT_TF);
  });
});
