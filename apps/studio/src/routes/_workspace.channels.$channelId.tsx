import { reads } from "@/api/queries";
import { ChannelsPage } from "@/modules/channels/channels-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/channels/$channelId")({
  ssr: true,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      reads.channel(context.queryClient, params.channelId),
    );
  },
  component: Page,
});
function Page() {
  return <ChannelsPage channelId={Route.useParams().channelId} />;
}
