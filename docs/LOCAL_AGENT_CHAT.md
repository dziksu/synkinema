# Local agent chat

Open **Agent chat** in the bottom-right corner of Studio. Create a conversation
for the current project, another project, or **General**. Conversations keep their
original project when you navigate elsewhere. Closing the panel does not stop a
turn. Native development stores history/settings in the workspace SQLite database;
the Docker launcher stores them in a separate private host SQLite database.

Use **Agent settings** to configure Codex, Claude Code, or GitHub Copilot CLI,
their executable path and an optional model ID. An empty model uses the CLI default.
The backend reuses each CLI's existing login. The Codex model catalog comes from
that saved executable's `model/list`, with pagination and a timeout; listing models
does not start inference. Model access and accepted reasoning effort still depend
on your account and CLI version. Settings apply to the next turn.

CLIs must be installed and logged in **on the machine running the chat service**.
The [Docker launcher](#docker-with-agents-on-the-host) runs that service on your
computer and keeps the project engine in Docker.
For native development, start the engine and Studio as described in the
[development instructions](../README.md#development), then configure the CLI path.
The stock Docker image does not contain these agents or the host's login. Installing
a CLI on macOS does not make it available inside the container. CLI execution is
local, while the selected provider normally performs inference remotely using your
account's quota/billing.

## Docker with agents on the host

Install Docker (including a local running engine such as Colima), curl and at
least one signed-in CLI. The released installer starts everything without a
checkout or installed Python/Node.

For an existing Compose installation, finish active renders/agent turns and run
`docker compose stop synkinema` in its checkout **before** installing. This keeps
its named volume and all projects/media. Only one engine can use that volume.
Then run:

```sh
curl -fsSL https://github.com/dziksu/synkinema/releases/latest/download/synkinema-local-install.sh | sh
```

The command requires launcher assets and a publicly readable matching Docker
image in the selected release. It downloads a
versioned PyInstaller executable, checks SHA-256 and writes a shortcut under
`~/.local/share/synkinema`. Packaged platforms are macOS arm64/x64 and Linux
arm64/x64 with glibc 2.35 or newer. Windows/musl are not packaged. Source paths
and CLI login refer to your host, not to paths inside the container.

The default UI/chat origin is `http://localhost:43817`; Docker is published only
on `127.0.0.1:43818`. The host handles `/api/agent-chat/*`, including temporary
scoped MCP. Other Studio/REST/public MCP/media requests stream through to the
container, retaining uploads and Range responses. The gateway injects a random
private API token; agents receive only their revocable MCP URL. All gateway
routes require a loopback socket, local Host and same-origin browser requests.
The container runs with `SYNKINEMA_AGENT_CHAT_ENABLED=false`. Agent CLI credentials
and the Docker socket are never mounted inside it.

`RemoteChatBackend` addresses the existing engine REST API, so edits keep the
same domain validation, required `expected_revision`, atomic batches, history
and Studio Query refresh. Frontend calls still use the generated HTTP client and
TanStack Query. Pending remote reads reserve agent slots and honor Stop/shutdown
before a native process can start. No separate project database is created on
the host.

Defaults: container `synkinema-local`, volume `synkinema_synkinema-data`, profile
`~/.local/share/synkinema`, history/settings `chat/chat.db`. On the first start,
the launcher reads existing Docker chat tables through a read-only volume mount
and copies them atomically. It preserves IDs/order/settings and the originals;
subsequent starts use the host history. Profile state/token uses private file
permissions, and a profile lock prevents two writers. Another running container
using the same volume causes an error. Stop your existing deployment first;
do not remove its volume. For an older standalone deployment, use `--volume
synkinema-data`.

The launcher stays in the foreground. Ctrl+C or `synkinema-local stop` ends native
agents and removes only its own identified container, preserving the named
volume and host history. `status`/`stop` read the saved profile. After a killed
launcher, the next start can recover its owned container. No foreign deployment
is stopped automatically. Restart/update with:

```sh
~/.local/share/synkinema/synkinema-local
~/.local/share/synkinema/synkinema-local status
~/.local/share/synkinema/synkinema-local stop
# Stop first, then rerun the installer to update.
```

Options: `--port`, `--backend-port` (default UI port + 1), `--volume`, `--container`,
`--data-dir`, `--read-only`, `--no-open`, `--image`, `--help`. Separate profiles need
different ports, container names and volumes. Helper/image versions must match;
release builds use a version-pinned image. Set `SYNKINEMA_LOCAL_DIR` to install
elsewhere. Explicit `ELEVENLABS_API_KEY`/`SYNKINEMA_FFMPEG_THREADS` environment
settings are passed to the engine; host agent login stays on the host.

From a checkout, build/test the current platform's standalone executable:

```sh
python -m pip install -r requirements-local.txt
python scripts/build_local_helper.py
docker build -t synkinema:local .
dist/local-helper/synkinema-local-darwin-arm64 --image synkinema:local --no-open
```

Choose the filename matching your OS/architecture. To install a local build with
the same checksum checks, set `SYNKINEMA_LOCAL_ASSETS` to the absolute
`dist/local-helper` directory and run its `synkinema-local-install.sh --image
synkinema:local`. The build never changes source versions. CI builds all four
targets natively and publishes installer/binaries/checksums only after the exact
matching Docker image succeeds. Local smoke uses disposable data:

```sh
python scripts/smoke_local_helper.py synkinema:local \
  --helper dist/local-helper/synkinema-local-darwin-arm64
```

## Launcher troubleshooting

| Startup error | Recovery |
| --- | --- |
| `Data volume ... is already used by ...` | Finish active work, then run the `docker stop ...` command printed by the launcher (or `docker compose stop synkinema` in the original checkout). Stopping preserves the volume. Run the installed launcher again. Changing only `--port` cannot fix this conflict. |
| `Local port ... is occupied` | Stop the application using that port, or choose `--port 43819`. The backend defaults to the next port. |
| Docker cannot connect to its daemon | Start Docker Desktop/Colima and check `docker info`, then rerun the launcher. |
| Image pull returns `unauthorized`, `denied` or `manifest unknown` | The matching published image is unavailable to anonymous users. The maintainer must make the GHCR package public and verify that version was published. With a checkout, build `docker build -t synkinema:local .`, then use the command below. Helper/image versions must match. |

If the installer already created the executable, there is no need to download it
again. For a matching local image:

```sh
~/.local/share/synkinema/synkinema-local --image synkinema:local
```

Keep the original `--volume` when restarting so existing projects remain visible.
To return to the previous Compose deployment, stop the launcher, then run
`docker compose up -d synkinema` in the original checkout.

## Asking and editing

New conversations start in **Ask**, with read-only MCP tools. General conversations
can inspect projects but cannot enter Edit. Project conversations can access only
their assigned project's data through the injected MCP.

Choose **Edit project** to enable atomic editing batches for that project. The
agent reads the confirmed project revision and exact operation schemas, then uses
the same domain engine, validation, dry-run preview and revision history as Studio.
Conflicts reject the batch without partial changes. Studio refreshes after committed
revisions while preserving pending user projections. Existing history/undo can
restore a previous project revision. Edit does not grant filesystem write access.
The chat catalog covers project inspection, media metadata, validation and timeline/
script edits; rendering, media imports and TTS are still available through Studio
and the public MCP, outside the scoped chat catalog.

Select a clip and choose **Ask agent about this clip** in its inspector. This attaches
its stable ID as context; it does not send a message. Context is resolved against
the assigned project, and its display label grants no access. Remove the chip to
ask without that reference. Enter sends; Shift+Enter adds a newline; IME composition
does not submit. Drafts remain separate per conversation while this Studio session
is open. Replies preserve text and line breaks without executing HTML. Reasoning
shows only content publicly emitted by the CLI (Codex summaries), in a collapsed
section. Scroll up to pause automatic following.

Partial replies appear through the generated HTTP client's TanStack Query snapshots
(400 ms while working). No unmanaged EventSource or separate HTTP transport is
used. Monotonic conversation versions prevent an older acknowledgement or read
from overwriting newer text/status. Reconnecting reads the latest snapshot; the
CLI runs independently of the browser. **Retry the same message** reuses its
request ID, so a lost acknowledgement does not execute the turn twice.

**Stop** revokes that turn's MCP capability immediately, then terminates its process
group on POSIX, escalating to SIGKILL after two seconds. Partial replies survive.
Stop does not undo batches already committed; saved project revisions are shown
under the reply. Windows terminates the direct subprocess; full process-tree
isolation is not provided. Server shutdown also reaps active processes. After a
crash, unfinished saved messages become Failed; no inference or edit is replayed.

Conversation settings support rename, optional absolute source directory and
confirmed deletion of idle history. Archive/restore preserves messages and project
edits; archived conversations reject sends. Busy conversations reject
metadata changes/deletion. Hold a conversation row for 350 ms to drag it into a
new position, or use Space and arrow keys. Its adjacent options menu offers rename,
archive/restore, settings, deletion and move up/down. Reordering respects the
current project/archive filter and preserves the positions of hidden conversations.
Settings and conversation updates require confirmed
versions; conflicts keep form drafts for explicit reconciliation.

## Access and limits

- `SYNKINEMA_AGENT_CHAT_ENABLED=false` disables creation/execution and model listing.
- `SYNKINEMA_AGENT_CHAT_READ_ONLY=true` prevents Edit and removes the apply tool.
- REST keeps the server's optional `SYNKINEMA_API_TOKEN` authentication. The token
  is removed from the child environment. Turn-specific MCP uses a random, revocable
  URL rather than the application token, and is never stored in conversation DTOs.
- Chat execution requires a loopback socket, local Host and local Origin. Studio's
  server proxy checks the real peer without trusting forwarded headers. Docker
  replaces the host's loopback peer with its network gateway. Both Compose files
  pass their published bind address as `SYNKINEMA_PUBLISHED_BIND_HOST`; the container
  launcher trusts its exact default gateway only when that address is loopback.
  Publishing to `0.0.0.0`, `::` or a LAN IP disables this exception. The bind address
  must match the actual published port; custom container deployments must preserve
  that restriction. This enables the chat panel/API in the default local container,
  but agent execution still requires installed/logged-in CLIs inside that container.
  Local Host/Origin and the private engine's loopback check remain required.
  Public MCP behavior is unchanged.
- Executables are trusted programs running as the backend OS user. The optional
  directory selects cwd, not an OS read allowlist. Provider login/configuration and
  hooks may affect execution. Codex disables other MCP servers, apps, hooks and
  plugins for the thread; Claude uses strict MCP and a tool allowlist; Copilot uses
  allow/deny flags. These providers do not offer identical isolation. Use one
  backend process and a trusted local owner; this is not a multiuser CLI service.
- Capability paths are redacted from Uvicorn access logs and persisted agent output.
  They may still appear in process arguments or external CLI logs.
- Maximum 3 active turns, 1 per conversation; user messages up to 20,000 characters,
  composed prompts up to 120,000 UTF-8 bytes, stdout up to 2 MB, retained stderr up
  to 16,000 characters, and turn duration up to 10 minutes. History has no automatic
  compaction; start a new conversation with a summary when the prompt limit is hit.

Tests in `tests/test_local_agent_chat.py` use real child processes, a loopback HTTP
server and fake provider executables. They cover scope, atomic edits/revision
conflicts, revocation, UTF-8, Stop, persistence/recovery, provider switching and
model pagination. `apps/studio/src/api/chat.test.ts` covers acknowledgement races,
poll cancellation, optimistic rollback and project invalidation. These fixtures
do not verify real provider login, entitlement or inference.

The implementation follows the supplied StructSmith reference at
[`bf824b9`](https://github.com/dziksu/StructSmith/tree/bf824b9f5079a29f3146bd2d39828bf7c665ca97),
adapted to FastAPI and Synkinema's generated-client/Query boundary. The host
launcher follows [StructSmith PR #100](https://github.com/dziksu/StructSmith/pull/100),
using a bundled Python runtime and REST adapter for Synkinema's engine.
Provider protocol
references: [Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Claude programmatic use](https://code.claude.com/docs/en/headless), and
[Copilot CLI](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
