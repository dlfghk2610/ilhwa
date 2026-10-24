import { describe, expect, it } from "vitest";
import { addLink, noticeLinkFromNotes, normalizeUrl, notesWithoutLink } from "@/lib/bid-links";

describe("bid links", () => {
  it("adds https:// when the user types an address without it", () => {
    expect(normalizeUrl("www.g2b.go.kr/abc")).toBe("https://www.g2b.go.kr/abc");
  });

  it("rejects text that is not a web address", () => {
    expect(normalizeUrl("공고 링크")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(addLink([], "abc")).toBeNull();
  });

  it("does not add the same link twice", () => {
    const once = addLink([], "https://lh.or.kr/")!;
    expect(addLink(once, "lh.or.kr")).toEqual(["https://lh.or.kr/"]);
  });

  it("reads the imported notice link from notes and hides that line", () => {
    const notes = "공고번호: R26BK001-000\n공고링크: https://www.g2b.go.kr/link?id=1\n계약방법: 협상";
    expect(noticeLinkFromNotes(notes)).toBe("https://www.g2b.go.kr/link?id=1");
    expect(notesWithoutLink(notes)).toBe("공고번호: R26BK001-000\n계약방법: 협상");
  });
});
