# Synkinema with GitHub Copilot

[All clients](../AGENT_SETUP.md) · [First MCP reel](../AGENT_QUICKSTART.md)

Start Synkinema first. Use the VS Code instructions for editor chat, or the CLI
instructions for Copilot in a terminal. Their JSON configuration roots differ.

## VS Code

Open the Command Palette, run **MCP: Add Server**, select HTTP and enter
`http://localhost:8080/mcp/`. Name the server `synkinema`, then choose user or
workspace scope. No Synkinema source checkout is required.

For manual workspace setup, create or merge `.vscode/mcp.json`:

```json
{
  "servers": {
    "synkinema": {
      "type": "http",
      "url": "http://localhost:8080/mcp/"
    }
  }
}
```

Use **MCP: Open User Configuration** for user-wide settings instead. Start the
server from the MCP configuration UI, review its trust prompt and enable the tools
in an agent chat. This file uses **`servers`**, not `mcpServers`.
[Official VS Code MCP setup](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## Copilot CLI

With a current Copilot CLI installed:

```sh
copilot mcp add --transport http synkinema http://localhost:8080/mcp/
```

You can also run `/mcp add` inside Copilot CLI and choose HTTP, the same URL and
the name `synkinema`. For manual user configuration, merge into
`~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "synkinema": {
      "type": "http",
      "url": "http://localhost:8080/mcp/",
      "tools": ["*"]
    }
  }
}
```

`tools: ["*"]` makes the server's tools available; it does not remove the client's
normal permission decisions. Project `.mcp.json` / `.github/mcp.json` configuration
requires trust in that folder.
[Official Copilot CLI MCP setup](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers).

## Verify and create

In an agent chat, send:

```text
Use the Synkinema MCP server. Read get_agent_guide, get_capabilities,
get_production_capabilities and get_voice_provider_status, then call list_projects.
Summarize the actual results without editing any project.
```

If Synkinema tools are absent, inspect the server status/output in the client,
check the URL and JSON root, then restart the connection. Once discovery works,
use the [ready-to-paste reel brief](../AGENT_QUICKSTART.md#ready-to-paste-brief).

## Remote environments

In a remote SSH, WSL or development-container workspace, check where the MCP client
runs: its `localhost` may be a different machine. Use an appropriate local client
configuration or the [private tunnel](../AGENT_SETUP.md#connecting-from-another-machine).
The hosted GitHub coding agent does not automatically gain access to your laptop's
Docker service by receiving this URL.
