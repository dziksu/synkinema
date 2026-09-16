import { reads } from "@/api/queries";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { tr } from "@/lib/i18n";
import { appVersion } from "@/lib/version";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  FolderOpen,
  Layers,
  Radio,
  Settings2,
  Sparkles,
} from "lucide-react";

const navigation = [
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/channels", label: "Channels", icon: Radio },
  { to: "/library", label: "Media library", icon: Layers },
  { to: "/renders", label: "Render queue", icon: Clapperboard },
] as const;

export function WorkspaceShell() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const client = useQueryClient();
  const projects = useQuery(reads.projects(client));
  const jobs = useQuery(reads.jobs(client));
  const running =
    jobs.data?.filter((j) => j.status === "queued" || j.status === "running")
      .length || 0;
  const editor = /^\/projects\/[^/]+/.test(path);
  const current = navigation.find((n) => path.startsWith(n.to));
  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "15rem" } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-background focus:p-4"
      >
        {tr("Skip to main content")}
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="group-data-[collapsible=icon]:justify-center [&>span:last-child]:overflow-visible"
              >
                <Link to="/projects" aria-label="Synkinema">
                  <Logo />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{tr("Workspace")}</SidebarGroupLabel>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={tr(item.label)}
                    isActive={path.startsWith(item.to)}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{tr(item.label)}</span>
                      {item.to === "/renders" && running > 0 && (
                        <Badge className="ml-auto" variant="secondary">
                          {running}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>{tr("Recent projects")}</SidebarGroupLabel>
            <SidebarMenu>
              {projects.data
                ?.filter((p) => !p.id.startsWith("pending:"))
                .slice(0, 6)
                .map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={path === `/projects/${project.id}`}
                    >
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                          {project.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={tr("Settings")}
                isActive={path === "/settings"}
              >
                <Link to="/settings">
                  <Settings2 />
                  <span>{tr("Settings & integrations")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {tr("Local workspace")} · v{appVersion}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">
            {tr(editor ? "Video editor" : current?.label || "Settings")}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Sparkles className="size-3.5" />
              {tr("Made for your next story")}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={editor ? "workspace-main editor-main" : "workspace-main"}
        >
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
