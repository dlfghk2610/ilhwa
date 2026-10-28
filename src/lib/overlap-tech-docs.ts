// 업무중첩도 기술자별 서류: 사업마다 특정 기술자에게만 해당하는 PDF(재직증명서 등)를 등록하고,
// 기술자를 지정해 PDF를 병합할 때 그 기술자의 서류만 참여자 명단 바로 앞에 넣는다.

export type TechDoc = {
  id: string;
  technician_name: string;
  label: string;
  pdf_path: string | null;
};

const newId = () => Math.random().toString(36).slice(2, 10);

export const blankTechDoc = (technician_name = ""): TechDoc => ({ id: newId(), technician_name, label: "", pdf_path: null });

/** DB의 jsonb 값을 안전하게 TechDoc[]로 변환 */
export function normalizeTechDocs(value: unknown): TechDoc[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      id: typeof d.id === "string" && d.id ? d.id : newId(),
      technician_name: typeof d.technician_name === "string" ? d.technician_name : "",
      label: typeof d.label === "string" ? d.label : "",
      pdf_path: typeof d.pdf_path === "string" && d.pdf_path ? d.pdf_path : null,
    }));
}

/** 저장 시: 기술자와 파일이 모두 있는 서류만 남긴다 */
export function cleanTechDocs(docs: TechDoc[]): TechDoc[] {
  return docs
    .map((d) => ({ ...d, technician_name: d.technician_name.trim(), label: d.label.trim() }))
    .filter((d) => d.technician_name && d.pdf_path);
}

/** 병합 대상: 지정된 기술자의 서류 PDF 경로(등록 순서). 기술자를 지정하지 않으면 없음 */
export function techDocPathsFor(docs: TechDoc[], technician: string | null | undefined): string[] {
  const name = (technician || "").trim();
  if (!name) return [];
  return docs.filter((d) => d.pdf_path && d.technician_name.trim() === name).map((d) => d.pdf_path as string);
}

/** 사업별 병합 순서: 기본 증빙 → 기술자별 서류 → 참여자 명단 */
export function orderProjectPdfPaths(base: string[], techDocs: string[], participantList: string | null): string[] {
  const out: string[] = [];
  for (const p of [...base, ...techDocs, ...(participantList ? [participantList] : [])]) {
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}
