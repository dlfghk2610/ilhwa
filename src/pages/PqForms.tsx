import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, X, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type PqItem = {
  id: string;
  projectName: string;
  client: string;
  noticeDate: string;
  evaluationType: string;
  projectType: string;
  year: string;
  pdfUrl?: string;          // object URL or remote
  hwpUrl?: string;          // object URL or remote
  hwpFileName?: string;
  pageCount: number;
  thumbnails: string[];     // dataURL per page (or placeholder)
};

const EVALUATION_TYPES = ["PQ", "SOQ", "TP", "기술제안서"];
const PROJECT_TYPES = ["건축", "토목", "조경", "도시계획", "환경", "기타"];

// ---------- Mock data ----------
function makePlaceholderThumb(label: string, color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 210 297'>
    <rect width='210' height='297' fill='white'/>
    <rect x='0' y='0' width='210' height='40' fill='${color}'/>
    <text x='105' y='26' font-family='sans-serif' font-size='16' fill='white' text-anchor='middle' font-weight='bold'>${label}</text>
    <rect x='20' y='60' width='170' height='8' fill='#cbd5e1'/>
    <rect x='20' y='78' width='140' height='8' fill='#e2e8f0'/>
    <rect x='20' y='96' width='160' height='8' fill='#e2e8f0'/>
    <rect x='20' y='120' width='170' height='60' fill='#f1f5f9'/>
    <rect x='20' y='195' width='170' height='8' fill='#e2e8f0'/>
    <rect x='20' y='213' width='120' height='8' fill='#e2e8f0'/>
    <rect x='20' y='231' width='150' height='8' fill='#e2e8f0'/>
    <rect x='20' y='260' width='80' height='8' fill='#cbd5e1'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildMockItem(
  id: string, projectName: string, client: string, noticeDate: string,
  evaluationType: string, projectType: string, year: string, color: string,
): PqItem {
  const pages = 20;
  const thumbnails = Array.from({ length: pages }, (_, i) =>
    makePlaceholderThumb(`${projectName.slice(0, 6)} ${i + 1}p`, color),
  );
  return {
    id, projectName, client, noticeDate, evaluationType, projectType, year,
    pageCount: pages, thumbnails,
  };
}

const MOCK: PqItem[] = [
  buildMockItem("m1", "○○시 복합문화공간 건립 설계공모", "○○시청", "2025-03-12", "PQ", "건축", "2025", "#2563eb"),
  buildMockItem("m2", "□□ 도시재생 기본계획 수립용역", "□□광역시", "2024-11-20", "SOQ", "도시계획", "2024", "#0d9488"),
  buildMockItem("m3", "△△ 하천 정비 기본 및 실시설계", "△△청", "2024-08-05", "기술제안서", "토목", "2024", "#9333ea"),
  buildMockItem("m4", "◇◇ 친환경 캠퍼스 마스터플랜", "◇◇대학교", "2023-12-01", "PQ", "조경", "2023", "#ea580c"),
];

// ---------- Helpers ----------
async function renderPdfThumbnails(file: File): Promise<{ pageCount: number; thumbs: string[]; pdfUrl: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: "application/pdf" }));
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const thumbs: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbs.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  return { pageCount: pdf.numPages, thumbs, pdfUrl };
}

// ---------- Page ----------
export default function PqForms() {
  const [items, setItems] = useState<PqItem[]>(MOCK);
  const [search, setSearch] = useState("");
  const [openUpload, setOpenUpload] = useState(false);
  const [activeItem, setActiveItem] = useState<PqItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.projectName.toLowerCase().includes(q) ||
        it.client.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <AppLayout title="PQ 작성양식관리">
      <div className="space-y-6 p-4 md:p-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">PQ 작성양식관리</h1>
            <p className="text-sm text-muted-foreground">완료된 PQ 작성본을 갤러리에서 미리보고 원본 HWP 파일을 다운로드합니다.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="사업명 또는 발주처 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setOpenUpload(true)}>
              <Plus className="h-4 w-4" /> 새 사업 PQ 등록
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">검색 결과가 없습니다.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((it) => (
              <Card
                key={it.id}
                onClick={() => setActiveItem(it)}
                className="overflow-hidden cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="aspect-[210/297] bg-muted overflow-hidden border-b">
                  <img
                    src={it.thumbnails[0]}
                    alt={it.projectName}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
                <CardContent className="p-3 space-y-2">
                  <h3 className="font-semibold line-clamp-2 leading-tight">{it.projectName}</h3>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>발주처: {it.client}</div>
                    <div>공고일: {it.noticeDate}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="secondary">{it.evaluationType}</Badge>
                    <Badge variant="outline">{it.projectType}</Badge>
                    <Badge variant="outline">{it.pageCount}p</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <UploadDialog
        open={openUpload}
        onOpenChange={setOpenUpload}
        onCreate={(it) => setItems((arr) => [it, ...arr])}
      />

      <ViewerDialog item={activeItem} onClose={() => setActiveItem(null)} />
    </AppLayout>
  );
}

