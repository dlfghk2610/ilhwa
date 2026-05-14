import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "app_theme_color";

const PRESETS = [
  { name: "기본 블루", hex: "#1d4ed8" },
  { name: "딥 네이비", hex: "#0f1b3d" },
  { name: "에메랄드", hex: "#0d7a5f" },
  { name: "퍼플", hex: "#7c3aed" },
  { name: "로즈", hex: "#e11d48" },
  { name: "오렌지", hex: "#ea580c" },
  { name: "틸", hex: "#0d9488" },
  { name: "차콜", hex: "#1f2937" },
];

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyTheme(hex: string) {
  const hsl = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--sidebar-primary", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
  root.style.setProperty("--primary-glow", hsl);
  root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${hsl}), hsl(${hsl} / 0.7))`);
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) applyTheme(saved);
}

export function ThemeSettings() {
  const [color, setColor] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || "#1d4ed8");

  useEffect(() => {
    applyTheme(color);
    localStorage.setItem(STORAGE_KEY, color);
  }, [color]);

  const r = parseInt(color.substring(1, 3), 16);
  const g = parseInt(color.substring(3, 5), 16);
  const b = parseInt(color.substring(5, 7), 16);

  const updateRgb = (nr: number, ng: number, nb: number) => {
    const clamp = (v: number) => Math.max(0, Math.min(255, v || 0));
    const hex = "#" + [clamp(nr), clamp(ng), clamp(nb)].map((v) => v.toString(16).padStart(2, "0")).join("");
    setColor(hex);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="색상 테마">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div>
            <Label className="text-xs">대표 색상</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => setColor(p.hex)}
                  className="h-10 rounded-md border-2 transition-all hover:scale-105"
                  style={{ backgroundColor: p.hex, borderColor: color.toLowerCase() === p.hex.toLowerCase() ? "hsl(var(--foreground))" : "transparent" }}
                  title={p.name}
                />
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">RGB 직접 선택</Label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">R</Label>
                <Input type="number" min={0} max={255} value={r} onChange={(e) => updateRgb(+e.target.value, g, b)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">G</Label>
                <Input type="number" min={0} max={255} value={g} onChange={(e) => updateRgb(r, +e.target.value, b)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">B</Label>
                <Input type="number" min={0} max={255} value={b} onChange={(e) => updateRgb(r, g, +e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setColor("#1d4ed8")}>
            기본값으로 초기화
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
