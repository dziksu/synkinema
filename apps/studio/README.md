# Synkinema Studio

The TanStack Start application for the Synkinema engine, replacing the original static Studio. The Docker image includes this SSR application and its Node runtime; workspace projects and media retain the existing engine contract and storage.

## Run

Use Node 24.10+ and the repository's Python environment. Start the engine normally on port 8080, then:

```sh
npm --prefix apps/studio ci
npm --prefix apps/studio run dev
```

Open http://127.0.0.1:5174. To use a different engine, copy `.env.example` to `.env` in this directory and set `SYNKINEMA_API_ORIGIN`. This variable is server-only. For disposable QA, start the engine with a separate `SYNKINEMA_DATA` directory.

```sh
npm --prefix apps/studio run build
SYNKINEMA_API_ORIGIN=http://127.0.0.1:8080 PORT=5174 HOST=127.0.0.1 npm --prefix apps/studio start
```

The production output is `.output/` with a Node server. Deploy the complete output and set the engine origin at runtime. This application needs a server; serving only the client assets loses SSR, server functions and the proxy. An HTTPS reverse proxy must preserve the public host/origin for same-origin write validation. No credentials belong in public `VITE_` variables.

## Application structure

- `src/routes`: file-based TanStack Router pages, validated project search params, Query-prefetching loaders, and streaming API/media/MCP server routes.
- `src/server`: explicit server-only engine transport and validated, typed theme preference functions. `/api/*`, `/media/*` and `/mcp/*` are proxied by **TanStack Start**, so a second Next.js application is not required. The proxy streams bodies, supports media ranges, forwards request-scoped authorization, restricts the upstream origin and rejects cross-origin writes.
- `src/api`: generated swagger client, centralized Query keys/options, mutations, cache reconciliation and revision-safe project write queue. UI code never calls fetch or the generated HTTP client directly. Theme preferences also use Query; they are local Start server functions, not engine endpoints.
- `src/modules/projects`, `channels`, `media`, `exports`, `script`, `settings`: feature pages and forms.
- `src/modules/editor`: editor controller hooks and separate timeline, preview, source monitor, inspector, audio, script, export and history views. Track ordering uses dnd-kit; clip placement/trimming retains the existing precise editing behavior. `react-resizable-panels` manages the media/preview/inspector and timeline splitters.
- `src/components/ui`: shadcn primitives; `src/components`: reusable composed elements such as the workspace shell, page header, modal and loading/error states.
- `src/hooks`: shared React Hook Form draft handling. New project/track forms use shadcn Field + Controller + Zod; migrated domain forms use RHF while retaining their server-validation and draft-conflict behavior.
- `src/lib/locales/en.json`: product copy. User content remains in its original language.

Dashboard, channels, media, exports and settings render the full document on the server. Query's official Router integration streams and hydrates pending query data. The editor route explicitly uses `ssr: false` because canvas, media, drag interactions and the local editor store require the browser; its surrounding document and workspace shell still render on the server. Each request gets a fresh QueryClient. The light/dark/system choice is persisted with a typed server function and a client theme preference to avoid a flash on navigation.

The editor remains desktop-first. On small screens the sidebar becomes a sheet; the editing surface preserves a usable minimum width rather than shrinking timeline controls beyond usability.

Section navigation uses real Router links and validated URL search params: `editorTab`, `channelTab`, `mediaScope`, `libraryView`, and `mediaFolder`. `mediaId` and `mediaTab` restore the media manager and its selected section, including after a reload. `mediaKind` retains the editor media filter. Shared `RouteTabs` provides consistent navigation styling; URL updates preserve sibling search params and browser history without remounting the editor session. See [TanStack search navigation](https://tanstack.com/router/latest/docs/how-to/navigate-with-search-params).

## Verification and generated API

```sh
npm --prefix apps/studio run format
npm --prefix apps/studio run format:check
npm --prefix apps/studio run api:generate
npm --prefix apps/studio run api:check
npm --prefix apps/studio run typecheck
npm --prefix apps/studio test
npm --prefix apps/studio run build
make check
```

Biome uses the root configuration. Do not hand-edit `src/api/generated/*` or `src/routeTree.gen.ts`. Generate the Studio client after engine contract changes; CI checks it and release metadata tooling updates the application version. See [WEB_API_ARCHITECTURE](../../docs/WEB_API_ARCHITECTURE.md).

Only two initial tests are included: bookmarked search-param validation and API module boundaries. The legacy component suite was removed with the old application; broader interaction coverage for the redesigned modules remains future work.

## Dependency choices

Started with the official shadcn CLI, not a custom recreation of its primitives:

```sh
npx shadcn@latest init --template start --base radix --preset nova --no-monorepo --name studio --yes
```

Research and installed-license check: 2026-09-16. All selected building blocks are free; no paid component kit is required. Exact resolved versions are recorded in `package-lock.json`.

| Purpose | Selected library / installed version | License / rationale |
| --- | --- | --- |
| Routing, SSR, loaders and functions | TanStack Start 1.168.54 / Router 1.170.36 | MIT; official shadcn Start integration |
| Server state | TanStack Query 5.103.0 | MIT; official SSR hydration/streaming integration |
| UI and accessible overlays | shadcn 4.21.0 / Radix UI 1.6.7 | MIT; owned component source and accessible primitives |
| Forms and validation | React Hook Form 7.88.0 / resolvers 5.9.1 / Zod 4.6.5 | MIT; documented shadcn form pattern |
| Adjustable panels | react-resizable-panels 4.12.4 | MIT; pointer and keyboard resizing |
| Track ordering | @dnd-kit/react and helpers 0.5.0 | MIT; current React API with sortable handles |
| Imports and editor state | react-dropzone 20.1.2 / Zustand 5.0.15 | MIT; retain proven domain behavior |
| Server-only streaming proxy | Undici 8.10.2 | MIT; preserves public Host for engine origin checks and streams request/response bodies |
| Node deployment | Nitro 3.0.260903-beta | MIT; current Vite adapter, **pinned prerelease**; verify upgrades with production smoke checks |
| Icons | lucide-react 1.46.0 | ISC |
| API generation / formatting | swagger-typescript-api 13.12.6 / Biome 2.5.13 | MIT / MIT OR Apache-2.0; matches repository tooling |

References: [shadcn Start installation](https://ui.shadcn.com/docs/installation/tanstack), [shadcn RHF forms](https://ui.shadcn.com/docs/forms/react-hook-form), [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [TanStack Router Query integration](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading), [dnd-kit React](https://dndkit.com/react/quickstart), [resizable panels](https://github.com/bvaughn/react-resizable-panels).
