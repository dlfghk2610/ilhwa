import { describe, it, expect } from "vitest";
import { parseParticipantLines, mergeParticipants, type PdfLine } from "@/lib/participant-pdf";

const line = (y: number, cells: [number, string][], page = 0): PdfLine => ({
  page, y, items: cells.map(([x, str]) => ({ x, w: str.length * 6, str })),
});

describe("참여자 명단 PDF 인력 읽기", () => {
  it("reads name, role and participation dates from table columns and ignores the birth date", () => {
    const lines = [
      line(800, [[230, "참여기술자 명단"]]),
      line(760, [[40, "순번"], [80, "성 명"], [150, "생년월일"], [240, "담당업무"], [340, "참여시작일"], [440, "참여제외일"]]),
      line(735, [[40, "1"], [80, "홍길동"], [150, "1975.03.12"], [240, "사업책임"], [340, "2024.01.15"], [440, "2025.06.30"]]),
      line(713, [[40, "2"], [80, "김 철 수"], [150, "1982-07-01"], [240, "도로"], [340, "2024.02.01"], [440, "현재"]]),
    ];
    expect(parseParticipantLines(lines)).toEqual([
      { name: "홍길동", role: "사업책임", start_date: "2024-01-15", end_date: "2025-06-30" },
      { name: "김철수", role: "도로", start_date: "2024-02-01", end_date: "" },
    ]);
  });

  it("splits a single 참여기간 cell into start and end dates", () => {
    const lines = [
      line(760, [[60, "성명"], [160, "직위"], [300, "참여기간"]]),
      line(735, [[60, "박민수"], [160, "고급"], [280, "2023.05.01 ~ 2024.12.31"]]),
    ];
    expect(parseParticipantLines(lines)).toEqual([
      { name: "박민수", role: "고급", start_date: "2023-05-01", end_date: "2024-12-31" },
    ]);
  });

  it("finds registered technicians when the PDF has no recognizable header", () => {
    const lines = [line(700, [[50, "정우성 분야책임 2024.04.01 2024.10.31"]]), line(680, [[50, "기타 안내 문구"]])];
    expect(parseParticipantLines(lines, ["정우성"])).toEqual([
      { name: "정우성", start_date: "2024-04-01", end_date: "2024-10-31" },
    ]);
  });

  it("updates an existing person's dates instead of adding a duplicate, and adds new people", () => {
    const existing = [{ name: "홍길동", role: "", start_date: "", end_date: "" }];
    const { list, added, updated } = mergeParticipants(existing, [
      { name: "홍길동", role: "사업책임", start_date: "2024-01-15", end_date: "2025-06-30" },
      { name: "이영희", start_date: "2024-03-10", end_date: "" },
    ]);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(list.map((p) => p.name)).toEqual(["홍길동", "이영희"]);
    expect(list[0].end_date).toBe("2025-06-30");
  });
});
