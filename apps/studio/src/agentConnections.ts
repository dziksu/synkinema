import { synkinemaMcpUrl } from "./agentPrompts";

export const agentClients = [
  "codex",
  "claude-code",
  "claude-desktop",
  "copilot-vscode",
  "copilot-cli",
  "cursor",
  "gemini",
  "other",
] as const;

export type AgentClient = (typeof agentClients)[number];

export const agentClientNames: Record<AgentClient, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  "copilot-vscode": "GitHub Copilot · VS Code",
  "copilot-cli": "GitHub Copilot CLI",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  other: "Other clients",
};

const guideRoot =
  "https://github.com/dziksu/synkinema/blob/main/docs/integrations";

export const agentClientGuides: Record<AgentClient, string> = {
  codex: `${guideRoot}/CODEX.md`,
  "claude-code": `${guideRoot}/CLAUDE.md#claude-code`,
  "claude-desktop": `${guideRoot}/CLAUDE.md#claude-desktop-local-tools`,
  "copilot-vscode": `${guideRoot}/COPILOT.md#vs-code`,
  "copilot-cli": `${guideRoot}/COPILOT.md#copilot-cli`,
  cursor: `${guideRoot}/OTHER_CLIENTS.md#cursor`,
  gemini: `${guideRoot}/OTHER_CLIENTS.md#gemini-cli`,
  other: `${guideRoot}/OTHER_CLIENTS.md#generic-mcp-clients`,
};

export function validMcpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.endsWith("/mcp/")
    );
  } catch {
    return false;
  }
}

function shellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function jsonConfig(root: "servers" | "mcpServers", details: object): string {
  return JSON.stringify({ [root]: { synkinema: details } }, null, 2);
}

export function agentClientConfig(
  client: AgentClient,
  url = synkinemaMcpUrl,
): string {
  switch (client) {
    case "codex":
      return `codex mcp add synkinema --url ${shellArg(url)}`;
    case "claude-code":
      return `claude mcp add --transport http --scope user synkinema ${shellArg(url)}`;
    case "claude-desktop":
      return jsonConfig("mcpServers", {
        command: "npx",
        args: [
          "-y",
          "mcp-remote@0.13.5",
          url,
          "--transport",
          "http-only",
          "--allow-http",
        ],
      });
    case "copilot-vscode":
      return jsonConfig("servers", { type: "http", url });
    case "copilot-cli":
      return `copilot mcp add --transport http synkinema ${shellArg(url)}`;
    case "cursor":
      return jsonConfig("mcpServers", { url });
    case "gemini":
      return jsonConfig("mcpServers", { httpUrl: url, timeout: 180000 });
    case "other":
      return url;
  }
}

export const agentConnectionProbe = [
  "Use the Synkinema MCP server. Call get_agent_guide, get_capabilities,",
  "get_production_capabilities, get_voice_provider_status and list_projects.",
  "Summarize the actual tool responses. Do not create, edit, render or delete anything.",
].join("\n");
