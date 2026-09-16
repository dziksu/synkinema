import { reads } from "@/api/queries";
import { projectSearchSchema } from "@/modules/projects/project-search";
import { ProjectsPage } from "@/modules/projects/projects-page";
import {
  type SearchSchemaInput,
  createFileRoute,
} from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/projects/")({
  ssr: true,
  validateSearch: (
    search: SearchSchemaInput &
      Partial<import("@/modules/projects/project-search").ProjectSearch>,
  ) => projectSearchSchema.parse(search),
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      reads.projects(context.queryClient),
    );
  },
  component: Page,
});
function Page() {
  return <ProjectsPage search={Route.useSearch()} />;
}
