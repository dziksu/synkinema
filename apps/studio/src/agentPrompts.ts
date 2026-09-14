import type { Channel } from "./api/generated/client";
import { tr } from "./i18n";
import type { Project } from "./types";

export function mcpUrlForStudioLocation(href: string): string {
  try {
    const studio = new URL(href);
    if (studio.protocol === "http:" || studio.protocol === "https:") {
      const port = studio.port ? `:${studio.port}` : "";
      return `${studio.protocol}//localhost${port}/mcp/`;
    }
  } catch {
    // A non-browser context uses the documented local default.
  }
  return "http://localhost:18080/mcp/";
}

export const synkinemaMcpUrl = mcpUrlForStudioLocation(
  typeof window === "undefined" ? "" : window.location.href,
);

export function agentInstructionsPrompt(url = synkinemaMcpUrl) {
  return [
    tr("Synkinema agent instructions"),
    "",
    tr("Agent instruction connection", { url }),
    tr("Agent instruction workflow"),
    tr("Agent instruction safety"),
  ].join("\n");
}

export function channelAgentPrompt(channel: Channel) {
  return [
    agentInstructionsPrompt(),
    "",
    tr("Agent channel scope", { name: channel.name, id: channel.id }),
  ].join("\n");
}

export function projectAgentPrompt(project: Project) {
  return [
    agentInstructionsPrompt(),
    "",
    tr("Agent project scope", {
      name: project.name,
      id: project.id,
      revision: project.revision,
      channel: project.channel_id || tr("Independent project (no channel)"),
    }),
  ].join("\n");
}

export function sharedLibraryAgentPrompt(folder?: {
  id: string;
  name: string;
}) {
  return [
    agentInstructionsPrompt(),
    "",
    tr("Agent library scope", {
      folder: folder ? `${folder.name} (${folder.id})` : tr("all folders"),
    }),
  ].join("\n");
}
