import ExcelJS from "exceljs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import notoSansKrUrl from "@/assets/fonts/NotoSansKR.ttf?url";
import { sanitizeFileName } from "@/lib/filename";

export type ReportOrientation = "portrait" | "landscape";
export type ReportAlign = "center" | "right";
export type ReportValue = string | number;
export type PerformanceReportRow = Record<string, ReportValue>;

export type ReportColumn = {
  id: string;
  group: string;
  label: string;
  width: number;
  align: ReportAlign;
  numberFormat?: string;
};

export const PERFORMANCE_REPORT_COLUMNS: ReportColumn[] = [
  { id: "sequence", group: "", label: "연번", width: 7, align: "center", numberFormat: "0" },
  { id: "projectName", group: "용역 개요", label: "용역명", width: 30, align: "center" },
  { id: "serviceOverview", group: "용역 개요", label: "과업개요", width: 24, align: "center" },
  { id: "client", group: "용역 개요", label: "발주처", width: 16, align: "center" },
  { id: "contractAmount", group: "준공금액(백만원)", label: "전체금액", width: 13, align: "right", numberFormat: "#,##0.0" },
  { id: "shareAmount", group: "준공금액(백만원)", label: "지분금액", width: 13, align: "right", numberFormat: "#,##0.0" },
  { id: "shareRate", group: "준공금액(백만원)", label: "지분율(%)", width: 10, align: "right", numberFormat: "0.0" },
  { id: "evaluationTypes", group: "평가 기준", label: "평가종류", width: 12, align: "center" },
  { id: "serviceTypes", group: "평가 기준", label: "사업종류", width: 15, align: "center" },
  { id: "contractPeriod", group: "용역기간", label: "계약기간", width: 20, align: "center" },
  { id: "contractDays", group: "용역기간", label: "일수", width: 9, align: "right", numberFormat: "#,##0" },
  { id: "participationPeriod", group: "참여기간", label: "참여기간", width: 20, align: "center" },
  { id: "participationDays", group: "참여기간", label: "일수", width: 9, align: "right", numberFormat: "#,##0" },
  { id: "simpleCount", group: "환산건수", label: "단순", width: 9, align: "right", numberFormat: "0.00" },
  { id: "periodCount", group: "환산건수", label: "기간대비", width: 10, align: "right", numberFormat: "0.00" },
  { id: "duties", group: "참여 정보", label: "담당업무", width: 14, align: "center" },
  { id: "company", group: "참여당시", label: "소속", width: 15, align: "center" },
  { id: "position", group: "참여당시", label: "직위", width: 11, align: "center" },
  { id: "specialty", group: "참여 정보", label: "전문분야", width: 12, align: "center" },
  { id: "responsibility", group: "참여 정보", label: "책임정도", width: 12, align: "center" },
  { id: "notes", group: "", label: "비고", width: 18, align: "center" },
];

export const DEFAULT_REPORT_COLUMN_IDS = [
  "sequence", "projectName", "contractAmount", "shareAmount", "evaluationTypes", "contractPeriod",
  "participationPeriod", "simpleCount", "periodCount", "duties", "company", "position", "client", "notes",
];

const titleFor = (techName: string) => techName ? `PQ 기술자 실적 현황 - ${techName}` : "PQ 기술자 실적 현황";
const fileFor = (techName: string, ext: string) => `${sanitizeFileName(techName ? `PQ 기술자 실적 - ${techName}` : "PQ 기술자 실적")}.${ext}`;
const selectedColumns = (ids: string[]) => ids.map((id) => PERFORMANCE_REPORT_COLUMNS.find((c) => c.id === id)).filter((c): c is ReportColumn => Boolean(c));

function mergeRuns(columns: ReportColumn[]) {
  const runs: Array<{ start: number; end: number; label: string }> = [];
  let start = 0;
  while (start < columns.length) {
    const label = columns[start].group || columns[start].label;
    let end = start;
    while (end + 1 < columns.length && columns[end + 1].group === columns[start].group && columns[start].group) end++;
    runs.push({ start, end, label });
    start = end + 1;
  }
  return runs;
}

export async function exportPerformanceExcel(rows: PerformanceReportRow[], ids: string[], techName: string, orientation: ReportOrientation) {
  const columns = selectedColumns(ids);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PQ 관리 시스템";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("기술자 실적", {
    pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.pageSetup.printTitlesRow = "1:3";
  sheet.columns = columns.map((c) => ({ key: c.id, width: c.width }));
  sheet.mergeCells(1, 1, 1, columns.length);
  const title = sheet.getCell(1, 1);
  title.value = titleFor(techName);
  title.font = { name: "Arial", size: 16, bold: true, color: { argb: "FF17365D" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  mergeRuns(columns).forEach(({ start, end, label }) => {
    const from = start + 1;
    const to = end + 1;
    if (from !== to) sheet.mergeCells(2, from, 2, to);
    else if (!columns[start].group) sheet.mergeCells(2, from, 3, to);
    sheet.getCell(2, from).value = label;
  });
  columns.forEach((c, i) => { if (c.group) sheet.getCell(3, i + 1).value = c.label; });

  [2, 3].forEach((rowNumber) => {
    const row = sheet.getRow(rowNumber);
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber === 2 ? "FF1F4E78" : "FF5B9BD5" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin", color: { argb: "FF7F8C8D" } }, left: { style: "thin", color: { argb: "FF7F8C8D" } }, bottom: { style: "thin", color: { argb: "FF7F8C8D" } }, right: { style: "thin", color: { argb: "FF7F8C8D" } } };
    });
  });

  rows.forEach((source, index) => {
    const row = sheet.addRow(columns.map((c) => source[c.id] ?? ""));
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = columns[colNumber - 1];
      cell.font = { name: "Arial", size: 9, color: { argb: "FF1F2937" } };
      cell.alignment = { horizontal: column.align, vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin", color: { argb: "FFB7C3D0" } }, left: { style: "thin", color: { argb: "FFB7C3D0" } }, bottom: { style: "thin", color: { argb: "FFB7C3D0" } }, right: { style: "thin", color: { argb: "FFB7C3D0" } } };
      if (column.numberFormat) cell.numFmt = column.numberFormat;
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FA" } };
    });
  });
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
  sheet.headerFooter.oddFooter = "&C&P / &N";
  const data = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileFor(techName, "xlsx"));
}

