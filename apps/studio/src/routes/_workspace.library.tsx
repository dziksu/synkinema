import { reads } from "@/api/queries";
import { LibraryPage } from "@/modules/media/library-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/library")({
  ssr: true,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      reads.inventory(context.queryClient),
    );
  },
  component: Page,
});
function Page() {
  return <LibraryPage />;
}
