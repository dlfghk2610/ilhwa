import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { ThemeSettings } from "./ThemeSettings";
import { ScrollButtons } from "./ScrollButtons";
import { useMenu } from "@/lib/menu-config";

export const AppLayout = ({ children, title }: { children: React.ReactNode; title: string }) => {
  const { pathname } = useLocation();
  const menu = useMenu();
  const shown = menu.find((m) => m.url === pathname)?.title ?? title;
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4 sticky top-0 z-10 shadow-card">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold text-foreground flex-1 truncate">{shown}</h1>
            <ThemeSettings />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
        <ScrollButtons />
      </div>
    </SidebarProvider>
  );
};
