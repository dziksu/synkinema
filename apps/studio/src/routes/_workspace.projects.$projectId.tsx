import { reads } from "@/api/queries";
import { LoadingState } from "@/components/query-state";
import { EditorPage } from "@/modules/editor/editor-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/projects/$projectId")({
  ssr: false,
  loader: ({ context, params }) =>
    context.queryClient.prefetchQuery(
      reads.project(context.queryClient, params.projectId),
    ),
  pendingComponent: LoadingState,
  component: Page,
});
function Page() {
  const { projectId } = Route.useParams();
  return <EditorPage key={projectId} projectId={projectId} />;
}
