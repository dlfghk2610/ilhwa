import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { rgb, type PDFPage } from "pdf-lib";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type NameMark = { pageIndex: number; x: number; y: number; height: number };

/** 참여자명단 PDF 텍스트에서 기술자 이름 위치를 찾음 (글자 사이 공백/분리된 글자도 인식) */
export async function findNameMarks(bytes: ArrayBuffer, name: string): Promise<NameMark[]> {
  const target = name.replace(/\s+/g, "");
  if (!target) return [];
  const marks: NameMark[] = [];
  try {
    const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    for (let pi = 1; pi <= pdf.numPages; pi++) {
      const page = await pdf.getPage(pi);
      const tc = await page.getTextContent();
      const items = (tc.items as any[]).filter((it) => typeof it.str === "string" && it.str.trim());
      // 같은 줄(y 근접) 단위로 묶어서 공백 제거 후 매칭
      const lines: any[][] = [];
      for (const it of items) {
        const y = it.transform[5];
        const line = lines.find((l) => Math.abs(l[0].transform[5] - y) < 3);
        if (line) line.push(it); else lines.push([it]);
      }
      for (const line of lines) {
        line.sort((a, b) => a.transform[4] - b.transform[4]);
        let joined = "";
        const owner: any[] = [];
        for (const it of line) {
          for (const ch of String(it.str).replace(/\s+/g, "")) { joined += ch; owner.push(it); }
        }
        let from = 0;
        while (true) {
          const idx = joined.indexOf(target, from);
          if (idx < 0) break;
          const it = owner[idx];
          const tr = it.transform as number[];
          marks.push({ pageIndex: pi - 1, x: tr[4], y: tr[5], height: it.height || Math.abs(tr[3]) || 10 });
          from = idx + target.length;
        }
      }
    }
  } catch { /* 스캔본 등 텍스트 없음 */ }
  return marks;
}

/** 이름 왼쪽에 진한 검정 체크 표시 */
export function drawCheckMark(pg: PDFPage, m: NameMark) {
  const size = Math.max(26, m.height * 3);
  const s = size / 12;
  const x = m.x - size - 1;
  const y = m.y + size * 0.7;
  pg.drawSvgPath(`M 0 6 L 4 11 L 12 0`, { x, y, scale: s, borderColor: rgb(0, 0, 0), borderWidth: 1.4 });
}
