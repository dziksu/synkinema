import { ArrowRight, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  agentClientConfig,
  agentClientGuides,
  agentClientNames,
  agentClients,
  agentConnectionProbe,
  type AgentClient,
  validMcpUrl,
} from "./agentConnections";
import { agentInstructionsPrompt, synkinemaMcpUrl } from "./agentPrompts";
import { tr } from "./i18n";

function setupHint(client: AgentClient): string {
  switch (client) {
    case "codex":
      return tr(
        "Run the command on the computer running Synkinema, then open a fresh Codex session.",
      );
    case "claude-code":
      return tr(
        "Run the command locally, then open Claude Code and check /mcp.",
      );
    case "claude-desktop":
      return tr(
        "Merge this into Claude Desktop's local configuration and restart it. Node.js and npx are required for the third-party bridge.",
      );
    case "copilot-vscode":
      return tr(
        "Merge this into VS Code's MCP configuration, start the server and enable its tools in agent chat.",
      );
    case "copilot-cli":
      return tr(
        "Run the command locally, then start a new Copilot CLI session.",
      );
    case "cursor":
      return tr(
        "Merge this into Cursor's MCP configuration and enable the server in Cursor settings.",
      );
    case "gemini":
      return tr(
        "Merge this into Gemini CLI settings, start a fresh session and check /mcp.",
      );
    case "other":
      return tr(
        "Choose a native Streamable HTTP connection. Clients that only support stdio need a local bridge; see the detailed guide.",
      );
  }
}

function setupTarget(client: AgentClient): string {
  switch (client) {
    case "codex":
      return tr("Terminal · Codex desktop, CLI or IDE");
    case "claude-code":
      return tr("Terminal · Claude Code");
    case "claude-desktop":
      return tr("claude_desktop_config.json · merge mcpServers");
    case "copilot-vscode":
      return tr(".vscode/mcp.json · merge servers");
    case "copilot-cli":
      return tr("Terminal · Copilot CLI");
    case "cursor":
      return tr(".cursor/mcp.json · merge mcpServers");
    case "gemini":
      return tr(".gemini/settings.json · merge mcpServers");
    case "other":
      return tr("Streamable HTTP · server name synkinema");
  }
}

export default function AgentConnectionGuide({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [client, setClient] = useState<AgentClient>("codex");
  const [url, setUrl] = useState(synkinemaMcpUrl);
  const endpoint = url.trim();
  const valid = validMcpUrl(endpoint);
  const config = agentClientConfig(client, endpoint);

  async function copy(value: string, success: string) {
    if (!navigator.clipboard?.writeText) {
      onNotice(
        tr("Unable to copy. Check your browser's clipboard permissions."),
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      onNotice(success);
    } catch {
      onNotice(
        tr("Unable to copy. Check your browser's clipboard permissions."),
      );
    }
  }

  return (
    <section
      className="setting-card agent-connect-card"
      aria-labelledby="agent-connect-title"
    >
      <Sparkles aria-hidden="true" />
      <h2 id="agent-connect-title">{tr("Connect an AI agent")}</h2>
      <p>
        {tr(
          "Give your AI client access to Synkinema's MCP tools to create and edit videos in the same projects you use in Studio.",
        )}
      </p>

      <h3>{tr("1. Choose your AI client")}</h3>
      <div
        className="agent-client-list"
        role="group"
        aria-label={tr("AI clients")}
      >
        {agentClients.map((item) => (
          <button
            key={item}
            type="button"
            className="agent-client-option"
            aria-pressed={client === item}
            onClick={() => setClient(item)}
          >
            {item === "other" ? tr("Other clients") : agentClientNames[item]}
          </button>
        ))}
      </div>

      <label className="agent-url-field" htmlFor="agent-mcp-url">
        {tr("MCP address")}
        <input
          id="agent-mcp-url"
          type="url"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-invalid={!valid}
          aria-describedby={!valid ? "agent-url-error" : undefined}
        />
      </label>
      {!valid && (
        <p className="agent-url-error" id="agent-url-error" role="alert">
          {tr("Enter a full HTTP or HTTPS address ending in /mcp/.")}
        </p>
      )}
      <p className="agent-connect-note">
        {tr(
          "Use the local address and port visible to your AI client. A cloud-hosted agent cannot reach your computer's localhost.",
        )}
      </p>

      <h3>{tr("2. Add Synkinema to your client")}</h3>
      <p className="agent-config-target">{setupTarget(client)}</p>
      <pre className="agent-config-preview">{config}</pre>
      <div className="agent-connect-actions">
        <button
          type="button"
          className="button"
          disabled={!valid}
          onClick={() => void copy(config, tr("Agent configuration copied"))}
        >
          <Copy size={15} /> {tr("Copy configuration")}
        </button>
        <a
          className="text-button"
          href={agentClientGuides[client]}
          target="_blank"
          rel="noreferrer"
        >
          {tr("Detailed setup guide")} <ArrowRight size={15} />
        </a>
      </div>
      <p className="agent-connect-note">{setupHint(client)}</p>
      {!["codex", "claude-code", "copilot-cli", "other"].includes(client) && (
        <p className="agent-connect-note">
          {tr(
            "Merge JSON into an existing configuration; keep your other MCP servers.",
          )}
        </p>
      )}

      <h3>{tr("3. Verify, then create")}</h3>
      <p className="agent-connect-note">
        {tr(
          "Paste this read-only check into a fresh agent chat. Real tool responses confirm the connection.",
        )}
      </p>
      <pre className="agent-config-preview">{agentConnectionProbe}</pre>
      <div className="agent-connect-actions">
        <button
          type="button"
          className="button"
          onClick={() =>
            void copy(agentConnectionProbe, tr("Connection check copied"))
          }
        >
          <Copy size={15} /> {tr("Copy connection check")}
        </button>
      </div>
      <p className="agent-connect-note">
        {tr(
          "After the check succeeds, paste the workflow instructions and describe the video you want. Project and channel pages also provide scoped prompts.",
        )}
      </p>
      <pre className="agent-instructions-preview">
        {agentInstructionsPrompt(endpoint)}
      </pre>
      <button
        type="button"
        className="button"
        disabled={!valid}
        onClick={() =>
          void copy(
            agentInstructionsPrompt(endpoint),
            tr("Agent workflow instructions copied"),
          )
        }
      >
        <Copy size={15} /> {tr("Copy agent instructions")}
      </button>
    </section>
  );
}