function fitText(text: string, font: PDFFont, size: number, width: number, maxLines = 3) {
  const chars = Array.from(text || "");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const next = line + ch;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { lines.push(line); line = ch; if (lines.length === maxLines - 1) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join("").length;
  if (consumed < chars.length && lines.length) {
    let last = lines.length - 1;
    while (lines[last] && font.widthOfTextAtSize(`${lines[last]}…`, size) > width) lines[last] = lines[last].slice(0, -1);
    lines[last] += "…";
  }
  return lines;
}

function drawCell(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, height: number, opts: { size: number; bold?: boolean; align?: ReportAlign; fill?: ReturnType<typeof rgb> }) {
  if (opts.fill) page.drawRectangle({ x, y, width, height, color: opts.fill });
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0.48, 0.55, 0.62), borderWidth: 0.5 });
  const lines = fitText(text, font, opts.size, width - 6, Math.max(1, Math.floor((height - 4) / (opts.size + 2))));
  lines.forEach((line, index) => {
    const tw = font.widthOfTextAtSize(line, opts.size);
    const tx = opts.align === "right" ? x + width - tw - 3 : x + Math.max(3, (width - tw) / 2);
    page.drawText(line, { x: tx, y: y + height - opts.size - 3 - index * (opts.size + 2), size: opts.size, font, color: opts.bold ? rgb(1, 1, 1) : rgb(0.1, 0.15, 0.22) });
  });
}

export async function exportPerformancePdf(rows: PerformanceReportRow[], ids: string[], techName: string, orientation: ReportOrientation) {
  const columns = selectedColumns(ids);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await fetch(notoSansKrUrl).then((r) => r.arrayBuffer());
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const pageSize: [number, number] = orientation === "landscape" ? [841.89, 595.28] : [595.28, 841.89];
  const margin = 24;
  const contentWidth = pageSize[0] - margin * 2;
  const weight = columns.reduce((sum, c) => sum + c.width, 0);
  const widths = columns.map((c) => contentWidth * c.width / weight);
  const titleHeight = 38, headerHeight = 24, rowHeight = 42;
  let page: PDFPage;
  let y = 0;

  const addPage = () => {
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
    page.drawText(titleFor(techName), { x: margin, y: y - 17, size: 15, font, color: rgb(0.09, 0.21, 0.36) });
    page.drawText(`출력일 ${new Date().toLocaleDateString("ko-KR")}`, { x: pageSize[0] - margin - 90, y: y - 15, size: 7, font, color: rgb(0.35, 0.4, 0.46) });
    y -= titleHeight;
    let x = margin;
    mergeRuns(columns).forEach(({ start, end, label }) => {
      const width = widths.slice(start, end + 1).reduce((a, b) => a + b, 0);
      const standalone = !columns[start].group;
      drawCell(page, font, label, x, y - (standalone ? headerHeight * 2 : headerHeight), width, standalone ? headerHeight * 2 : headerHeight, { size: 7, bold: true, fill: rgb(0.12, 0.31, 0.47) });
      x += width;
    });
    x = margin;
    columns.forEach((c, index) => {
      if (c.group) drawCell(page, font, c.label, x, y - headerHeight * 2, widths[index], headerHeight, { size: 7, bold: true, fill: rgb(0.36, 0.61, 0.78) });
      x += widths[index];
    });
    y -= headerHeight * 2;
  };

  addPage();
  rows.forEach((source, rowIndex) => {
    if (y - rowHeight < margin + 12) addPage();
    let x = margin;
    columns.forEach((c, index) => {
      const raw = source[c.id] ?? "";
      const text = typeof raw === "number" ? (c.numberFormat?.includes("0.00") ? raw.toFixed(2) : raw.toLocaleString("ko-KR")) : String(raw);
      drawCell(page, font, text, x, y - rowHeight, widths[index], rowHeight, { size: 6.5, align: c.align, fill: rowIndex % 2 ? rgb(0.96, 0.97, 0.98) : undefined });
      x += widths[index];
    });
    y -= rowHeight;
  });
  const bytes = await pdf.save();
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), fileFor(techName, "pdf"));
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
