# Synkinema with Cursor, Gemini CLI and other MCP clients

[All clients](../AGENT_SETUP.md) · [First MCP reel](../AGENT_QUICKSTART.md)

Start Synkinema and verify [Studio](http://localhost:8080) opens before configuring
your client. Merge entries into existing files; preserve other configured servers.

## Cursor

Use `.cursor/mcp.json` in a workspace or `~/.cursor/mcp.json` for user-wide access:

```json
{
  "mcpServers": {
    "synkinema": {
      "url": "http://localhost:8080/mcp/"
    }
  }
}
```

Enable the server in Cursor's MCP/tool settings, then use an agent chat to run
the probe below. The URL connection uses HTTP directly; no stdio bridge is needed.
[Official Cursor MCP configuration](https://cursor.com/help/customization/mcp).

## Gemini CLI

Merge into `~/.gemini/settings.json`, or `.gemini/settings.json` in the project:

```json
{
  "mcpServers": {
    "synkinema": {
      "httpUrl": "http://localhost:8080/mcp/",
      "timeout": 180000
    }
  }
}
```

Use **`httpUrl`** for Streamable HTTP; Gemini's `url` setting selects the older SSE
transport. The timeout is in **milliseconds**, so 180000 means three minutes for a
single call. Leave tool approvals at their normal defaults. Use `/mcp` to inspect
the server in Gemini CLI.
[Official Gemini CLI MCP configuration](https://geminicli.com/docs/tools/mcp-server/).

## Generic MCP clients

Choose a native **Streamable HTTP** connection to `http://localhost:8080/mcp/`.
Configuration key names are client-specific: do not assume that another client's
`type`, `url` or JSON root is accepted. Authentication is absent by default.

For a stdio-only client, use the [mcp-remote bridge example](CLAUDE.md#claude-desktop-local-tools)
and adapt only the containing configuration structure to that client's schema.
Node.js and `npx` must be available on the client machine. Synkinema itself does
not expose a native stdio command.

## Read-only probe

```text
Use Synkinema MCP. Call get_agent_guide, get_capabilities,
get_production_capabilities, get_voice_provider_status and list_projects. Tell me
what the server actually supports and which local models are installed. Do not
change anything.
```

Then continue with the [first reel guide](../AGENT_QUICKSTART.md). Clients capable
of showing MCP image content can inspect source sheets and rendered frames
directly; a text-only client must report that visual review remains outstanding.
For network issues or cloud clients, see [connection troubleshooting](../AGENT_SETUP.md).
