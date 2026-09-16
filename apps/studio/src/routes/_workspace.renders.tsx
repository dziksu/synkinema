import { reads } from "@/api/queries";
import { ExportsPage } from "@/modules/exports/exports-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/renders")({
  ssr: true,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(reads.jobs(context.queryClient));
  },
  component: Page,
});
function Page() {
  return <ExportsPage />;
}
