import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "app_theme_color";
const SIDEBAR_KEY = "app_sidebar_color";

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

const SIDEBAR_PRESETS = [
  { name: "다크 네이비", hex: "#15233d" },
  { name: "딥 블랙", hex: "#0a0a0a" },
  { name: "차콜", hex: "#1f2937" },
  { name: "포레스트", hex: "#14342b" },
  { name: "버건디", hex: "#3d1520" },
  { name: "인디고", hex: "#1e1b4b" },
  { name: "라이트 그레이", hex: "#f1f5f9" },
  { name: "웜 화이트", hex: "#faf8f5" },
];

function hexToHsl(hex: string): { hsl: string; l: number } {
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
  const H = Math.round(h * 360), S = Math.round(s * 100), L = Math.round(l * 100);
  return { hsl: `${H} ${S}% ${L}%`, l: L };
}

function applyPrimary(hex: string) {
  const { hsl } = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--primary-glow", hsl);
  root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${hsl}), hsl(${hsl} / 0.7))`);
}

function applySidebar(hex: string) {
  const { hsl, l } = hexToHsl(hex);
  const root = document.documentElement;
  const isLight = l > 60;
  const fg = isLight ? "215 30% 15%" : "210 25% 88%";
  const accent = isLight ? `${hsl.split(" ")[0]} 20% 88%` : `${hsl.split(" ")[0]} 30% 18%`;
  const accentFg = isLight ? "215 30% 15%" : "210 30% 95%";
  const border = isLight ? "215 20% 85%" : "215 30% 20%";
  root.style.setProperty("--sidebar-background", hsl);
  root.style.setProperty("--sidebar-foreground", fg);
  root.style.setProperty("--sidebar-accent", accent);
  root.style.setProperty("--sidebar-accent-foreground", accentFg);
  root.style.setProperty("--sidebar-border", border);
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) applyPrimary(saved);
  const sb = localStorage.getItem(SIDEBAR_KEY);
  if (sb) applySidebar(sb);
}

function ColorEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const r = parseInt(value.substring(1, 3), 16) || 0;
  const g = parseInt(value.substring(3, 5), 16) || 0;
  const b = parseInt(value.substring(5, 7), 16) || 0;
  const updateRgb = (nr: number, ng: number, nb: number) => {
    const clamp = (v: number) => Math.max(0, Math.min(255, v || 0));
    onChange("#" + [clamp(nr), clamp(ng), clamp(nb)].map((v) => v.toString(16).padStart(2, "0")).join(""));
  };
  return (
    <div>
      <div className="flex items-center gap-2 mt-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded cursor-pointer border" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Input type="number" min={0} max={255} value={r} onChange={(e) => updateRgb(+e.target.value, g, b)} className="h-8 text-xs" placeholder="R" />
        <Input type="number" min={0} max={255} value={g} onChange={(e) => updateRgb(r, +e.target.value, b)} className="h-8 text-xs" placeholder="G" />
        <Input type="number" min={0} max={255} value={b} onChange={(e) => updateRgb(r, g, +e.target.value)} className="h-8 text-xs" placeholder="B" />
      </div>
    </div>
  );
}

export function ThemeSettings() {
  const [color, setColor] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || "#1d4ed8");
  const [sidebarColor, setSidebarColor] = useState<string>(() => localStorage.getItem(SIDEBAR_KEY) || "#15233d");

  useEffect(() => {
    applyPrimary(color);
    localStorage.setItem(STORAGE_KEY, color);
  }, [color]);

  useEffect(() => {
    applySidebar(sidebarColor);
    localStorage.setItem(SIDEBAR_KEY, sidebarColor);
  }, [sidebarColor]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="색상 테마">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto" align="end">
        <div className="space-y-5">
          <div>
            <Label className="text-sm font-semibold">대표 색상 (Primary)</Label>
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
            <ColorEditor value={color} onChange={setColor} />
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">좌측 메뉴 색상 (Sidebar)</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {SIDEBAR_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => setSidebarColor(p.hex)}
                  className="h-10 rounded-md border-2 transition-all hover:scale-105"
                  style={{ backgroundColor: p.hex, borderColor: sidebarColor.toLowerCase() === p.hex.toLowerCase() ? "hsl(var(--foreground))" : "transparent" }}
                  title={p.name}
                />
              ))}
            </div>
            <ColorEditor value={sidebarColor} onChange={setSidebarColor} />
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={() => { setColor("#1d4ed8"); setSidebarColor("#15233d"); }}>
            기본값으로 초기화
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
