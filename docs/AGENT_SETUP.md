# Connect an agent to Synkinema

[Documentation](README.md) · [First MCP reel](AGENT_QUICKSTART.md) · [API reference](API_MCP.md)

Run Synkinema once, connect your local AI client, then ask it to edit the same
projects you see in Studio. No repository checkout or Synkinema SDK is needed on
the client. Start the container with the [README quick start](../README.md#quick-start).
Studio's **Engine and integrations → Connect an AI agent** section lets you pick
Codex, Claude Code/Desktop, GitHub Copilot (VS Code/CLI), Cursor, Gemini CLI or
another MCP client. It shows a copyable client-specific configuration, a read-only
connection check and a workflow prompt. It does not install software or claim a
connection before the client returns actual MCP tool results.

## Connection details

| Setting | Value for the default installation |
|---|---|
| Server name | `synkinema` |
| URL | `http://localhost:18080/mcp/` |
| Transport | Streamable HTTP |
| Authentication | None on the default local installation |
| Studio | [http://localhost:18080](http://localhost:18080) |
| Health | [http://localhost:18080/api/health](http://localhost:18080/api/health) |

Keep the trailing `/` in the MCP URL. `/api` is REST, `/api/docs` is Swagger,
and `/` is the editor; none of these is the MCP endpoint. Synkinema does not
provide a native stdio command or a legacy SSE endpoint. The MCP client handles
the protocol handshake and tool calls; do not POST tool JSON directly to `/mcp/`.

If you mapped a different host port, replace **18080 in every client URL**.
You can use `127.0.0.1` instead of `localhost` if local IPv6 resolution causes
connection failures.

## Pick your client

Configuration formats are different; copy the example for your actual client.
Merge server entries into an existing configuration rather than replacing it.

| Client | Configuration / connection | Guide |
|---|---|---|
| Codex desktop, CLI, IDE extension | `~/.codex/config.toml`, native HTTP | [Codex](integrations/CODEX.md) |
| Claude Code | CLI command or project `.mcp.json`, native HTTP | [Claude](integrations/CLAUDE.md#claude-code) |
| Claude Desktop local tools | `claude_desktop_config.json`, stdio-to-HTTP bridge | [Claude Desktop](integrations/CLAUDE.md#claude-desktop-local-tools) |
| GitHub Copilot in VS Code | `.vscode/mcp.json` or user configuration, native HTTP | [VS Code](integrations/COPILOT.md#vs-code) |
| Copilot CLI | CLI command or `~/.copilot/mcp-config.json`, native HTTP | [Copilot CLI](integrations/COPILOT.md#copilot-cli) |
| Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json`, native HTTP | [Cursor](integrations/OTHER_CLIENTS.md#cursor) |
| Gemini CLI | `.gemini/settings.json` or `~/.gemini/settings.json`, `httpUrl` | [Gemini](integrations/OTHER_CLIENTS.md#gemini-cli) |
| Other client | Native Streamable HTTP, or the bridge for stdio-only clients | [Other clients](integrations/OTHER_CLIENTS.md#generic-mcp-clients) |

The examples describe local clients. A web chat or hosted coding agent runs
elsewhere: its `localhost` is not your computer. In particular, Claude remote
connectors originate in Anthropic's cloud even when configured from Desktop;
use the local Desktop setup for a local server.
[Claude connector networking](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Verify the connection

1. Open Studio and check that `/api/health` returns successfully. This verifies
   the server, not the MCP connection itself.
2. Add the server in your AI client. Start/enable it and accept the client's
   server trust prompt if presented.
3. Open a fresh agent session, or reload its tools as described by that client.
4. Send this read-only probe:

```text
Use Synkinema MCP. Call get_agent_guide, get_capabilities,
get_production_capabilities, get_voice_provider_status and list_projects. Report
the server capabilities, available speech providers and installed transcription
models. Do not create, edit, render or delete anything.
```

Success means **real tool responses**, including your actual projects (or an empty
list on a fresh installation). A conversational answer claiming to be connected,
or merely opening the editor in a browser, is not a handshake check.

Read the tool list and capabilities from the running image. New production tools
may not exist in an older release. Use the [creation walkthrough](AGENT_QUICKSTART.md)
after this probe succeeds.

## Optional bearer authentication

The default localhost setup does not require a token. If you deliberately configure
`SYNKINEMA_API_TOKEN` **on the server**, configure your client to send the matching
`Authorization: Bearer …` header on MCP requests. Prefer the client's environment
variable or secret-input support; do not commit tokens to workspace JSON/TOML.
[Codex](integrations/CODEX.md#optional-token) has an environment-variable example.

This mode protects `/api` and `/mcp`, excluding health. It does not add a Studio
login or protect `/media` files, so it is intended for headless use. A token alone
does not make the application a public hosted service. See [deployment](DEPLOYMENT.md#server-environment).
Synkinema does not implement an OAuth sign-in flow.

## Connecting from another machine

The simplest setup runs the MCP client on the same computer as Docker. For an
agent on another trusted computer, an SSH local forward keeps the server's default
loopback binding and the MCP host header intact:

```sh
ssh -N -L 127.0.0.1:18081:127.0.0.1:18080 your-user@your-synkinema-host
```

Run this on the **agent's computer** using an existing SSH account on the Synkinema
host. Keep the SSH session open, then configure the agent with
`http://localhost:18081/mcp/`. Studio is available through the same tunnel at
`http://localhost:18081`. No public Synkinema port is needed.

Remote containers, WSL and SSH workspaces can also put the client in a different
network namespace. Establish which machine actually runs the MCP connection
before choosing a URL. A client running in a container cannot use its own
`localhost` to reach a separate container or the host.

`SYNKINEMA_ALLOWED_HOSTS` configures trusted Studio/REST hosts. MCP has a separate
loopback allowlist; that environment variable does **not** enable arbitrary LAN
or public MCP hostnames. A hosted agent needs a separately designed, authenticated
gateway and compatible host/origin handling, outside this local quick start.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Connection refused | Start Docker and the container. Confirm the mapped host port and which computer runs the client. |
| HTTP works but MCP tools are missing | Use `/mcp/` with Streamable HTTP; verify the correct client configuration root (`servers` versus `mcpServers`). Reload the server/tool list. |
| Browser GET to `/mcp/` returns an error | Use an MCP client for the handshake. A normal browser GET is not a valid tool-call test. |
| 401 / unauthorized | Server token mode is enabled. Supply the matching bearer header or use the intended non-token local instance. |
| Host/origin rejected | Use loopback or the SSH forward above. Adding an IP to Studio's host setting does not change MCP's allowlist. |
| `npx` not found in Claude Desktop | Install Node.js on the client and make `npx` available to the desktop process; use its absolute executable path if needed. The Docker container's Node installation is not the client's. |
| Generation says model unavailable | Use explicit model-install production tasks, wait for completion, then retry intentionally. Check provider status and free disk space. |
| Tool times out during a render or download | Recover its task/job ID and wait again. A client timeout does not imply server cancellation; do not start a duplicate job to poll it. |
| Agent cannot open `/data/...` | That is a server-side path. Use returned media URLs or native MCP image content; remote clients do not share the server filesystem. |
| Revision conflict | Reread the project, reconcile with the user's edits and use the latest confirmed revision. Do not blindly replay a batch. |

Model installation and rendering may take minutes on CPU. Production/render waits
are bounded to 25 seconds per call; repeat them with the same ID. Allow longer
client timeouts for synchronous frame inspection. Provider guides show how to
adjust them where supported.

Configuration examples were checked against official client documentation on
**2026-09-12**; each client guide links its source. This is not a claim that every
client/version was exercised end to end. The server's tested MCP workflows are
recorded in the [production audit](MCP_PRODUCTION_AUDIT.md).
