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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Search, Plus, ChevronLeft, ChevronRight, Download, FileText, Trash2, Loader2, Pencil, X, FileSpreadsheet, FolderPlus, Folder as FolderIcon, GripVertical, ArrowLeft } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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
  xlsx_path: string | null;
  xlsx_file_name: string | null;
  tags: string[];
  folder_id: string | null;
  updated_at?: string;
};

type PqFolder = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

const EVALUATION_TYPES = ["PQ", "SOQ", "TP", "기술제안서"];
const PROJECT_TYPES = ["건축", "토목", "조경", "도시계획", "환경", "기타"];
const BUCKET = "pq-files";

const DRAG_MIME = "application/x-pq-item";

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
  const [folders, setFolders] = useState<PqFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editRow, setEditRow] = useState<PqRow | null>(null);
  const [activeItem, setActiveItem] = useState<PqRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<PqRow | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<PqFolder | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [deleteFolder, setDeleteFolder] = useState<PqFolder | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [itemsRes, foldersRes] = await Promise.all([
      supabase.from("pq_forms").select("*").order("created_at", { ascending: false }),
      supabase.from("pq_folders").select("*").order("created_at", { ascending: false }),
    ]);
    if (itemsRes.error) toast.error(itemsRes.error.message);
    else setItems((itemsRes.data ?? []) as PqRow[]);
    if (foldersRes.error) toast.error(foldersRes.error.message);
    else setFolders((foldersRes.data ?? []) as PqFolder[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [items]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId],
  );

  const matchesSearch = (it: PqRow) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      it.project_name.toLowerCase().includes(q) ||
      it.client.toLowerCase().includes(q) ||
      (it.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  };

  // 표시할 항목들: 검색 중일 땐 폴더 무시하고 전체 검색, 아니면 현재 폴더의 항목만
  const isSearching = search.trim().length > 0;
  const visibleItems = useMemo(() => {
    if (isSearching) return items.filter(matchesSearch);
    return items.filter((it) => (it.folder_id ?? null) === currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, currentFolderId, search]);

  // 루트에서만 폴더 카드 표시 (검색 중이면 폴더 숨김)
  const visibleFolders = useMemo(() => {
    if (isSearching || currentFolderId) return [];
    return folders;
  }, [folders, currentFolderId, isSearching]);

  const itemsByFolder = useMemo(() => {
    const map = new Map<string, PqRow[]>();
    items.forEach((it) => {
      if (!it.folder_id) return;
      const arr = map.get(it.folder_id) ?? [];
      arr.push(it);
      map.set(it.folder_id, arr);
    });
    return map;
  }, [items]);

  const handleDelete = async () => {
    if (!deleteRow) return;
    const paths = [deleteRow.pdf_path, deleteRow.hwp_path, deleteRow.xlsx_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("pq_forms").delete().eq("id", deleteRow.id);
    if (error) { toast.error(error.message); return; }
    setItems((arr) => arr.filter((x) => x.id !== deleteRow.id));
    setDeleteRow(null);
    toast.success("삭제되었습니다.");
  };

  const openNew = () => { setEditRow(null); setOpenForm(true); };
  const openEdit = (row: PqRow) => { setEditRow(row); setOpenForm(true); };

  const openNewFolder = () => { setEditingFolder(null); setFolderNameDraft(""); setFolderDialogOpen(true); };
  const openEditFolder = (f: PqFolder) => { setEditingFolder(f); setFolderNameDraft(f.name); setFolderDialogOpen(true); };

  const submitFolder = async () => {
    if (!user) return;
    const name = folderNameDraft.trim();
    if (!name) return toast.error("폴더 이름을 입력하세요.");
    if (editingFolder) {
      const { data, error } = await supabase
        .from("pq_folders").update({ name }).eq("id", editingFolder.id).select("*").single();
      if (error) return toast.error(error.message);
      setFolders((arr) => arr.map((f) => f.id === editingFolder.id ? (data as PqFolder) : f));
      toast.success("폴더 이름이 수정되었습니다.");
    } else {
      const { data, error } = await supabase
        .from("pq_folders").insert({ user_id: user.id, name }).select("*").single();
      if (error) return toast.error(error.message);
      setFolders((arr) => [data as PqFolder, ...arr]);
      toast.success("폴더가 생성되었습니다.");
    }
    setFolderDialogOpen(false);
  };

  const confirmDeleteFolder = async () => {
    if (!deleteFolder) return;
    const { error } = await supabase.from("pq_folders").delete().eq("id", deleteFolder.id);
    if (error) return toast.error(error.message);
    setFolders((arr) => arr.filter((f) => f.id !== deleteFolder.id));
    // 안에 있던 항목들은 ON DELETE SET NULL로 폴더 밖으로 이동됨
    setItems((arr) => arr.map((it) => it.folder_id === deleteFolder.id ? { ...it, folder_id: null } : it));
    if (currentFolderId === deleteFolder.id) setCurrentFolderId(null);
    setDeleteFolder(null);
    toast.success("폴더가 삭제되었습니다. 내부 사업들은 폴더 밖으로 이동되었습니다.");
  };

  const moveItemToFolder = async (itemId: string, folderId: string | null) => {
    const target = items.find((x) => x.id === itemId);
    if (!target) return;
    if ((target.folder_id ?? null) === folderId) return;
    // 낙관적 업데이트
    setItems((arr) => arr.map((x) => x.id === itemId ? { ...x, folder_id: folderId } : x));
    const { error } = await supabase.from("pq_forms").update({ folder_id: folderId }).eq("id", itemId);
    if (error) {
      // 롤백
      setItems((arr) => arr.map((x) => x.id === itemId ? { ...x, folder_id: target.folder_id ?? null } : x));
      toast.error(`이동 실패: ${error.message}`);
      return;
    }
    const folderName = folderId ? (folders.find((f) => f.id === folderId)?.name ?? "폴더") : null;
    toast.success(folderName ? `'${folderName}'(으)로 이동했습니다.` : "폴더 밖으로 이동했습니다.");
  };

  const onItemDragStart = (e: React.DragEvent, item: PqRow) => {
    e.dataTransfer.setData(DRAG_MIME, item.id);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onFolderDragOver = (e: React.DragEvent, folderId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverFolderId !== folderId) setDragOverFolderId(folderId);
  };

  const onFolderDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain");
    setDragOverFolderId(null);
    if (id) moveItemToFolder(id, folderId);
  };

  // 폴더 내부에서 루트로 이동시키는 드롭 존
  const onRootDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverRoot(true);
  };
  const onRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain");
    setDragOverRoot(false);
    if (id) moveItemToFolder(id, null);
  };

  return (
    <AppLayout title="PQ 작성양식관리">
      <div className="space-y-6 p-4 md:p-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">PQ 작성양식관리</h1>
            <p className="text-sm text-muted-foreground">완료된 PQ 작성본을 갤러리에서 미리보고 원본 파일을 다운로드합니다.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="사업명 / 발주처 / 태그 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={openNewFolder} disabled={!user}>
              <FolderPlus className="h-4 w-4" /> 새 폴더
            </Button>
            <Button onClick={openNew} disabled={!user}>
              <Plus className="h-4 w-4" /> 새 사업 PQ 등록
            </Button>
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <Badge
                key={t}
                variant={search.trim().toLowerCase() === t.toLowerCase() ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSearch(search.trim().toLowerCase() === t.toLowerCase() ? "" : t)}
              >
                #{t}
              </Badge>
            ))}
          </div>
        )}

        {/* 폴더 안에 있을 때: 뒤로가기 + 드롭존 */}
        {currentFolder && !isSearching && (
          <div
            onDragOver={onRootDragOver}
            onDragLeave={() => setDragOverRoot(false)}
            onDrop={onRootDrop}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border bg-card transition-colors",
              dragOverRoot && "border-primary border-dashed bg-primary/5",
            )}
          >
            <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(null)} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> 전체
            </Button>
            <span className="text-muted-foreground">/</span>
            <FolderIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">{currentFolder.name}</span>
            {dragOverRoot && (
              <span className="ml-auto text-xs text-primary">여기에 놓으면 폴더 밖으로 이동</span>
            )}
          </div>
        )}

        {loading ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
          </CardContent></Card>
        ) : items.length === 0 && folders.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            등록된 PQ가 없습니다. 우측 상단 [새 사업 PQ 등록] 버튼으로 추가하세요.
          </CardContent></Card>
        ) : visibleItems.length === 0 && visibleFolders.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            {isSearching ? "검색 결과가 없습니다." : "이 폴더는 비어 있습니다. 카드를 드래그해서 옮길 수 있습니다."}
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
            {visibleFolders.map((f) => {
              const inside = itemsByFolder.get(f.id) ?? [];
              const previews = inside
                .map((x) => x.cover_thumb)
                .filter((x): x is string => !!x)
                .slice(0, 3);
              const latest = inside
                .map((x) => x.updated_at ?? "")
                .sort()
                .reverse()[0];
              const isOver = dragOverFolderId === f.id;
              return (
                <Card
                  key={`folder-${f.id}`}
                  onClick={() => setCurrentFolderId(f.id)}
                  onDragOver={(e) => onFolderDragOver(e, f.id)}
                  onDragLeave={() => setDragOverFolderId((cur) => cur === f.id ? null : cur)}
                  onDrop={(e) => onFolderDrop(e, f.id)}
                  className={cn(
                    "relative overflow-hidden cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-2",
                    isOver ? "border-primary border-dashed bg-primary/5 scale-[1.01]" : "border-transparent",
                  )}
                >
                  {/* 드래그 핸들 (장식용 - 폴더 자체는 드래그 불가) */}
                  <div className="absolute top-2 left-2 z-10 opacity-60 group-hover:opacity-100 transition-opacity">
                    <div className="h-7 w-7 rounded bg-background/80 backdrop-blur flex items-center justify-center">
                      <FolderIcon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary" size="icon" className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); openEditFolder(f); }}
                      aria-label="폴더 수정"
                    ><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="destructive" size="icon" className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); setDeleteFolder(f); }}
                      aria-label="폴더 삭제"
                    ><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {/* 계단식 표지 미리보기 */}
                  <div className="aspect-[210/297] bg-gradient-to-br from-muted/60 to-muted overflow-hidden border-b relative flex items-center justify-center p-4">
                    {previews.length === 0 ? (
                      <FolderIcon className="h-20 w-20 text-muted-foreground/40" />
                    ) : (
                      <div className="relative w-[70%] aspect-[210/297]">
                        {previews.map((src, i) => {
                          const offset = (previews.length - 1 - i) * 10;
                          const z = i + 1;
                          return (
                            <img
                              key={i}
                              src={src}
                              alt=""
                              style={{
                                top: `${offset}px`,
                                left: `${offset}px`,
                                right: `-${offset}px`,
                                bottom: `-${offset}px`,
                                zIndex: z,
                              }}
                              className="absolute w-full h-full object-cover rounded-sm shadow-lg border border-border bg-background"
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur px-2 py-0.5 rounded text-[11px] font-medium border">
                      {inside.length}개
                    </div>
                  </div>
                  <CardContent className="p-2 space-y-0.5">
                    <h3 className="text-xs font-semibold line-clamp-1 leading-tight flex items-center gap-1">
                      <FolderIcon className="h-3 w-3 text-primary shrink-0" />
                      {f.name}
                    </h3>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">
                      {inside.length}개{latest && ` · ${latest.slice(0, 10)}`}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {visibleItems.map((it) => (
              <Card
                key={it.id}
                draggable
                onDragStart={(e) => onItemDragStart(e, it)}
                onClick={() => setActiveItem(it)}
                className="relative overflow-hidden cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:opacity-50"
              >
                {/* 드래그 핸들 */}
                <div
                  className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="드래그하여 이동"
                  title="드래그하여 폴더로 이동"
                >
                  <div className="h-7 w-7 rounded bg-background/80 backdrop-blur border flex items-center justify-center">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary" size="icon" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); openEdit(it); }}
                    aria-label="수정"
                  ><Pencil className="h-4 w-4" /></Button>
                  <Button
                    variant="destructive" size="icon" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); setDeleteRow(it); }}
                    aria-label="삭제"
                  ><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="aspect-[210/297] bg-muted overflow-hidden border-b">
                  {it.cover_thumb ? (
                    <img
                      src={it.cover_thumb}
                      alt={it.project_name}
                      draggable={false}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileText className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <CardContent className="p-2 space-y-1">
                  <h3 className="text-xs font-semibold line-clamp-2 leading-tight">{it.project_name}</h3>
                  <div className="text-[10px] text-muted-foreground space-y-0 leading-tight">
                    <div className="truncate">{it.client}</div>
                    <div>{it.notice_date}</div>
                  </div>
                  <div className="flex flex-wrap gap-0.5 pt-0.5">
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{it.evaluation_type}</Badge>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{it.project_type}</Badge>
                    {it.page_count > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{it.page_count}p</Badge>}
                    {it.xlsx_path && <Badge variant="outline" className="gap-0.5 text-[9px] px-1 py-0 h-4"><FileSpreadsheet className="h-2.5 w-2.5" />X</Badge>}
                  </div>
                  {it.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {it.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary">#{t}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <FormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        userId={user?.id}
        editRow={editRow}
        defaultFolderId={currentFolderId}
        folders={folders}
        onCreated={(row) => setItems((arr) => [row, ...arr])}
        onUpdated={(row) => setItems((arr) => arr.map((x) => x.id === row.id ? row : x))}
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

      <AlertDialog open={!!deleteFolder} onOpenChange={(v) => !v && setDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 폴더를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              폴더 안에 있던 사업들은 삭제되지 않고 폴더 밖(전체)으로 이동됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFolder}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "폴더 이름 수정" : "새 폴더"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>폴더 이름</Label>
            <Input
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              placeholder="예: 2026 도로 건설 프로젝트"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submitFolder(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>취소</Button>
            <Button onClick={submitFolder}>{editingFolder ? "수정" : "생성"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/^#+/, "");
    if (!v) return;
    if (tags.includes(v)) { setInput(""); return; }
    onChange([...tags, v]);
    setInput("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));
  return (
    <div className="border rounded-md px-2 py-1.5 flex flex-wrap gap-1 items-center min-h-10">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded">
          #{t}
          <button type="button" onClick={() => remove(t)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
          else if (e.key === "Backspace" && !input && tags.length) { remove(tags[tags.length - 1]); }
        }}
        onBlur={() => input && add(input)}
        placeholder={tags.length ? "" : "태그 입력 후 Enter (예: 도서관, 신축)"}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none px-1"
      />
    </div>
  );
}

function FormDialog({
  open, onOpenChange, userId, editRow, defaultFolderId, folders, onCreated, onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  editRow: PqRow | null;
  defaultFolderId: string | null;
  folders: PqFolder[];
  onCreated: (row: PqRow) => void;
  onUpdated: (row: PqRow) => void;
}) {
  const isEdit = !!editRow;
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [projectType, setProjectType] = useState("건축");
  const [evaluationType, setEvaluationType] = useState("PQ");
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
  const [tags, setTags] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | "none">("none");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [hwpFile, setHwpFile] = useState<File | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      setProjectName(editRow.project_name);
      setClient(editRow.client);
      setYear(editRow.year);
      setProjectType(editRow.project_type);
      setEvaluationType(editRow.evaluation_type);
      setNoticeDate(editRow.notice_date);
      setTags(editRow.tags ?? []);
      setFolderId(editRow.folder_id ?? "none");
    } else {
      setProjectName(""); setClient(""); setYear(new Date().getFullYear().toString());
      setProjectType("건축"); setEvaluationType("PQ");
      setNoticeDate(new Date().toISOString().slice(0, 10));
      setTags([]);
      setFolderId(defaultFolderId ?? "none");
    }
    setPdfFile(null); setHwpFile(null); setXlsxFile(null);
  }, [open, editRow, defaultFolderId]);

  const submit = async () => {
    if (!userId) return toast.error("로그인이 필요합니다.");
    if (!projectName.trim() || !client.trim()) return toast.error("사업명과 발주처를 입력하세요.");
    if (!isEdit && (!pdfFile || !hwpFile)) return toast.error("PDF와 HWP 파일을 모두 첨부하세요.");
    setLoading(true);
    const uploadedPaths: string[] = [];
    try {
      const stamp = Date.now();
      const safe = (s: string) => s.replace(/[^\w.\-]+/g, "_");

      let pdfPath = editRow?.pdf_path ?? null;
      let hwpPath = editRow?.hwp_path ?? null;
      let hwpName = editRow?.hwp_file_name ?? null;
      let xlsxPath = editRow?.xlsx_path ?? null;
      let xlsxName = editRow?.xlsx_file_name ?? null;
      let cover = editRow?.cover_thumb ?? null;
      let pageCount = editRow?.page_count ?? 0;
      const toRemove: string[] = [];

      if (pdfFile) {
        const r = await renderCoverThumb(pdfFile);
        cover = r.cover; pageCount = r.pageCount;
        const p = `${userId}/${stamp}-${safe(pdfFile.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(p, pdfFile, { contentType: "application/pdf" });
        if (up.error) throw up.error;
        uploadedPaths.push(p);
        if (editRow?.pdf_path) toRemove.push(editRow.pdf_path);
        pdfPath = p;
      }
      if (hwpFile) {
        const p = `${userId}/${stamp}-${safe(hwpFile.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(p, hwpFile);
        if (up.error) throw up.error;
        uploadedPaths.push(p);
        if (editRow?.hwp_path) toRemove.push(editRow.hwp_path);
        hwpPath = p; hwpName = hwpFile.name;
      }
      if (xlsxFile) {
        const p = `${userId}/${stamp}-${safe(xlsxFile.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(p, xlsxFile);
        if (up.error) throw up.error;
        uploadedPaths.push(p);
        if (editRow?.xlsx_path) toRemove.push(editRow.xlsx_path);
        xlsxPath = p; xlsxName = xlsxFile.name;
      }

      const payload = {
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
        hwp_file_name: hwpName,
        xlsx_path: xlsxPath,
        xlsx_file_name: xlsxName,
        tags,
        folder_id: folderId === "none" ? null : folderId,
      };

      if (isEdit && editRow) {
        const { data, error } = await supabase.from("pq_forms").update(payload).eq("id", editRow.id).select("*").single();
        if (error) throw error;
        if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);
        onUpdated(data as PqRow);
        toast.success("수정되었습니다.");
      } else {
        const { data, error } = await supabase.from("pq_forms").insert({ user_id: userId, ...payload }).select("*").single();
        if (error) throw error;
        onCreated(data as PqRow);
        toast.success("PQ가 등록되었습니다.");
      }
      onOpenChange(false);
    } catch (e: any) {
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      toast.error(`${isEdit ? "수정" : "등록"} 실패: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{isEdit ? "PQ 수정" : "새 사업 PQ 등록"}</DialogTitle>
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
            <div className="space-y-1.5">
              <Label>공종 카테고리</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>폴더</Label>
              <Select value={folderId} onValueChange={(v) => setFolderId(v as any)}>
                <SelectTrigger><SelectValue placeholder="폴더 없음" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">폴더 없음 (전체)</SelectItem>
                  {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>태그 (검색용)</Label>
              <TagInput tags={tags} onChange={setTags} />
            </div>
            <div className="space-y-1.5">
              <Label>PDF 파일 (미리보기용) {isEdit && <span className="text-xs text-muted-foreground">교체 시에만 선택</span>}</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
              {pdfFile ? <p className="text-xs text-muted-foreground truncate">{pdfFile.name}</p>
                : isEdit && editRow?.pdf_path && <p className="text-xs text-muted-foreground truncate">기존: {editRow.pdf_path.split("/").pop()}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>HWP 파일 {isEdit && <span className="text-xs text-muted-foreground">교체 시에만 선택</span>}</Label>
              <Input type="file" accept=".hwp,.hwpx" onChange={(e) => setHwpFile(e.target.files?.[0] ?? null)} />
              {hwpFile ? <p className="text-xs text-muted-foreground truncate">{hwpFile.name}</p>
                : isEdit && editRow?.hwp_file_name && <p className="text-xs text-muted-foreground truncate">기존: {editRow.hwp_file_name}</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Excel 파일 (선택, 미리보기 + 다운로드)</Label>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setXlsxFile(e.target.files?.[0] ?? null)} />
              {xlsxFile ? <p className="text-xs text-muted-foreground truncate">{xlsxFile.name}</p>
                : isEdit && editRow?.xlsx_file_name && <p className="text-xs text-muted-foreground truncate">기존: {editRow.xlsx_file_name}</p>}
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? (isEdit ? "수정 중..." : "업로드 중...") : (isEdit ? "수정 저장" : "등록")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewerDialog({ item, onClose }: { item: PqRow | null; onClose: () => void }) {
  const [tab, setTab] = useState<"pdf" | "xlsx">("pdf");
  const [page, setPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [largeImg, setLargeImg] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const itemIdRef = useRef<string | null>(null);

  // xlsx preview
  const [xlsxSheets, setXlsxSheets] = useState<{ name: string; html: string }[]>([]);
  const [xlsxSheetIdx, setXlsxSheetIdx] = useState(0);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  useEffect(() => {
    setPage(1); setLargeImg(null); setThumbs([]); setPdfDoc(null);
    setXlsxSheets([]); setXlsxSheetIdx(0);
    setTab(item?.pdf_path ? "pdf" : (item?.xlsx_path ? "xlsx" : "pdf"));
    if (!item || !item.pdf_path) return;
    itemIdRef.current = item.id;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.pdf_path!, 3600);
      if (error || !data?.signedUrl || cancelled) return;
      const pdf = await pdfjsLib.getDocument({ url: data.signedUrl }).promise;
      if (cancelled || itemIdRef.current !== item.id) return;
      setPdfDoc(pdf);
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

  // TEMP DEBUG: log layout chain
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) { console.log("DEBUG: no dialog"); return; }
      let el: Element | null = dlg;
      const out: string[] = [];
      const walk = (e: Element, depth: number) => {
        if (depth > 6) return;
        const cs = getComputedStyle(e as HTMLElement);
        const r = (e as HTMLElement).getBoundingClientRect();
        out.push(`${"  ".repeat(depth)}<${e.tagName.toLowerCase()} role=${e.getAttribute("role")} display=${cs.display} h=${Math.round(r.height)} flex=${cs.flex} minH=${cs.minHeight} cls="${(e.getAttribute("class") || "").slice(0, 160)}"`);
        Array.from(e.children).forEach((c) => walk(c, depth + 1));
      };
      walk(el, 0);
      console.log("LAYOUT_DEBUG\n" + out.join("\n"));
    }, 1500);
    return () => clearTimeout(t);
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

  // Load xlsx preview when switching to xlsx tab
  useEffect(() => {
    if (!item?.xlsx_path || tab !== "xlsx" || xlsxSheets.length) return;
    let cancelled = false;
    (async () => {
      setXlsxLoading(true);
      try {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.xlsx_path!, 3600);
        if (error || !data?.signedUrl) throw error ?? new Error("링크 생성 실패");
        const res = await fetch(data.signedUrl);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf);
        const sheets = wb.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
        }));
        if (!cancelled) setXlsxSheets(sheets);
      } catch (e: any) {
        if (!cancelled) toast.error(`엑셀 미리보기 실패: ${e?.message ?? e}`);
      } finally {
        if (!cancelled) setXlsxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item?.id, tab, xlsxSheets.length]);

  if (!item) return null;

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(item.page_count, p + 1));

  const downloadStored = async (path: string | null, fallbackName: string) => {
    if (!path) return toast.info("파일이 없습니다.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: fallbackName });
    if (error || !data?.signedUrl) return toast.error("다운로드 링크 생성 실패");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = fallbackName;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const stripSrcs = thumbs.length ? thumbs : (item.cover_thumb ? [item.cover_thumb] : []);

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-[98vw] sm:w-[98vw] sm:h-[95vh] p-0 flex flex-col gap-0 rounded-none sm:rounded-lg">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 border-b bg-card pr-12 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base truncate">{item.project_name}</DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{item.client} · {item.year} · {item.evaluation_type}</p>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 sm:px-4 pt-2 border-b shrink-0">
            <TabsList>
              <TabsTrigger value="pdf" disabled={!item.pdf_path}>PDF 미리보기</TabsTrigger>
              <TabsTrigger value="xlsx" disabled={!item.xlsx_path}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel 미리보기
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pdf" className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[320px_1fr]">
              <div className="relative bg-muted/10 overflow-hidden min-h-0 order-1 md:order-2 flex-1">
                <Button variant="secondary" size="icon"
                  className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-10 shadow h-9 w-9"
                  onClick={goPrev} disabled={page <= 1}
                ><ChevronLeft className="h-5 w-5" /></Button>

                <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4 overflow-auto">
                  {largeImg ? (
                    <img key={page} src={largeImg} alt={`page ${page}`}
                      className="max-h-full max-w-full shadow-xl rounded-sm animate-in fade-in zoom-in-95 duration-200" />
                  ) : (
                    <div className="text-muted-foreground text-sm flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> {rendering ? "페이지 렌더링 중..." : "PDF 로딩 중..."}
                    </div>
                  )}
                </div>

                <Button variant="secondary" size="icon"
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-10 shadow h-9 w-9"
                  onClick={goNext} disabled={page >= item.page_count}
                ><ChevronRight className="h-5 w-5" /></Button>

                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-background/80 backdrop-blur px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium">
                  {page} / {item.page_count}
                </div>
              </div>

              <ScrollArea className="md:border-r border-t md:border-t-0 bg-muted/30 order-2 md:order-1 h-20 md:h-full md:min-h-0 shrink-0 md:shrink overflow-hidden">
                <div className="flex md:hidden gap-2 p-2">
                  {stripSrcs.map((src, i) => {
                    const n = i + 1; const active = n === page;
                    return (
                      <button key={i} onClick={() => setPage(n)}
                        className={`relative rounded-md overflow-hidden border-2 bg-background transition-all shrink-0 ${active ? "border-primary ring-2 ring-primary/30" : "border-transparent"}`}>
                        <img src={src} alt={`page ${n}`} className="h-20 w-14 object-cover" />
                        <span className={`absolute bottom-0.5 left-0.5 text-[9px] px-1 py-0.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"}`}>{n}p</span>
                      </button>
                    );
                  })}
                </div>
                <div className="hidden md:grid grid-cols-2 gap-2 p-3">
                  {stripSrcs.map((src, i) => {
                    const n = i + 1; const active = n === page;
                    return (
                      <button key={i} onClick={() => setPage(n)}
                        className={`relative rounded-md overflow-hidden border-2 bg-background transition-all ${active ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/40"}`}>
                        <img src={src} alt={`page ${n}`} className="w-full aspect-[210/297] object-cover" />
                        <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"}`}>{n}p</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="xlsx" className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden">
            {xlsxSheets.length > 1 && (
              <div className="flex gap-1 px-3 py-2 border-b overflow-x-auto shrink-0">
                {xlsxSheets.map((s, i) => (
                  <Button key={s.name} size="sm" variant={i === xlsxSheetIdx ? "default" : "outline"}
                    onClick={() => setXlsxSheetIdx(i)}>{s.name}</Button>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto p-3 bg-muted/10">
              {xlsxLoading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 엑셀 불러오는 중...
                </div>
              ) : xlsxSheets[xlsxSheetIdx] ? (
                <div
                  className="excel-preview bg-background rounded shadow-sm p-2"
                  dangerouslySetInnerHTML={{ __html: xlsxSheets[xlsxSheetIdx].html }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">엑셀 파일이 없습니다.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t bg-card px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-center gap-2 shrink-0">
          {item.hwp_path && (
            <Button size="sm" className="sm:h-10 sm:px-6 sm:text-base gap-2" onClick={() => downloadStored(item.hwp_path, item.hwp_file_name ?? `${item.project_name}.hwp`)}>
              <Download className="h-4 w-4" /> HWP 다운로드
            </Button>
          )}
          {item.xlsx_path && (
            <Button size="sm" variant="secondary" className="sm:h-10 sm:px-6 sm:text-base gap-2" onClick={() => downloadStored(item.xlsx_path, item.xlsx_file_name ?? `${item.project_name}.xlsx`)}>
              <FileSpreadsheet className="h-4 w-4" /> Excel 다운로드
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
