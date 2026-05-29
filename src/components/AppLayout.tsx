import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeSettings } from "./ThemeSettings";
import { ScrollButtons } from "./ScrollButtons";

export const AppLayout = ({ children, title }: { children: React.ReactNode; title: string }) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4 sticky top-0 z-10 shadow-card">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold text-foreground flex-1">{title}</h1>
            <ThemeSettings />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
        <ScrollButtons />
      </div>
    </SidebarProvider>
  );
};
