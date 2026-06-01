import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const PRIMARY_BASE = "app_theme_color";
const SIDEBAR_BASE = "app_sidebar_color";
const BACKGROUND_BASE = "app_background_color";
const DEFAULT_PRIMARY = "#1d4ed8";
const DEFAULT_SIDEBAR = "#15233d";
const DEFAULT_BACKGROUND = "#f6f8fb";

const primaryKey = (uid?: string | null) => (uid ? `${PRIMARY_BASE}:${uid}` : PRIMARY_BASE);
const sidebarKey = (uid?: string | null) => (uid ? `${SIDEBAR_BASE}:${uid}` : SIDEBAR_BASE);
const backgroundKey = (uid?: string | null) => (uid ? `${BACKGROUND_BASE}:${uid}` : BACKGROUND_BASE);

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

const BACKGROUND_PRESETS = [
  { name: "기본", hex: "#f6f8fb" },
  { name: "순백", hex: "#ffffff" },
  { name: "웜 화이트", hex: "#faf8f5" },
  { name: "쿨 그레이", hex: "#eef2f7" },
  { name: "민트", hex: "#eef7f3" },
  { name: "라벤더", hex: "#f1eef9" },
  { name: "차콜", hex: "#1f2937" },
  { name: "딥 블랙", hex: "#0a0a0a" },
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

function applyBackground(hex: string) {
  const { hsl, l } = hexToHsl(hex);
  const root = document.documentElement;
  const isDark = l < 50;
  const fg = isDark ? "210 30% 95%" : "215 30% 15%";
  const h = hsl.split(" ")[0];
  const subtleTop = hsl;
  const subtleBottom = isDark ? `${h} 25% ${Math.max(l - 4, 4)}%` : `${h} 30% ${Math.max(l - 4, 70)}%`;
  root.style.setProperty("--background", hsl);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--gradient-subtle", `linear-gradient(180deg, hsl(${subtleTop}), hsl(${subtleBottom}))`);
}

/** Pre-auth init: applies the unscoped (legacy) saved theme if present, else defaults. */
export function initTheme() {
  const saved = localStorage.getItem(PRIMARY_BASE);
  if (saved) applyPrimary(saved);
  const sb = localStorage.getItem(SIDEBAR_BASE);
  if (sb) applySidebar(sb);
  const bg = localStorage.getItem(BACKGROUND_BASE);
  if (bg) applyBackground(bg);
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
  const { user } = useAuth();
  const uid = user?.id;

  // Lazily initialize from localStorage so the very first render already has the user's colors.
  const initialPrimary = () =>
    (typeof window !== "undefined" &&
      (localStorage.getItem(primaryKey(uid)) || localStorage.getItem(PRIMARY_BASE))) ||
    DEFAULT_PRIMARY;
  const initialSidebar = () =>
    (typeof window !== "undefined" &&
      (localStorage.getItem(sidebarKey(uid)) || localStorage.getItem(SIDEBAR_BASE))) ||
    DEFAULT_SIDEBAR;
  const initialBackground = () =>
    (typeof window !== "undefined" &&
      (localStorage.getItem(backgroundKey(uid)) || localStorage.getItem(BACKGROUND_BASE))) ||
    DEFAULT_BACKGROUND;

  const [color, setColor] = useState<string>(initialPrimary);
  const [sidebarColor, setSidebarColor] = useState<string>(initialSidebar);
  const [backgroundColor, setBackgroundColor] = useState<string>(initialBackground);
  const loadedUidRef = useRef<string | null | undefined>(undefined);

  // Load when user (scope) changes — apply localStorage values SYNCHRONOUSLY first, then refine from DB.
  useEffect(() => {
    let cancelled = false;

    // 1) Synchronous apply from localStorage — prevents flicker on remount/navigation
    const lsP = localStorage.getItem(primaryKey(uid)) || localStorage.getItem(PRIMARY_BASE) || DEFAULT_PRIMARY;
    const lsS = localStorage.getItem(sidebarKey(uid)) || localStorage.getItem(SIDEBAR_BASE) || DEFAULT_SIDEBAR;
    const lsB = localStorage.getItem(backgroundKey(uid)) || localStorage.getItem(BACKGROUND_BASE) || DEFAULT_BACKGROUND;
    applyPrimary(lsP);
    applySidebar(lsS);
    applyBackground(lsB);
    setColor(lsP);
    setSidebarColor(lsS);
    setBackgroundColor(lsB);
    loadedUidRef.current = uid ?? null;

    // 2) Refine from DB if signed in (may override localStorage if user changed theme on another device)
    if (uid) {
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("theme_primary, theme_sidebar, theme_background")
          .eq("id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (data?.theme_primary && data.theme_primary !== lsP) { setColor(data.theme_primary); applyPrimary(data.theme_primary); }
        if (data?.theme_sidebar && data.theme_sidebar !== lsS) { setSidebarColor(data.theme_sidebar); applySidebar(data.theme_sidebar); }
        if (data?.theme_background && data.theme_background !== lsB) { setBackgroundColor(data.theme_background); applyBackground(data.theme_background); }
      })();
    }
    return () => { cancelled = true; };
  }, [uid]);


  // Persist + apply on change
  useEffect(() => {
    if (loadedUidRef.current !== (uid ?? null)) return;
    applyPrimary(color);
    try {
      localStorage.setItem(primaryKey(uid), color);
      localStorage.setItem(PRIMARY_BASE, color); // unscoped: pre-React initTheme uses this
    } catch {}
    if (uid) supabase.from("profiles").update({ theme_primary: color }).eq("id", uid).then(() => {});
  }, [color, uid]);

  useEffect(() => {
    if (loadedUidRef.current !== (uid ?? null)) return;
    applySidebar(sidebarColor);
    try {
      localStorage.setItem(sidebarKey(uid), sidebarColor);
      localStorage.setItem(SIDEBAR_BASE, sidebarColor);
    } catch {}
    if (uid) supabase.from("profiles").update({ theme_sidebar: sidebarColor }).eq("id", uid).then(() => {});
  }, [sidebarColor, uid]);

  useEffect(() => {
    if (loadedUidRef.current !== (uid ?? null)) return;
    applyBackground(backgroundColor);
    try {
      localStorage.setItem(backgroundKey(uid), backgroundColor);
      localStorage.setItem(BACKGROUND_BASE, backgroundColor);
    } catch {}
    if (uid) supabase.from("profiles").update({ theme_background: backgroundColor }).eq("id", uid).then(() => {});
  }, [backgroundColor, uid]);

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

          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">배경 색상 (Background)</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {BACKGROUND_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => setBackgroundColor(p.hex)}
                  className="h-10 rounded-md border-2 transition-all hover:scale-105"
                  style={{ backgroundColor: p.hex, borderColor: backgroundColor.toLowerCase() === p.hex.toLowerCase() ? "hsl(var(--foreground))" : "transparent" }}
                  title={p.name}
                />
              ))}
            </div>
            <ColorEditor value={backgroundColor} onChange={setBackgroundColor} />
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={() => { setColor(DEFAULT_PRIMARY); setSidebarColor(DEFAULT_SIDEBAR); setBackgroundColor(DEFAULT_BACKGROUND); }}>
            기본값으로 초기화
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
