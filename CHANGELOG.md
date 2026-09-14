# Changelog

Versioned release notes are generated automatically from Conventional Commits in
[GitHub Releases](https://github.com/dziksu/synkinema/releases). That is the canonical
automated changelog. This file records curated development highlights; CI does not
commit generated metadata back to `main`.

## Unreleased

- Desktop timeline editor with private project media, a shared library, caption
  styles, canvas layers, drag and drop, keyframes, effects and audio editing.
- REST, MCP and CLI over shared revision-guarded editing services.
- TanStack Query and a generated typed client for every Studio API request,
  including optimistic edits and rollback.
- Persistent render queue, MP4 exports, actual frame/audio inspection and physical
  file cleanup for removed exports/media.
- Optional local Supertonic narration and English-first UI localization.
- CI verification, native amd64/arm64 container smoke tests, semantic-release,
  versioned GHCR publication, contributor documentation and dependency automation.

The first releasable push with no existing `v*` release tags produces `1.0.0`.
Nothing in this file asserts that a release or public container already exists.
