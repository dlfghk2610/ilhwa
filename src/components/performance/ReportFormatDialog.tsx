import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileDown, FileSpreadsheet, GripVertical, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_REPORT_COLUMN_IDS, PERFORMANCE_REPORT_COLUMNS, PerformanceReportRow, ReportOrientation, exportPerformanceExcel, exportPerformancePdf } from "@/lib/performance-report";
import { toast } from "sonner";

type Template = { name: string; columnIds: string[]; orientation: ReportOrientation };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; rows: PerformanceReportRow[]; techName: string; userId?: string | null; initialFormat: "xlsx" | "pdf" };

function SortableField({ id, enabled, onToggle }: { id: string; enabled: boolean; onToggle: () => void }) {
  const field = PERFORMANCE_REPORT_COLUMNS.find((column) => column.id === id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  if (!field) return null;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-2 border bg-card px-2 py-2 text-sm", isDragging && "z-50 shadow-elevated opacity-80")}>
      <button type="button" className="touch-none text-muted-foreground cursor-grab active:cursor-grabbing" aria-label={`${field.label} 순서 이동`} {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <Checkbox checked={enabled} onCheckedChange={onToggle} aria-label={`${field.label} 포함`} />
      <button type="button" onClick={onToggle} className="flex-1 text-left"><span className="font-medium">{field.label}</span>{field.group && <span className="ml-1 text-xs text-muted-foreground">· {field.group}</span>}</button>
    </div>
  );
}

export function ReportFormatDialog({ open, onOpenChange, rows, techName, userId, initialFormat }: Props) {
  const storageKey = `performance_report_templates_v1:${userId || "local"}`;
  const [order, setOrder] = useState(() => PERFORMANCE_REPORT_COLUMNS.map((c) => c.id));
  const [enabled, setEnabled] = useState(() => new Set(DEFAULT_REPORT_COLUMN_IDS));
  const [orientation, setOrientation] = useState<ReportOrientation>("landscape");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    try { setTemplates(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setTemplates([]); }
  }, [storageKey, open]);

  const columns = useMemo(() => order.filter((id) => enabled.has(id)).map((id) => PERFORMANCE_REPORT_COLUMNS.find((c) => c.id === id)).filter((c): c is (typeof PERFORMANCE_REPORT_COLUMNS)[number] => Boolean(c)), [order, enabled]);
  const previewGroups = useMemo(() => {
    const groups: Array<{ label: string; count: number; standalone: boolean }> = [];
    columns.forEach((column) => {
      const label = column.group || column.label;
      const previous = groups[groups.length - 1];
      if (column.group && previous?.label === label && !previous.standalone) previous.count += 1;
      else groups.push({ label, count: 1, standalone: !column.group });
    });
    return groups;
  }, [columns]);
  const previewRows = rows.slice(0, 4);
  const pageRatio = orientation === "landscape" ? "aspect-[1.414/1]" : "aspect-[1/1.414]";

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((items) => arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id))));
  };
  const toggle = (id: string) => setEnabled((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const saveTemplates = (next: Template[]) => { setTemplates(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) { toast.error("양식 이름을 입력하세요"); return; }
    const template = { name, columnIds: order.filter((id) => enabled.has(id)), orientation };
    saveTemplates([...templates.filter((item) => item.name !== name), template]);
    setSelectedTemplate(name); setTemplateName(""); toast.success("양식을 저장했습니다");
  };
  const loadTemplate = (name: string) => {
    setSelectedTemplate(name);
    const template = templates.find((item) => item.name === name);
    if (!template) return;
    const rest = PERFORMANCE_REPORT_COLUMNS.map((c) => c.id).filter((id) => !template.columnIds.includes(id));
    setOrder([...template.columnIds, ...rest]); setEnabled(new Set(template.columnIds)); setOrientation(template.orientation);
  };
  const removeTemplate = () => { if (!selectedTemplate) return; saveTemplates(templates.filter((item) => item.name !== selectedTemplate)); setSelectedTemplate(""); toast.success("저장 양식을 삭제했습니다"); };
  const runExport = async (format: "xlsx" | "pdf") => {
    if (!rows.length) { toast.error("선택된 실적이 없습니다"); return; }
    if (!columns.length) { toast.error("출력할 항목을 한 개 이상 선택하세요"); return; }
    setBusy(format);
    try {
      const ids = columns.map((c) => c.id);
      if (format === "xlsx") await exportPerformanceExcel(rows, ids, techName, orientation);
      else await exportPerformancePdf(rows, ids, techName, orientation);
      toast.success(format === "xlsx" ? "엑셀 양식을 만들었습니다" : "PDF 양식을 만들었습니다");
    } catch (error) { toast.error(`출력 중 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[94vh] w-[96vw] max-w-[1400px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>실적 출력 양식 설정</DialogTitle>
          <DialogDescription>항목을 선택하고 끌어서 순서를 바꾸면 A4 미리보기에 바로 반영됩니다.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[330px_1fr]">
          <section className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
            <div className="space-y-3 border-b p-4">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Select value={selectedTemplate} onValueChange={loadTemplate}><SelectTrigger><SelectValue placeholder="저장 양식 불러오기" /></SelectTrigger><SelectContent>{templates.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select>
                <Button size="icon" variant="outline" disabled={!selectedTemplate} onClick={removeTemplate} title="저장 양식 삭제"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="새 양식 이름 (예: LH 제출용)" /><Button variant="outline" onClick={saveTemplate}><Save className="mr-1 h-4 w-4" />저장</Button></div>
              <div><Label>용지 방향</Label><div className="mt-1 grid grid-cols-2 gap-2"><Button type="button" variant={orientation === "portrait" ? "default" : "outline"} onClick={() => setOrientation("portrait")}>세로</Button><Button type="button" variant={orientation === "landscape" ? "default" : "outline"} onClick={() => setOrientation("landscape")}>가로</Button></div></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-2 flex items-center justify-between"><Label>전체 항목</Label><span className="text-xs text-muted-foreground">{columns.length}/{order.length}개 사용</span></div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={order} strategy={verticalListSortingStrategy}><div className="space-y-1">{order.map((id) => <SortableField key={id} id={id} enabled={enabled.has(id)} onToggle={() => toggle(id)} />)}</div></SortableContext></DndContext>
            </div>
          </section>
          <section className="min-h-0 overflow-auto bg-muted/40 p-4 md:p-6">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">A4 실시간 미리보기</h3><p className="text-xs text-muted-foreground">선택된 실적 {rows.length}건 · 화면에는 최대 4건 표시</p></div><span className="text-xs font-medium text-muted-foreground">A4 {orientation === "landscape" ? "가로" : "세로"}</span></div>
            <div className={cn("mx-auto min-w-[620px] max-w-[980px] overflow-hidden border bg-card p-[4%] shadow-elevated", pageRatio)}>
              <div className="mb-4 border-b-2 border-primary pb-2 text-center"><h2 className="text-lg font-bold text-primary">PQ 기술자 실적 현황</h2><p className="mt-1 text-xs text-muted-foreground">{techName || "기술자 미지정"}</p></div>
              <div className="overflow-hidden border text-[8px]"><table className="w-full table-fixed border-collapse"><thead><tr className="bg-primary text-primary-foreground">{previewGroups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.count} rowSpan={group.standalone ? 2 : 1} className="border-r p-1 text-center font-semibold last:border-r-0">{group.label}</th>)}</tr><tr className="bg-secondary text-secondary-foreground">{columns.filter((column) => column.group).map((column) => <th key={column.id} className="border-r p-1 text-center font-medium last:border-r-0">{column.label}</th>)}</tr></thead><tbody>{previewRows.map((row, index) => <tr key={index} className="even:bg-muted/50">{columns.map((column) => <td key={column.id} className={cn("truncate border-r border-t p-1 last:border-r-0", column.align === "right" ? "text-right" : "text-center")}>{String(row[column.id] ?? "-")}</td>)}</tr>)}</tbody></table></div>
              {!previewRows.length && <div className="py-10 text-center text-xs text-muted-foreground">선택된 실적이 없습니다.</div>}
            </div>
          </section>
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button variant={initialFormat === "xlsx" ? "default" : "outline"} disabled={Boolean(busy)} onClick={() => runExport("xlsx")}>{busy === "xlsx" ? <Check className="mr-1 h-4 w-4 animate-pulse" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}엑셀 내보내기</Button>
          <Button variant={initialFormat === "pdf" ? "default" : "outline"} disabled={Boolean(busy)} onClick={() => runExport("pdf")}>{busy === "pdf" ? <Check className="mr-1 h-4 w-4 animate-pulse" /> : <FileDown className="mr-1 h-4 w-4" />}PDF 출력</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
