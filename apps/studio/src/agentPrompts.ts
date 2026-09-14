import type { Channel } from "./api/generated/client";
import { tr } from "./i18n";
import type { Project } from "./types";

export const synkinemaMcpUrl = "http://localhost:8080/mcp/";

export function agentInstructionsPrompt() {
  return [
    tr("Synkinema agent instructions"),
    "",
    tr("Agent instruction connection", { url: synkinemaMcpUrl }),
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
