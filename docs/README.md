# Synkinema documentation

Start with the [Docker quick start](../README.md#quick-start). The published image
includes Studio, REST, MCP, the renderer and the agent operating guide. A source
checkout is needed only for development and repository examples.

## Use the application

| I want to… | Read |
|---|---|
| Start, update, back up or move an installation | [Deployment](DEPLOYMENT.md) |
| Edit a video by hand | [Manual editing](MANUAL_EDITING.md) |
| Choose resolution, aspect ratio, fit/fill and quality | [Export formats](EXPORT_FORMATS.md) |
| Generate local narration | [Supertonic setup, languages and licensing](SUPERTONIC.md) |
| Understand local access and trust boundaries | [Security policy](../SECURITY.md) |

## Work with an agent

1. [Connection guide](AGENT_SETUP.md) — endpoint, client selection, read-only probe
   and troubleshooting.
2. Client instructions: [Codex](integrations/CODEX.md),
   [Claude Code / Desktop](integrations/CLAUDE.md),
   [Copilot / VS Code](integrations/COPILOT.md),
   [Cursor / Gemini / other clients](integrations/OTHER_CLIENTS.md).
3. [First MCP reel](AGENT_QUICKSTART.md) — copyable brief, local models, production
   stages and final review.
4. [API and MCP reference](API_MCP.md) and the
   [canonical agent operating guide](../apps/server/synkinema/agent_guide.md) —
   payloads, revisions, limits, units, recovery and side effects.

Prefer capabilities and schemas returned by your **running server** when its
version differs from this checkout. The canonical guide is shipped in the image
and exposed by `get_agent_guide`; it does not require access to GitHub.

## Develop and release

- [Contributing](../CONTRIBUTING.md) and [project rules](../AGENTS.md).
- [Web API architecture](WEB_API_ARCHITECTURE.md) — TanStack Query, the generated
  HTTP client, optimistic updates, revision serialization and codegen checks.
- [Localization](LOCALIZATION.md) — English defaults and adding UI languages.
- [Release workflow](RELEASING.md) — CI gates, Conventional Commits, semantic-release
  PRs, GHCR publication and first-push preparation.
- [Roadmap](../ROADMAP.md), [changelog](../CHANGELOG.md),
  [license](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md).

## Examples and verification records

- [MCP production audit](MCP_PRODUCTION_AUDIT.md) — workflow coverage and a real
  MCP-only acceptance run; [command audit](AGENT_COMMAND_AUDIT.md) maps interfaces.
- [Steam reel](../examples/steam-breakout-en/README.md),
  [horror showcase](../examples/steam-horror-en/README.md),
  [fictional relationship drama](../examples/relationship-drama-en/README.md),
  [Polish wildlife credits](../examples/polish-wildlife/CREDITS.md) and
  [sound effects library](../examples/sfx-library/README.md).
- [Test report](TEST_REPORT.md) and [UI test report](UI_TEST_REPORT.md).

Files named `*_REVIEW_YYYY-MM-DD.md`, audits and test reports describe particular
implementation/test snapshots. They are evidence, not a replacement for the
current setup guides or the live API contract. Large media and private project
data are excluded from Git and are not included in the published image.
