import { describe, expect, it } from "vitest";
import { edgeSlices } from "@/lib/background-edge";

describe("dashboard image edge extension", () => {
  it("fills exposed left space with the first image pixel", () => {
    expect(edgeSlices(100, 200, 1280, 1280)[0]).toEqual({ source: 0, sourceSize: 1, target: 0, targetSize: 200 });
  });
  it("fills exposed right space with the last image pixel", () => {
    expect(edgeSlices(100, -200, 1280, 1280).at(-1)).toEqual({ source: 99, sourceSize: 1, target: 1080, targetSize: 200 });
  });
  it("extends both edges when the image is smaller than the viewport", () => {
    expect(edgeSlices(100, 200, 800, 1280)).toEqual([
      { source: 0, sourceSize: 1, target: 0, targetSize: 200 },
      { source: 0, sourceSize: 100, target: 200, targetSize: 800 },
      { source: 99, sourceSize: 1, target: 1000, targetSize: 280 },
    ]);
  });
});