# Synkinema with Codex

[All clients](../AGENT_SETUP.md) · [First MCP reel](../AGENT_QUICKSTART.md)

Start Synkinema and open [Studio](http://localhost:8080). Codex's local desktop app,
CLI and IDE extension share MCP configuration on the same machine. Configure one
server entry using either the CLI or TOML below.
[Official Codex MCP guide](https://developers.openai.com/codex/mcp/).

## Fastest setup

With Codex CLI installed:

```sh
codex mcp add synkinema --url http://localhost:8080/mcp/
codex mcp list
codex mcp get synkinema
```

Open a fresh Codex session after adding the server. If a desktop/IDE session still
shows the old tool list, restart that client.

## Manual configuration

Merge this into `~/.codex/config.toml`:

```toml
[mcp_servers.synkinema]
url = "http://localhost:8080/mcp/"
startup_timeout_sec = 20
tool_timeout_sec = 180
```

For project-scoped setup, use `.codex/config.toml` in a trusted project instead.
The timeouts are in **seconds**. The longer tool timeout accommodates synchronous
frame inspection; durable production and render jobs still use bounded waits.
[Configuration and scope](https://developers.openai.com/codex/mcp/).

## Optional token

Only for a server explicitly started with `SYNKINEMA_API_TOKEN`, add this setting
inside the same server block:

```toml
bearer_token_env_var = "SYNKINEMA_API_TOKEN"
```

Set that environment variable in the process launching Codex. A desktop app
started from the Dock may not inherit variables exported in a terminal. Keep the
secret out of TOML; the setting names an environment variable, not its value.
No token or `codex mcp login` is needed for the default local server.

## Verify and create

```text
Use the Synkinema MCP tools. Read get_agent_guide, get_capabilities,
get_production_capabilities and get_voice_provider_status, then call list_projects.
Report the results without changing anything.
```

Once real results appear, use the [reel brief](../AGENT_QUICKSTART.md#ready-to-paste-brief).
Keep this task rule in the project's agent instructions when working on videos:

```text
Use Synkinema MCP for video production. Discover the live tools and operation
schemas first. Preserve existing projects, serialize writes using returned server
revisions, and use durable task IDs for waits. Inspect the exact completed export
before calling it finished. Report any checks that could not be performed.
```

For Codex running elsewhere, use the [networking guide](../AGENT_SETUP.md#connecting-from-another-machine).
Your computer's localhost URL cannot be used directly by a hosted cloud task.
