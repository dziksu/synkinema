import { SettingsPage } from "@/modules/settings/settings-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/settings")({
  ssr: true,
  component: Page,
});
function Page() {
  return <SettingsPage />;
}
