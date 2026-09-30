import { reads } from "@/api/queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { tr } from "@/lib/i18n";
import { seconds } from "@/lib/time";
import type { Project } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Clapperboard,
  Film,
  Grid2X2,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateProjectDialog } from "./create-project-dialog";
import type { ProjectSearch } from "./project-search";
import ProjectManager from "./ProjectManager";
import { projectsByCreatedAt } from "./projectOrder";
import ProjectThumbnail from "./ProjectThumbnail";

export function ProjectsPage({ search }: { search: ProjectSearch }) {
  const client = useQueryClient(),
    navigate = useNavigate();
  const projects = useQuery(reads.projects(client)),
    assets = useQuery(reads.inventory(client)),
    channels = useQuery(reads.channels(client)),
    jobs = useQuery(reads.jobs(client));
  const [creating, setCreating] = useState(false),
    [manage, setManage] = useState<{
      project: Project;
      mode: "edit" | "delete";
    }>();
  const change = (patch: Partial<ProjectSearch>) =>
    void navigate({
      to: "/projects",
      search: { ...search, ...patch },
      replace: true,
    });
  if (projects.isPending) return <LoadingState />;
  if (projects.error)
    return (
      <ErrorState
        error={projects.error}
        retry={() => void projects.refetch()}
      />
    );
  const filtered = projects.data.filter((p) =>
    p.name.toLowerCase().includes(search.q.toLowerCase()),
  );
  const visible =
    search.sort === "name"
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      : projectsByCreatedAt(filtered);
  return (
    <div className="projects-page mx-auto w-full max-w-[1600px] space-y-7 p-5 lg:p-9">
      <section className="projects-hero">
        <div className="projects-hero-copy">
          <div className="projects-hero-eyebrow">
            <span className="projects-hero-spark" aria-hidden="true" />
            {tr("Your creative workspace")}
          </div>
          <h1>{tr("Every story starts here.")}</h1>
          <p>
            {tr("Pick up where you left off, or make room for your next idea.")}
          </p>
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus />
            {tr("New project")}
          </Button>
        </div>
        <div className="projects-metrics">
          {[
            { label: tr("Projects"), value: projects.data.length, icon: Film },
            {
              label: tr("Editorial channels"),
              value: channels.data?.filter((c) => !c.archived).length,
              icon: Radio,
            },
            {
              label: tr("Active exports"),
              value: jobs.data?.filter((j) =>
                ["running", "queued"].includes(j.status),
              ).length,
              icon: Clapperboard,
            },
          ].map((metric, index) => (
            <div
              className={`projects-metric projects-metric-${index}`}
              key={metric.label}
            >
              <span className="projects-metric-icon">
                <metric.icon aria-hidden="true" />
              </span>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value ?? "—"}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
      {(assets.error || channels.error || jobs.error) && (
        <ErrorState
          error={(assets.error || channels.error || jobs.error)!}
          retry={() => {
            void assets.refetch();
            void channels.refetch();
            void jobs.refetch();
          }}
        />
      )}
      <div className="projects-toolbar flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-base font-semibold">
          {tr("All projects")}{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {projects.data.length}
          </span>
        </h2>
        <SearchField
          wrapperClassName="w-full sm:w-64"
          aria-label={tr("Search projects")}
          placeholder={tr("Search projects…")}
          value={search.q}
          onChange={(e) => change({ q: e.target.value })}
        />
        <NativeSelect
          aria-label={tr("Sort projects")}
          value={search.sort}
          onChange={(e) =>
            change({ sort: e.target.value as ProjectSearch["sort"] })
          }
        >
          <NativeSelectOption value="newest">
            {tr("Newest first")}
          </NativeSelectOption>
          <NativeSelectOption value="name">{tr("Name A–Z")}</NativeSelectOption>
        </NativeSelect>
        <div className="flex rounded-lg border p-0.5">
          <Button
            size="icon"
            variant={search.view === "grid" ? "secondary" : "ghost"}
            aria-label={tr("Grid view")}
            aria-pressed={search.view === "grid"}
            onClick={() => change({ view: "grid" })}
          >
            <Grid2X2 />
          </Button>
          <Button
            size="icon"
            variant={search.view === "list" ? "secondary" : "ghost"}
            aria-label={tr("List view")}
            aria-pressed={search.view === "list"}
            onClick={() => change({ view: "list" })}
          >
            <List />
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={tr(
            search.q ? "No matching projects" : "Your first story is waiting",
          )}
          description={tr(
            search.q
              ? "Try a different name or clear your search."
              : "Create a project to bring your video, audio and ideas together.",
          )}
          action={
            <Button
              onClick={() => (search.q ? change({ q: "" }) : setCreating(true))}
            >
              {tr(search.q ? "Clear search" : "New project")}
            </Button>
          }
        />
      ) : (
        <div
          className={
            search.view === "grid"
              ? "projects-results grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "projects-results grid gap-3"
          }
        >
          {visible.map((project) => {
            const pending = project.id.startsWith("pending:");
            return (
              <Card
                key={project.id}
                className={`project-tile group overflow-hidden py-0 ${search.view === "list" ? "flex-row items-center gap-0" : "gap-0"}`}
                aria-busy={pending}
              >
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  disabled={pending}
                  aria-label={tr("Open project {{name}}", {
                    name: project.name,
                  })}
                  className={`project-cover-v2 relative flex items-center justify-center overflow-hidden bg-muted ${search.view === "list" ? "aspect-video w-40 shrink-0" : "aspect-video w-full"}`}
                >
                  <ProjectThumbnail
                    project={project}
                    assets={assets.data || []}
                  />
                  <Badge
                    variant="secondary"
                    className="project-resolution absolute bottom-3 left-3 text-[10px]"
                  >
                    {project.profile.width} × {project.profile.height}
                  </Badge>
                  <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-background/90 opacity-0 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight className="size-4" />
                  </span>
                </Link>
                <CardContent className="project-tile-content flex min-w-0 flex-1 items-start gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      disabled={pending}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {project.channel_context?.channel.name ||
                        tr("Independent project")}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{seconds(project.duration_ms)}</span>
                      <span>·</span>
                      <span>
                        {tr("trackCount", { count: project.tracks.length })}
                      </span>
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {pending ? tr("Creating…") : `r${project.revision}`}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={tr("Project actions")}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setManage({ project, mode: "edit" })}
                      >
                        <Pencil />
                        {tr("Edit project")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setManage({ project, mode: "delete" })}
                      >
                        <Trash2 />
                        {tr("Delete project")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="projects-agent-note flex flex-wrap items-center gap-4 rounded-xl border p-5">
        <div className="flex-1">
          <h3 className="text-sm font-medium">{tr("Create with an agent.")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(
              "The same project. The same timeline. Edit manually or connect an agent through MCP.",
            )}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/settings">
            {tr("Connect an AI agent")}
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
      {manage && (
        <ProjectManager
          {...manage}
          onClose={() => setManage(undefined)}
          onDeleted={(message) => toast.success(message)}
        />
      )}
    </div>
  );
}
