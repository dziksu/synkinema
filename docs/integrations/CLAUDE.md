# Synkinema with Claude

[All clients](../AGENT_SETUP.md) · [First MCP reel](../AGENT_QUICKSTART.md)

Choose the setup for the product you are actually using: Claude Code connects
directly over HTTP; local Claude Desktop tools can use a stdio bridge.

## Claude Code

Start Synkinema, then run:

```sh
claude mcp add --transport http --scope user synkinema http://localhost:18080/mcp/
claude mcp list
claude mcp get synkinema
```

User scope makes the connection available across your projects. For a shared
project setup, use `--scope project` instead; Claude Code writes `.mcp.json`.
Alternatively, merge this into that file:

```json
{
  "mcpServers": {
    "synkinema": {
      "type": "http",
      "url": "http://localhost:18080/mcp/"
    }
  }
}
```

Open Claude Code and run `/mcp` to inspect the connection. Accept any project-server
trust prompt before trying the read-only probe below.
[Official Claude Code MCP setup](https://code.claude.com/docs/en/mcp).

## Claude Desktop local tools

This path uses Claude Desktop's local MCP configuration and an optional third-party
bridge, **mcp-remote**, to connect its stdio transport to Synkinema's HTTP endpoint.
Install Node.js with `npx` on the computer running Claude Desktop, then merge:

```json
{
  "mcpServers": {
    "synkinema": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.13.5",
        "http://localhost:18080/mcp/",
        "--transport",
        "http-only",
        "--allow-http"
      ]
    }
  }
}
```

Configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Save the merged file, fully quit Claude Desktop and reopen it. The desktop process
must be able to find `npx`; use the actual absolute executable path if it cannot.
[Local Claude Desktop configuration](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

The first bridge launch downloads the pinned npm package. `http-only` selects
Streamable HTTP; `--allow-http` permits this local, non-TLS URL. The bridge runs
on the client, while Synkinema continues to run in Docker. It is a separate MIT
project, not a Synkinema binary.
[mcp-remote configuration](https://github.com/punkpeye/mcp-remote).

## Verify and create

```text
Use Synkinema MCP. Read get_agent_guide, get_capabilities,
get_production_capabilities and get_voice_provider_status, then call list_projects.
Explain which local models are installed. Do not modify anything yet.
```

Once the tools return real data, continue with the
[first reel walkthrough](../AGENT_QUICKSTART.md). A model's written assurance that
it connected is not a substitute for actual tool results.

## Claude web connectors and Cowork

Claude's remote connectors connect from Anthropic's cloud, including when added
through Desktop or Cowork. Pasting `http://localhost:18080/mcp/` into that remote
connector flow will not reach your computer. Local Desktop MCP tools use the
configuration above and are separate from remote connectors.
[Official connector networking](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Use Claude Code or local Desktop tools for the default Docker installation. For
another trusted computer, see [private connections](../AGENT_SETUP.md#connecting-from-another-machine).
For optional token mode, consult the client's header/secret configuration and the
[server authentication notes](../AGENT_SETUP.md#optional-bearer-authentication).
