import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Pencil, Check, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMenu, saveMenu, resetMenu, type MenuDef } from "@/lib/menu-config";
import { LayoutDashboard, FileText, Award, Briefcase, Layers, Building2, Database, Building, LogOut, ShieldCheck, UserCog, Calculator, FlaskConical, GraduationCap, FolderArchive, Highlighter } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ICONS: Record<string, any> = {
  "/": LayoutDashboard, "/bids": FileText, "/performances": Award, "/careers": Briefcase,
  "/career-highlight": Highlighter, "/personal-history": UserCog, "/overlaps": Layers,
  "/pq-educations": GraduationCap, "/similar-services": Building2, "/pq-dev-records": FlaskConical,
  "/pq-forms": FolderArchive, "/performance-database": Database, "/external-performance-database": Building,
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);
  const menu = useMenu();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MenuDef[]>([]);
  const startEdit = () => { setDraft(menu.map((m) => ({ ...m }))); setEditing(true); };
  const finishEdit = () => { saveMenu(draft); setEditing(false); };
  const upd = (url: string, patch: Partial<MenuDef>) =>
    setDraft((d) => d.map((m) => (m.url === url ? { ...m, ...patch } : m)));
  // 상위 메뉴 뒤에 하위 메뉴가 오도록 정렬
  const tops = menu.filter((m) => !m.parent || !menu.some((x) => x.url === m.parent && !x.parent));
  const ordered: (MenuDef & { child: boolean })[] = [];
  tops.forEach((t) => {
    ordered.push({ ...t, parent: undefined, child: false });
    menu.filter((c) => c.parent === t.url && !tops.includes(c)).forEach((c) => ordered.push({ ...c, child: true }));
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md gradient-primary text-primary-foreground font-bold">
            PQ
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">PQ Manager</span>
              <span className="text-xs text-sidebar-foreground/60">사업수행능력평가</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>메뉴</span>
            {!collapsed && (editing ? (
              <span className="flex gap-1">
                <button type="button" title="기본값 복원" onClick={() => { resetMenu(); setEditing(false); }} className="p-1 rounded hover:bg-sidebar-accent"><RotateCcw className="h-3.5 w-3.5" /></button>
                <button type="button" title="저장" onClick={finishEdit} className="p-1 rounded hover:bg-sidebar-accent text-primary"><Check className="h-4 w-4" /></button>
              </span>
            ) : (
              <button type="button" title="메뉴 편집" onClick={startEdit} className="p-1 rounded hover:bg-sidebar-accent"><Pencil className="h-3.5 w-3.5" /></button>
            ))}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {editing && !collapsed ? (
              <div className="space-y-2 px-1 pb-2">
                <p className="text-[11px] text-sidebar-foreground/60">메뉴명과 상위 메뉴를 지정하세요. 상위 메뉴를 고르면 그 아래 하위 메뉴로 표시됩니다.</p>
                {draft.map((m) => {
                  const Icon = ICONS[m.url];
                  const hasChildren = draft.some((x) => x.parent === m.url);
                  return (
                    <div key={m.url} className="rounded-md border border-sidebar-border p-2 space-y-1.5 bg-sidebar">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <Input value={m.title} onChange={(e) => upd(m.url, { title: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <select
                        value={m.parent ?? ""}
                        disabled={hasChildren}
                        onChange={(e) => upd(m.url, { parent: e.target.value || undefined })}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">상위 메뉴 (최상위)</option>
                        {draft.filter((x) => x.url !== m.url && !x.parent).map((x) => (
                          <option key={x.url} value={x.url}>└ {x.title} 의 하위</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : (
            <SidebarMenu>
              {ordered.map((item) => {
                const Icon = ICONS[item.url];
                return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <NavLink to={item.url} end className={item.child && !collapsed ? "pl-7" : ""}>
                      {item.child && !collapsed && <span className="text-sidebar-foreground/50 -ml-1">└</span>}
                      <Icon className="h-4 w-4" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                );
              })}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/admin/users"}>
                    <NavLink to="/admin/users" end>
                      <ShieldCheck className="h-4 w-4" />
                      {!collapsed && <span>회원 승인 관리</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">로그아웃</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