// ---------- Upload Dialog ----------
function UploadDialog({
  open, onOpenChange, onCreate,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (it: PqItem) => void }) {
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [projectType, setProjectType] = useState("건축");
  const [evaluationType, setEvaluationType] = useState("PQ");
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [hwpFile, setHwpFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setProjectName(""); setClient(""); setPdfFile(null); setHwpFile(null);
  };

  const submit = async () => {
    if (!projectName.trim() || !client.trim()) return toast.error("사업명과 발주처를 입력하세요.");
    if (!pdfFile || !hwpFile) return toast.error("PDF와 HWP 파일을 모두 첨부하세요.");
    setLoading(true);
    try {
      const { pageCount, thumbs, pdfUrl } = await renderPdfThumbnails(pdfFile);
      const hwpUrl = URL.createObjectURL(hwpFile);
      const item: PqItem = {
        id: `u-${Date.now()}`,
        projectName, client, noticeDate, evaluationType, projectType, year,
        pdfUrl, hwpUrl, hwpFileName: hwpFile.name,
        pageCount, thumbnails: thumbs,
      };
      onCreate(item);
      toast.success("PQ가 등록되었습니다.");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`PDF 처리 실패: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>새 사업 PQ 등록</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>사업명</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="예: ○○시 복합문화공간 건립 설계공모" />
          </div>
          <div className="space-y-1.5">
            <Label>발주처</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="예: ○○시청" />
          </div>
          <div className="space-y-1.5">
            <Label>수행연도</Label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>공고일</Label>
            <Input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>평가종류</Label>
            <Select value={evaluationType} onValueChange={setEvaluationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVALUATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>공종 카테고리</Label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PDF 파일 (미리보기용)</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
            {pdfFile && <p className="text-xs text-muted-foreground truncate">{pdfFile.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>HWP 파일 (다운로드용)</Label>
            <Input type="file" accept=".hwp,.hwpx" onChange={(e) => setHwpFile(e.target.files?.[0] ?? null)} />
            {hwpFile && <p className="text-xs text-muted-foreground truncate">{hwpFile.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "PDF 처리 중..." : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Viewer Dialog ----------
function ViewerDialog({ item, onClose }: { item: PqItem | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [largeImg, setLargeImg] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { setPage(1); setLargeImg(null); }, [item?.id]);

  // Render high-res page if real PDF, else use thumbnail
  useEffect(() => {
    let cancelled = false;
    if (!item) return;
    (async () => {
      if (item.pdfUrl) {
        setRendering(true);
        try {
          const pdf = await pdfjsLib.getDocument({ url: item.pdfUrl }).promise;
          const p = await pdf.getPage(page);
          const viewport = p.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await p.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (!cancelled) setLargeImg(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          if (!cancelled) setLargeImg(item.thumbnails[page - 1] ?? null);
        } finally {
          if (!cancelled) setRendering(false);
        }
      } else {
        setLargeImg(item.thumbnails[page - 1] ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [item, page]);

  if (!item) return null;

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(item.pageCount, p + 1));

  const downloadHwp = () => {
    if (item.hwpUrl) {
      const a = document.createElement("a");
      a.href = item.hwpUrl;
      a.download = item.hwpFileName ?? `${item.projectName}.hwp`;
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      toast.info("샘플 데이터에는 첨부된 HWP 파일이 없습니다. 새 사업을 등록해 보세요.");
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 flex flex-col gap-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="text-base truncate">{item.projectName}</DialogTitle>
              <p className="text-xs text-muted-foreground truncate">{item.client} · {item.year} · {item.evaluationType}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        {/* Split body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* Left gallery */}
          <ScrollArea className="border-r bg-muted/30 h-full">
            <div className="grid grid-cols-2 gap-2 p-3">
              {item.thumbnails.map((src, i) => {
                const n = i + 1;
                const active = n === page;
                return (
                  <button
                    key={i}
                    onClick={() => setPage(n)}
                    className={`group relative rounded-md overflow-hidden border-2 bg-background transition-all ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/40"
                    }`}
                  >
                    <img src={src} alt={`page ${n}`} className="w-full aspect-[210/297] object-cover" />
                    <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded ${
                      active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"
                    }`}>
                      {n}p
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Right canvas */}
          <div className="relative flex items-center justify-center bg-muted/10 overflow-hidden min-h-0">
            <Button
              variant="secondary" size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 shadow"
              onClick={goPrev} disabled={page <= 1}
            ><ChevronLeft className="h-5 w-5" /></Button>

            <div className="h-full w-full flex items-center justify-center p-4 overflow-auto">
              {largeImg ? (
                <img
                  key={page}
                  src={largeImg}
                  alt={`page ${page}`}
                  className="max-h-full max-w-full shadow-xl rounded-sm animate-in fade-in zoom-in-95 duration-200"
                />
              ) : (
                <div className="text-muted-foreground">{rendering ? "페이지 렌더링 중..." : "미리보기 없음"}</div>
              )}
            </div>

            <Button
              variant="secondary" size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 shadow"
              onClick={goNext} disabled={page >= item.pageCount}
            ><ChevronRight className="h-5 w-5" /></Button>

            <div className="absolute top-3 right-3 bg-background/80 backdrop-blur px-2.5 py-1 rounded text-xs font-medium">
              {page} / {item.pageCount}
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="border-t bg-card px-4 py-3 flex items-center justify-center">
          <Button size="lg" onClick={downloadHwp} className="gap-2">
            <Download className="h-5 w-5" />
            원본 HWP 파일 다운로드
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
