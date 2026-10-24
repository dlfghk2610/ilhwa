import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";

// 파스텔 무지개 순서 (빨·주·노·초·하늘·파랑·남·보)
export const STATUS_OPTIONS = ["검토중", "PQ제출", "입찰참여", "낙찰", "탈락", "포기", "완료", "개찰완료"];

export function statusStyle(status: string | null | undefined): React.CSSProperties {
  const i = STATUS_OPTIONS.indexOf(status || "");
  if (i < 0) return {};
  return {
    backgroundColor: `hsl(var(--status-${i + 1}))`,
    color: `hsl(var(--status-fg))`,
    borderColor: `hsl(var(--status-${i + 1}) / 0.9)`,
  };
}

export function BidStatusPicker({ value, onChange, disabled, label }: {
  value: string | null; onChange: (v: string) => void; disabled?: boolean; label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" aria-label={label} onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap bg-muted text-muted-foreground disabled:opacity-60"
          style={statusStyle(value)}>
          {value || "상태"}<ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32" onClick={(e) => e.stopPropagation()}>
        {STATUS_OPTIONS.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => s !== value && onChange(s)} className="gap-2 text-xs">
            <span className="h-3 w-3 rounded-full border" style={statusStyle(s)} />
            <span className="flex-1">{s}</span>
            {s === value && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
