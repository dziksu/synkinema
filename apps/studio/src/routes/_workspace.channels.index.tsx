import { reads } from "@/api/queries";
import { ChannelsPage } from "@/modules/channels/channels-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/channels/")({
  ssr: true,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      reads.channels(context.queryClient),
    );
  },
  component: Page,
});
function Page() {
  return <ChannelsPage />;
}
