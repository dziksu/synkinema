import PageHeader from "@/components/PageHeader";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tr } from "@/lib/i18n";
import { Clapperboard, ExternalLink, Mic, Palette } from "lucide-react";
import { toast } from "sonner";
import AgentConnectionGuide from "./AgentConnectionGuide";
export function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow={tr("Make it yours")}
        title={tr("Settings & integrations")}
        description={tr(
          "A workspace for you, your tools, and your creative process.",
        )}
      />
      <div className="settings-grid grid gap-6 px-6 pb-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] lg:px-9">
        <AgentConnectionGuide onNotice={(message) => toast(message)} />
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-4" />
                {tr("Appearance")}
              </CardTitle>
              <CardDescription>
                {tr("Choose a light, dark, or system theme.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm">{tr("Workspace theme")}</span>
              <ThemeToggle />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clapperboard className="size-4" />
                {tr("FFmpeg Engine")}
              </CardTitle>
              <CardDescription>
                {tr(
                  "Native H.264 + AAC rendering. Clip caching, two-pass loudness normalization and bounded thread usage.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  {tr("Open documentation")}
                  <ExternalLink />
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="size-4" />
                {tr("Voiceover")}
              </CardTitle>
              <CardDescription>
                {tr(
                  "Record, upload, or generate narration in each project's Script workspace.",
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </>
  );
}
