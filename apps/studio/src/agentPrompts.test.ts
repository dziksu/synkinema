import { expect, it } from "vitest";
import type { Channel } from "./api/generated/client";
import {
  agentInstructionsPrompt,
  channelAgentPrompt,
  projectAgentPrompt,
  sharedLibraryAgentPrompt,
  synkinemaMcpUrl,
} from "./agentPrompts";
import type { Project } from "./types";

it("builds revision-aware prompts for every Synkinema scope", () => {
  const channel = { id: "channel-1", name: "Launch desk" } as Channel;
  const project = {
    id: "project-1",
    name: "Autumn reveal",
    revision: 7,
    channel_id: channel.id,
  } as Project;

  expect(agentInstructionsPrompt()).toContain(synkinemaMcpUrl);
  expect(agentInstructionsPrompt()).toContain("get_agent_guide");
  expect(channelAgentPrompt(channel)).toContain("channel-1");
  expect(projectAgentPrompt(project)).toContain("confirmed revision: 7");
  expect(sharedLibraryAgentPrompt({ id: "music", name: "Music" })).toContain(
    "Music (music)",
  );
});
