# Deployment, configuration and backups

## Run without cloning

With Docker running and a public image published:

```sh
docker run -d --name synkinema --init \
  -p 127.0.0.1:18080:8080 \
  -v synkinema-data:/data \
  --restart unless-stopped \
  ghcr.io/dziksu/synkinema:latest
```

Open [Studio](http://localhost:18080). FFmpeg, fonts, Studio and the server are inside
the image; optional speech/transcription weights are installed separately into
the persistent volume. MCP is at `http://localhost:18080/mcp/`;
[connect your agent](AGENT_SETUP.md).

These examples use POSIX shell line continuations (macOS, Linux, WSL or Git Bash).
In PowerShell, put the command on one line or use its backtick continuation.

### Everyday commands

```sh
docker logs --tail 100 synkinema
docker inspect --format '{{.State.Health.Status}}' synkinema
curl --fail http://localhost:18080/api/health
```

To stop and later resume the **same** container:

```sh
docker stop --time 30 synkinema
docker start synkinema
```

Finish or cancel work before stopping; interrupted jobs do not become completed
exports. `docker start` preserves the container's original port, volume and
environment. It does not download a newer image.

### Startup troubleshooting

| Error | Next step |
|---|---|
| Cannot connect to Docker daemon | Start Docker Desktop, Docker Engine or Colima before running the command. |
| GHCR `denied` / `manifest unknown` | Confirm a release/image has been published and the GHCR package is public, or use the source build below. A repository can exist before its public image does. |
| Container name already in use | Inspect the existing container and use `docker start synkinema`; do not remove its volume just to reuse the name. |
| Port is already allocated | Choose `-p 127.0.0.1:18081:8080` for a new container, then use port 18081 in Studio and every client URL. |
| Existing projects seem missing | Check the mounted volume name and Docker context. A different volume or Docker daemon is a different installation. |
| Model download / render fails writing files | Check host and Docker disk space, then the task error and logs. Preserve the data volume. |

Published versions are listed in [GitHub releases](https://github.com/dziksu/synkinema/releases).
The first image publication is part of the [release workflow](RELEASING.md).

## Compose or source build

From an existing repository checkout, run `docker compose up --build -d` to build
locally. After a release exists, `docker compose -f compose.release.yaml up -d`
uses the published image. Keep the same Compose project name when switching
between these two files to retain the same volume.

The standalone container uses host port 18080; the default Compose service uses
43817. Keep separate data volumes for independent installations.

## Container and storage

The container runs as non-root user `studio` (UID 10001), listens internally on
8080, and has a health check. The default Compose host binding is
`127.0.0.1:43817`. For an existing Compose installation, set
`SYNKINEMA_BIND_PORT=43817` in `.env`
and run `docker compose up -d --force-recreate synkinema` to move only the host
port. Open `http://localhost:43817`; the same Compose volume remains mounted.
Changing the port does not limit network access: `SYNKINEMA_BIND_HOST` controls
whether the service listens only on this computer or also on the LAN.
One application process and one worker must own a data directory. Do not use
multiple Uvicorn workers or mount the same volume into simultaneous instances.

The data volume contains SQLite, source media, generated speech, renders, caches
and optional models. The default Compose volume name is normally
`synkinema_synkinema-data`; the standalone `docker run` example uses
`synkinema-data`. Those are different names: explicitly reuse the original volume
when moving an existing installation. Never use `docker compose down -v` to upgrade.

## Trusted home network

The default localhost binding is recommended for one computer. For deliberate
Studio access from a trusted home network, the Compose setup can expose its port:
copy `.env.example` to `.env` in the checkout and edit:

```dotenv
SYNKINEMA_BIND_HOST=0.0.0.0
SYNKINEMA_ALLOWED_HOSTS=192.168.1.20
```

Replace the example IP with the host's current LAN address. Run
`docker compose up -d` and open `http://192.168.1.20:43817` from the same trusted
network. Additional hostnames/IPs can be comma-separated. Same-origin writes are
validated against the configured host. Update the setting if DHCP changes the IP.

For the standalone Docker setup, the equivalent requires recreating the container
with a LAN-facing port mapping and `-e SYNKINEMA_ALLOWED_HOSTS=YOUR_LAN_IP`, keeping
the original volume. `SYNKINEMA_BIND_HOST` and `SYNKINEMA_BIND_PORT` are Compose
interpolation, not server environment variables that can change an existing Docker
port mapping.

This setting applies to Studio/REST. MCP has its own loopback host/origin checks;
it does not inherit this host list. Connect an agent on another computer through
the [SSH forward](AGENT_SETUP.md#connecting-from-another-machine).

There is no Studio login: everyone with network access can edit or delete data.
Phone-specific layouts are not the current target. Do not forward this port from
the public internet. See [SECURITY.md](../SECURITY.md).

## Server environment

| Variable | Default / behavior |
|---|---|
| `SYNKINEMA_DATA` | `.data` locally; `/data` in the container |
| `SYNKINEMA_STUDIO` | Built Studio directory; `/app/studio` in the image |
| `SYNKINEMA_FFMPEG_THREADS` | 4; bounded to 1–16 |
| `SYNKINEMA_FONT` | Optional TTF path; otherwise DejaVu/Arial fallback |
| `SYNKINEMA_ALLOWED_HOSTS` | Additional trusted hostnames/IPs, comma-separated |
| `SYNKINEMA_API_TOKEN` | Optional bearer token for `/api` and `/mcp`; health stays public; media is not covered |
| `SYNKINEMA_SUPERTONIC_DIR` | Optional model directory; otherwise `DATA/models/supertonic-3` |
| `SYNKINEMA_TTS_THREADS` | 4; bounded to 1–8 |
| `ELEVENLABS_API_KEY` | Optional server-side BYOK provider key |

Compose's `.env` provides interpolation values, not automatic container environment
injection. To pass additional server variables, add them under the service's
`environment` in a local Compose override. Never add real keys to committed files.
Studio does not implement bearer-token login, so that mode is for headless clients.

## Upgrade and backup

Stop the application before copying its data to obtain a consistent database and
media snapshot. Back up the complete `/data`, not only SQLite: assets and exports
live in files alongside it. Store backups outside the volume and test restoration.
A backup contains all project text, media, revisions and potentially sensitive data.

### Standalone Docker

Before an upgrade, record the current image and data mount:

```sh
docker inspect --format '{{.Image}}' synkinema
docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' synkinema
```

For a backup, choose a new destination directory on a disk with enough free space.
This example copies the complete stopped container's data into the current directory:

```sh
docker stop --time 30 synkinema
docker cp synkinema:/data ./synkinema-backup
docker start synkinema
```

Do not merge repeated backups into the same folder. For restoration, stop the
server, restore the complete snapshot into its data volume and preserve ownership
for UID 10001 before starting. Verify project/media access after restoring.

After taking a backup, update the default installation:

```sh
docker pull ghcr.io/dziksu/synkinema:latest
docker stop --time 30 synkinema
docker rm synkinema
docker run -d --name synkinema --init \
  -p 127.0.0.1:18080:8080 \
  -v synkinema-data:/data \
  --restart unless-stopped \
  ghcr.io/dziksu/synkinema:latest
```

Pull successfully **before** removing the old container. `docker rm` here removes
the container, not its named volume. Reapply any custom ports, environment variables,
mounts and the **actual original volume name** when recreating it. For a pinned
upgrade, use the same published `vX.Y.Z` tag or digest in both pull and run.

### Compose

For a published Compose deployment, choose an available `vX.Y.Z` using
`SYNKINEMA_IMAGE` in `.env`, then run:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml up -d
```

For a source deployment, update the checkout and run `docker compose up --build -d`.
Check `/api/health` and open an existing project after upgrading. Database schema
changes may be forward-only; restore a backup for a rollback instead of opening an
upgraded database with an older image. Keep the previous image digest until the
upgrade is verified.

## Files and disk usage

Deleting an export removes its database entry and owned output file. Deleting
media checks references and shared locations; a shared asset can remain while
another project still uses it. Do not delete library files by hand. Unused caches
are not automatically capped, so watch free disk space before large renders.
Supertonic's optional model uses roughly 401 MB; rendering also requires temporary
space in addition to source and output video sizes.
