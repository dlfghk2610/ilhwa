import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BidParticipationBadge, BidParticipationSelect } from "@/components/BidParticipation";
import type { ParticipationType } from "@/lib/bid-participation";
import { addLink, linkHost, noticeLinkFromNotes, notesWithoutLink } from "@/lib/bid-links";
import { ArrowRightLeft, ExternalLink, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export type BidDetailRow = {
  id: string;
  project_name: string;
  client: string | null;
  announcement_date: string | null;
  pq_due_date: string | null;
  bid_start_date: string | null;
  bid_end_at: string | null;
  opening_at: string | null;
  estimated_amount: number | null;
  share_rates: { company: string; rate: string }[];
  participants: { name: string; role: string }[];
  evaluation_types: string[];
  service_types: string[];
  agreement_approval_date: string | null;
  status: string | null;
  participation_type: ParticipationType | null;
  notes: string | null;
  notify_hours_before: number;
  custom_links: string[];
};

type Props = {
  row: BidDetailRow | null;
  opened: boolean;
  classifying: boolean;
  fmtDT: (iso: string | null) => string;
  dDisplay: (iso: string | null) => string;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClassify: (v: ParticipationType | null) => void;
  onLinksChange: (links: string[]) => Promise<boolean>;
};

const Item = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={"min-w-0 " + (wide ? "col-span-2" : "")}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-sm break-words">{children || "-"}</div>
  </div>
);

const LinkButton = ({ href, label, onRemove }: { href: string; label: string; onRemove?: () => void }) => (
  <span className="inline-flex items-center rounded-md border bg-background">
    <a href={href} target="_blank" rel="noopener noreferrer" title={href}
      className="inline-flex h-8 items-center gap-1 px-2.5 text-xs font-medium text-primary hover:bg-muted rounded-l-md">
      <ExternalLink className="h-3.5 w-3.5" />{label}
    </a>
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label={`${label} 삭제`} title="링크 삭제"
        className="inline-flex h-8 w-6 items-center justify-center border-l text-muted-foreground hover:text-destructive rounded-r-md">
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

export const BidDetailDialog = ({ row, opened, classifying, fmtDT, dDisplay, onClose, onEdit, onMove, onDelete, onClassify, onLinksChange }: Props) => {
  const [addOpen, setAddOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [saving, setSaving] = useState(false);

  const noticeLink = row ? noticeLinkFromNotes(row.notes) : null;
  const links = row?.custom_links || [];
  const notes = row ? notesWithoutLink(row.notes) : "";

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = addLink(links, linkInput);
    if (!next) { toast.error("올바른 링크 주소를 입력해 주세요."); return; }
    setSaving(true);
    const ok = await onLinksChange(next);
    setSaving(false);
    if (ok) { setLinkInput(""); setAddOpen(false); }
  };

  const removeLink = (url: string) => onLinksChange(links.filter((l) => l !== url));

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { setAddOpen(false); onClose(); } }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        {row && <>
          <DialogHeader className="text-left space-y-1.5 pr-6">
            <div><BidParticipationBadge value={row.participation_type} /></div>
            <DialogTitle className="text-base sm:text-lg leading-snug break-words">{row.project_name}</DialogTitle>
            <DialogDescription>{row.client || "발주처 없음"}{row.status ? ` · ${row.status}` : ""}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-1.5">
            <Link2 className="h-4 w-4 text-muted-foreground mr-0.5" aria-label="링크" />
            {noticeLink && <LinkButton href={noticeLink} label="공고" />}
            {links.map((l, i) => (
              <LinkButton key={l} href={l} label={links.length > 1 ? `링크 ${i + 1}` : "링크"} onRemove={() => removeLink(l)} />
            ))}
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="링크 추가" title="링크 추가">
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-2">
                <form onSubmit={submitLink} className="flex gap-1.5">
                  <Input autoFocus value={linkInput} onChange={(e) => setLinkInput(e.target.value)} placeholder="링크 주소 붙여넣기" className="h-8 text-xs" />
                  <Button type="submit" size="sm" className="h-8 shrink-0" disabled={saving || !linkInput.trim()}>추가</Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 rounded-lg border bg-muted/30 p-3">
            <Item label="공고일">{row.announcement_date}</Item>
            <Item label="PQ마감">{row.pq_due_date}</Item>
            <Item label="입찰시작">{row.bid_start_date}</Item>
            <Item label="입찰마감">{row.bid_end_at ? <>{fmtDT(row.bid_end_at)} <span className="text-xs text-destructive">({dDisplay(row.bid_end_at)})</span></> : null}</Item>
            <Item label="개찰일시">{row.opening_at ? fmtDT(row.opening_at) : null}</Item>
            <Item label="추정금액">{row.estimated_amount ? `${Number(row.estimated_amount).toLocaleString()}원` : null}</Item>
            <Item label="협정승인일">{row.agreement_approval_date}</Item>
            <Item label="마감 알림">{`${row.notify_hours_before}시간 전`}</Item>
            <Item label="평가종류">{row.evaluation_types.join(", ")}</Item>
            <Item label="사업종류" wide>{row.service_types.join(", ")}</Item>
            {row.share_rates.length > 0 && (
              <Item label="지분율" wide>{row.share_rates.map((s) => `${s.company || "-"} ${s.rate || ""}${s.rate && !String(s.rate).includes("%") ? "%" : ""}`).join(" / ")}</Item>
            )}
            {row.participants.length > 0 && (
              <Item label="참여자" wide>{row.participants.map((p) => p.role ? `${p.name}(${p.role})` : p.name).join(", ")}</Item>
            )}
          </div>

          {notes && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">비고</div>
              <p className="text-sm whitespace-pre-wrap break-words">{notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
            <div className="sm:w-36"><BidParticipationSelect value={row.participation_type} label={`${row.project_name} 참여 구분`} disabled={classifying} onChange={onClassify} /></div>
            <div className="grid grid-cols-3 gap-2 sm:ml-auto sm:flex">
              <Button size="sm" variant="outline" className="px-2" onClick={onMove}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />{opened ? "진행중으로" : "개찰완료로"}</Button>
              <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" />수정</Button>
              <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" />삭제</Button>
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
};

export { linkHost };
