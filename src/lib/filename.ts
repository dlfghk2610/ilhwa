/** 파일명에 쓸 수 없는 문자(\ / : * ? " < > |)와 제어문자를 _ 로 바꾸고 공백 정리 */
export function sanitizeFileName(s: string): string {
  return String(s ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 180);
}

/** 원본 경로에서 확장자 추출 (".pdf") */
export function extOf(path: string, fallback = ""): string {
  const base = (path || "").split("/").pop() || "";
  const m = base.match(/\.([A-Za-z0-9]{1,6})$/);
  return m ? `.${m[1].toLowerCase()}` : fallback;
}

/** "[사업명] [종류].확장자" 형태의 다운로드 파일명 */
export function projectFileName(projectName: string | null | undefined, kind: string, path: string, fallbackExt = ".pdf"): string {
  const name = sanitizeFileName([projectName, kind].filter((x) => x && String(x).trim()).join(" ")) || "download";
  return name + extOf(path, fallbackExt);
}
