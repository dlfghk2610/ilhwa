import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Award, Briefcase, Layers, Building2, Database, Building, LogOut } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "입찰참가관리", url: "/bids", icon: FileText },
  { title: "PQ 개인별 실적관리", url: "/performances", icon: Award },
  { title: "PQ 개인별 경력관리", url: "/careers", icon: Briefcase },
  { title: "PQ 기술자별 업무중첩도", url: "/overlaps", icon: Layers },
  { title: "PQ 유사용역 (회사실적)", url: "/similar-services", icon: Building2 },
  { title: "실적 데이터베이스 관리", url: "/performance-database", icon: Database },
  { title: "타회사 실적 데이터베이스 관리", url: "/external-performance-database", icon: Building },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

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
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <NavLink to={item.url} end>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
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
