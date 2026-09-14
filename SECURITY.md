# Security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/dziksu/synkinema/security/advisories/new)
when enabled. If it is unavailable, contact the maintainer through the private
contact channel listed on their GitHub profile. Do not put exploit details, tokens
or private media in a public issue. Include the version/commit, deployment mode,
reproduction steps and impact. No response-time SLA is promised.

The latest released version is the supported security target; this small project
does not currently maintain older release branches.

## Threat model

Synkinema is a local, single-user application, without user accounts, roles or
multi-tenancy. Its main boundary is the host/private network. Default Compose
publishes only on localhost. LAN access is an explicit configuration choice;
anyone who can reach an unauthenticated instance can read, modify and delete data.

`SYNKINEMA_API_TOKEN` protects `/api` and `/mcp` except `/api/health`. **It does not
protect `/media` files or the static Studio**, and Studio has no token login flow.
It is not sufficient to make an internet-facing deployment private. Remote access
needs a private network or an authenticated TLS reverse proxy protecting every
route. Trusted-host and cross-origin checks do not replace authorization.

Media decoding invokes FFmpeg. Treat imported files as untrusted, keep the image
and dependencies updated, use resource limits where needed, and retain non-root
execution. The renderer and API are not a hostile multi-tenant sandbox.

## Data and outbound connections

Project state, revisions, imports, speech and exports are stored locally. Backups
and Git-ignored example outputs can still contain sensitive information. Keep
`.env`, databases and private source media out of issues, Git and build artifacts.

Normal local editing/rendering does not require a cloud service. Optional model
installation downloads pinned Supertonic files; ElevenLabs sends requested text to
that provider when explicitly configured. Provider SDKs, documentation CDNs and
source-download scripts can make outbound requests. Review provider/model licenses
and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistribution.

## Supply chain

CI uses pinned GitHub Action commits, locked application dependencies, Dependabot,
CodeQL where available, non-root image smoke tests, and image SBOM/provenance.
Releases are gated on verification and restricted to `main`; fork/PR jobs do not
publish. Report security issues in release tooling through the same private path.
