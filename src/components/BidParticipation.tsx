import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PARTICIPATION_TYPES, normalizeParticipation, type ParticipationType } from "@/lib/bid-participation";

export function BidParticipationBadge({ value }: { value: unknown }) {
  const type = normalizeParticipation(value);
  return <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-bold ${type === "대표참여" ? "border-primary/40 bg-primary text-primary-foreground" : type === "도급참여" ? "border-accent/40 bg-accent text-accent-foreground" : "border-border bg-muted text-muted-foreground"}`}>{type || "미분류"}</span>;
}

export function BidParticipationSelect({ value, onChange, label, disabled }: {
  value: unknown; onChange: (value: ParticipationType | null) => void; label: string; disabled?: boolean;
}) {
  return <Select value={normalizeParticipation(value) || "unclassified"} onValueChange={v => onChange(normalizeParticipation(v))} disabled={disabled}>
    <SelectTrigger aria-label={label} className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="unclassified">미분류</SelectItem>
      {PARTICIPATION_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
    </SelectContent>
  </Select>;
}