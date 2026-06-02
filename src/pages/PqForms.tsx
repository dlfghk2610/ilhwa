import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, ChevronLeft, ChevronRight, Download, FileText, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type PqRow = {
  id: string;
  user_id: string;
  project_name: string;
  client: string;
  notice_date: string;
  evaluation_type: string;
  project_type: string;
  year: string;
  page_count: number;
  cover_thumb: string | null;
  pdf_path: string | null;
  hwp_path: string | null;
  hwp_file_name: string | null;
};

const EVALUATION_TYPES = ["PQ", "SOQ", "TP", "기술제안서"];
const PROJECT_TYPES = ["건축", "토목", "조경", "도시계획", "환경", "기타"];
const BUCKET = "pq-files";

async function renderCoverThumb(file: File): Promise<{ pageCount: number; cover: string }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.5 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { pageCount: pdf.numPages, cover: canvas.toDataURL("image/jpeg", 0.7) };
}

export default function PqForms() {
  const { user } = useAuth();
  const [items, setItems] = useState<PqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openUpload, setOpenUpload] = useState(false);
  const [activeItem, setActiveItem] = useState<PqRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<PqRow | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pq_forms")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as PqRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.project_name.toLowerCase().includes(q) ||
        it.client.toLowerCase().includes(q),
    );
  }, [items, search]);

  const handleDelete = async () => {
    if (!deleteRow) return;
    const paths = [deleteRow.pdf_path, deleteRow.hwp_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("pq_forms").delete().eq("id", deleteRow.id);
    if (error) { toast.error(error.message); return; }
    setItems((arr) => arr.filter((x) => x.id !== deleteRow.id));
    setDeleteRow(null);
    toast.success("삭제되었습니다.");
  };

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
            <Button onClick={() => setOpenUpload(true)} disabled={!user}>
              <Plus className="h-4 w-4" /> 새 사업 PQ 등록
            </Button>
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
          </CardContent></Card>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            등록된 PQ가 없습니다. 우측 상단 [새 사업 PQ 등록] 버튼으로 추가하세요.
          </CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">검색 결과가 없습니다.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((it) => (
              <Card
                key={it.id}
                onClick={() => setActiveItem(it)}
                className="relative overflow-hidden cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 z-10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setDeleteRow(it); }}
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="aspect-[210/297] bg-muted overflow-hidden border-b">
                  {it.cover_thumb ? (
                    <img
                      src={it.cover_thumb}
                      alt={it.project_name}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileText className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <CardContent className="p-3 space-y-2">
                  <h3 className="font-semibold line-clamp-2 leading-tight">{it.project_name}</h3>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>발주처: {it.client}</div>
                    <div>공고일: {it.notice_date}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="secondary">{it.evaluation_type}</Badge>
                    <Badge variant="outline">{it.project_type}</Badge>
                    <Badge variant="outline">{it.page_count}p</Badge>
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
        userId={user?.id}
        onCreated={(row) => setItems((arr) => [row, ...arr])}
      />

      <ViewerDialog item={activeItem} onClose={() => setActiveItem(null)} />

      <AlertDialog open={!!deleteRow} onOpenChange={(v) => !v && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 PQ를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>삭제된 항목은 복구할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function UploadDialog({
  open, onOpenChange, userId, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; userId?: string; onCreated: (row: PqRow) => void }) {
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [projectType, setProjectType] = useState("건축");
  const [evaluationType, setEvaluationType] = useState("PQ");
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [hwpFile, setHwpFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => { setProjectName(""); setClient(""); setPdfFile(null); setHwpFile(null); };

  const submit = async () => {
    if (!userId) return toast.error("로그인이 필요합니다.");
    if (!projectName.trim() || !client.trim()) return toast.error("사업명과 발주처를 입력하세요.");
    if (!pdfFile || !hwpFile) return toast.error("PDF와 HWP 파일을 모두 첨부하세요.");
    setLoading(true);
    try {
      const { pageCount, cover } = await renderCoverThumb(pdfFile);
      const stamp = Date.now();
      const safe = (s: string) => s.replace(/[^\w.\-]+/g, "_");
      const pdfPath = `${userId}/${stamp}-${safe(pdfFile.name)}`;
      const hwpPath = `${userId}/${stamp}-${safe(hwpFile.name)}`;

      const up1 = await supabase.storage.from(BUCKET).upload(pdfPath, pdfFile, { contentType: "application/pdf" });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage.from(BUCKET).upload(hwpPath, hwpFile);
      if (up2.error) { await supabase.storage.from(BUCKET).remove([pdfPath]); throw up2.error; }

      const { data, error } = await supabase.from("pq_forms").insert({
        user_id: userId,
        project_name: projectName,
        client,
        notice_date: noticeDate,
        evaluation_type: evaluationType,
        project_type: projectType,
        year,
        page_count: pageCount,
        cover_thumb: cover,
        pdf_path: pdfPath,
        hwp_path: hwpPath,
        hwp_file_name: hwpFile.name,
      }).select("*").single();
      if (error) { await supabase.storage.from(BUCKET).remove([pdfPath, hwpPath]); throw error; }

      onCreated(data as PqRow);
      toast.success("PQ가 등록되었습니다.");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`등록 실패: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>새 사업 PQ 등록</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-2">
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
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "업로드 중..." : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewerDialog({ item, onClose }: { item: PqRow | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [largeImg, setLargeImg] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const itemIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPage(1); setLargeImg(null); setThumbs([]); setPdfDoc(null);
    if (!item || !item.pdf_path) return;
    itemIdRef.current = item.id;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.pdf_path!, 3600);
      if (error || !data?.signedUrl || cancelled) return;
      const pdf = await pdfjsLib.getDocument({ url: data.signedUrl }).promise;
      if (cancelled || itemIdRef.current !== item.id) return;
      setPdfDoc(pdf);
      // Render thumbnails progressively
      const list: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled || itemIdRef.current !== item.id) return;
        const p = await pdf.getPage(i);
        const vp = p.getViewport({ scale: 0.25 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await p.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
        list.push(c.toDataURL("image/jpeg", 0.6));
        if (!cancelled && itemIdRef.current === item.id) setThumbs([...list]);
      }
    })();
    return () => { cancelled = true; };
  }, [item?.id]);

  useEffect(() => {
    if (!pdfDoc || !item) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const p = await pdfDoc.getPage(page);
        const vp = p.getViewport({ scale: 1.6 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await p.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
        if (!cancelled) setLargeImg(c.toDataURL("image/jpeg", 0.85));
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, page, item]);

  if (!item) return null;

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(item.page_count, p + 1));

  const downloadHwp = async () => {
    if (!item.hwp_path) return toast.info("HWP 파일이 없습니다.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.hwp_path, 60, {
      download: item.hwp_file_name ?? `${item.project_name}.hwp`,
    });
    if (error || !data?.signedUrl) return toast.error("다운로드 링크 생성 실패");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = item.hwp_file_name ?? `${item.project_name}.hwp`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // fallback first-page cover if thumbs not yet loaded
  const stripSrcs = thumbs.length ? thumbs : (item.cover_thumb ? [item.cover_thumb] : []);

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] sm:max-w-[98vw] sm:w-[98vw] sm:h-[95vh] p-0 flex flex-col gap-0 rounded-none sm:rounded-lg">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 border-b bg-card pr-12 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base truncate">{item.project_name}</DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{item.client} · {item.year} · {item.evaluation_type}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[320px_1fr]">
          <div className="relative flex items-center justify-center bg-muted/10 overflow-hidden min-h-0 order-1 md:order-2 flex-1 md:flex-none md:h-auto">
            <Button
              variant="secondary" size="icon"
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-10 shadow h-9 w-9"
              onClick={goPrev} disabled={page <= 1}
            ><ChevronLeft className="h-5 w-5" /></Button>

            <div className="h-full w-full flex items-center justify-center p-2 sm:p-4 overflow-auto">
              {largeImg ? (
                <img
                  key={page}
                  src={largeImg}
                  alt={`page ${page}`}
                  className="max-h-full max-w-full shadow-xl rounded-sm animate-in fade-in zoom-in-95 duration-200"
                />
              ) : (
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {rendering ? "페이지 렌더링 중..." : "PDF 로딩 중..."}
                </div>
              )}
            </div>

            <Button
              variant="secondary" size="icon"
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-10 shadow h-9 w-9"
              onClick={goNext} disabled={page >= item.page_count}
            ><ChevronRight className="h-5 w-5" /></Button>

            <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-background/80 backdrop-blur px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium">
              {page} / {item.page_count}
            </div>
          </div>

          <ScrollArea className="md:border-r border-t md:border-t-0 bg-muted/30 order-2 md:order-1 h-28 md:h-auto shrink-0 md:shrink">
            <div className="flex md:hidden gap-2 p-2">
              {stripSrcs.map((src, i) => {
                const n = i + 1;
                const active = n === page;
                return (
                  <button
                    key={i}
                    onClick={() => setPage(n)}
                    className={`relative rounded-md overflow-hidden border-2 bg-background transition-all shrink-0 ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                    }`}
                  >
                    <img src={src} alt={`page ${n}`} className="h-20 w-14 object-cover" />
                    <span className={`absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded ${
                      active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"
                    }`}>{n}p</span>
                  </button>
                );
              })}
            </div>
            <div className="hidden md:grid grid-cols-2 gap-2 p-3">
              {stripSrcs.map((src, i) => {
                const n = i + 1;
                const active = n === page;
                return (
                  <button
                    key={i}
                    onClick={() => setPage(n)}
                    className={`relative rounded-md overflow-hidden border-2 bg-background transition-all ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/40"
                    }`}
                  >
                    <img src={src} alt={`page ${n}`} className="w-full aspect-[210/297] object-cover" />
                    <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded ${
                      active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"
                    }`}>{n}p</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t bg-card px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-center shrink-0">
          <Button size="lg" onClick={downloadHwp} className="gap-2 w-full sm:w-auto">
            <Download className="h-5 w-5" />
            원본 HWP 파일 다운로드
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
