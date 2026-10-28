import { describe, expect, it } from "vitest";
import { cleanTechDocs, normalizeTechDocs, orderProjectPdfPaths, techDocPathsFor, type TechDoc } from "@/lib/overlap-tech-docs";

const docs: TechDoc[] = [
  { id: "1", technician_name: "홍길동", label: "재직증명서", pdf_path: "u/hong1.pdf" },
  { id: "2", technician_name: "김철수", label: "재직증명서", pdf_path: "u/kim.pdf" },
  { id: "3", technician_name: "홍길동", label: "자격증", pdf_path: "u/hong2.pdf" },
];

describe("기술자별 서류", () => {
  it("지정한 기술자의 서류만 병합 대상", () => {
    expect(techDocPathsFor(docs, "홍길동")).toEqual(["u/hong1.pdf", "u/hong2.pdf"]);
    expect(techDocPathsFor(docs, "김철수")).toEqual(["u/kim.pdf"]);
  });

  it("기술자를 지정하지 않으면 기술자별 서류는 넣지 않음", () => {
    expect(techDocPathsFor(docs, "")).toEqual([]);
    expect(techDocPathsFor(docs, null)).toEqual([]);
  });

  it("기술자별 서류는 참여자 명단 바로 앞에 위치", () => {
    expect(orderProjectPdfPaths(["u/contract.pdf", "u/agree.pdf"], ["u/hong1.pdf"], "u/list.pdf"))
      .toEqual(["u/contract.pdf", "u/agree.pdf", "u/hong1.pdf", "u/list.pdf"]);
    expect(orderProjectPdfPaths(["u/contract.pdf"], ["u/hong1.pdf"], null)).toEqual(["u/contract.pdf", "u/hong1.pdf"]);
  });

  it("파일이나 기술자가 없는 서류는 저장하지 않음", () => {
    const cleaned = cleanTechDocs([
      ...docs,
      { id: "4", technician_name: "", label: "x", pdf_path: "u/x.pdf" },
      { id: "5", technician_name: "이영희", label: "x", pdf_path: null },
    ]);
    expect(cleaned.map((d) => d.id)).toEqual(["1", "2", "3"]);
    expect(normalizeTechDocs(null)).toEqual([]);
  });
});
