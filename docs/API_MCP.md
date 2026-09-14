# API i MCP dla agentów

Szybkie podłączenie klienta: [Codex](integrations/CODEX.md),
[Claude Code / Desktop](integrations/CLAUDE.md), [Copilot](integrations/COPILOT.md),
[Cursor i Gemini](integrations/OTHER_CLIENTS.md). Zacznij od
[konfiguracji i testu połączenia](AGENT_SETUP.md), a potem skorzystaj z
[przewodnika pierwszego filmu przez MCP](AGENT_QUICKSTART.md).

Pełna instrukcja jest dostarczana razem z serwerem — także w obrazie Docker i pakiecie Python. Jej kanoniczne źródło: [agent_guide.md](../apps/server/synkinema/agent_guide.md). Jest po angielsku, z dokładnymi nazwami pól i przykładami JSON; treści projektu mogą być po polsku.

## Od czego agent powinien zacząć

1. MCP `get_agent_guide` — model pracy, jednostki, kolejność działań, błędy i ograniczenia.
2. `get_capabilities` — faktyczne funkcje i zakresy wartości efektów/animacji.
3. `get_project_schema` — struktura projektu i zagnieżdżonych modeli.
4. `get_operation_reference` — opis, samodzielny JSON Schema i przykład każdej z 16 operacji. Parametr `operation` wybiera jeden opis.
5. `get_project` — aktualny stan i rewizja, następnie kolejne `apply_operation` z rewizją otrzymaną w poprzedniej odpowiedzi.

Instrukcja jest również zasobem MCP `synkinema://agent-guide`; katalog operacji: `synkinema://operations`. Instrukcje inicjalizacji MCP wskazują tę ścieżkę. Wszystkie 60 narzędzi mają opisy wejść, rezultatów i skutków oraz adnotacje o odczycie, mutacji i usługach zewnętrznych.

Odpowiedniki HTTP:

| Adres | Zawartość |
|---|---|
| [Przewodnik agenta](http://localhost:18080/api/agent/guide) | Pełna instrukcja Markdown |
| [Operacje](http://localhost:18080/api/schema/operations) | Formaty payload, przykłady i skutki uboczne |
| [Model projektu](http://localhost:18080/api/schema/project) | JSON Schema |
| [Możliwości](http://localhost:18080/api/capabilities) | Funkcje, ograniczenia, granice wartości |
| [Dokumentacja API](http://localhost:18080/api/docs) | Interaktywne opisy endpointów |
| [OpenAPI](http://localhost:18080/api/openapi.json) | Specyfikacja maszynowa |

Instrukcja rozróżnia zachowanie UI i API: przyciąganie i przeliczanie animacji pozostają funkcjami UI; dopinanie, duplikowanie i wyodrębnianie audio mają teraz jawne operacje backendu. Atomowe partie zmian obsługują tryb próbny bez zapisu. Opisuje płytkie zastępowanie obiektów, dokładne skutki ripple, powrót po konflikcie, odczyt JSON z odpowiedzi MCP, sprawdzanie obrazów oraz analizę konkretnego joba audio.

## Sprawdzenie przykładu

Na uruchomionym serwerze; plik wejściowy musi mieć obraz, audio i minimum 4 sekundy:

```sh
.venv/bin/python scripts/agent_workflow_example.py \
  --transport rest --input examples/editor-qa/assets/bunny-las.mp4 \
  --output-dir /private/tmp/synkinema-rest-example

.venv/bin/python scripts/agent_workflow_example.py \
  --transport mcp --input examples/editor-qa/assets/bunny-las.mp4 \
  --output-dir /private/tmp/synkinema-mcp-example
```

Każde wywołanie tworzy osobny projekt, importuje materiał, sprawdza próbny montaż, zapisuje jedną partię ośmiu zmian (dwa klipy, przejście, wydzielone audio, napis), wykonuje preflight, czeka na render, zapisuje MP4, rzeczywisty contact sheet i mapę audio. Nie korzysta z płatnych usług. Po uruchomieniu należy obejrzeć klatki; skrypt jawnie oznacza `visual_review_required=true`. Dla innego lokalnego portu użyj `--origin`.

`tests/test_agent_contract.py` sprawdza kompletność opisów względem tras i listy operacji, poprawność JSON Schema, inicjalizację MCP, narzędzia, zasoby i konflikt zapisu. `tests/test_agent_helpers.py` pokrywa nowe polecenia, tryb próbny, rollback, współbieżne zapisy, kopiowanie, napisy, synchronizację audio, CLI i filtrowanie jobów. Łącznie wykonują wszystkie 16 operacji. Aktualizacja API wymaga odpowiedniej aktualizacji dokumentacji, inaczej testy wykryją rozbieżność.

Pełna mapa REST ↔ MCP ↔ CLI, dodane funkcje, ograniczenia i wyniki testów: [AGENT_COMMAND_AUDIT.md](AGENT_COMMAND_AUDIT.md).

## Kontrola konkretnego eksportu

MCP `render_frame` i `render_frames` oraz REST `/inspection/frame` i `/inspection/sheet` przyjmują opcjonalne `job_id`, tak jak analiza audio. Job wskazuje dokładny gotowy plik i rewizję, również po dalszej edycji projektu. Dla eksportu 12–15 s podaj `time_ms:12500`, aby obejrzeć 0,5 s pliku; zakres jest prawostronnie otwarty. Job ma pierwszeństwo przed `revision`. Niepoprawny job lub brak pliku zwraca błąd bez zastępczego renderowania.

Przykład REST (dostępny też przez CLI `request POST`):
```json
{"job_id":"COMPLETED_JOB_ID","timestamps_ms":[12500,14000]}
```

Puste/niepodane timestamps_ms wybiera punkty projektu mieszczące się w eksporcie albo środek zakresu. Maksimum to 24 klatki. Wynik zawiera job_id, revision, from_ms, to_ms i URL rzeczywistego obrazu; MCP zwraca również ImageContent. W UI wybierz **Rendery → Sprawdź klatki** przy gotowym pliku.

### Caption preview parity

`GET /api/projects/{project_id}/clips/{clip_id}/text-layer?revision=9` returns a transparent PNG at project resolution. It uses the same cached rasterizer as final video exports, including font metrics, wrapping, safe-area placement, accent and contrast band. The `X-Project-Revision` header identifies the snapshot; pin `revision` for immutable private caching. Missing project, revision or text clip returns 404. This read does not modify a project or render a video. Opacity animation and fade-in/fade-out are applied separately during playback. For inspection of the fully composited film, continue using frame/sheet inspection with `job_id` for the exact export.

Canvas composition supports `Clip.placement` (normalized center/size), `shape` (rectangle/ellipse/line on overlay tracks), `caption_style` (editorial/bold/boxed/minimal), and `text_x`. They work through the existing add/update/batch operations and appear in the live Project schema. Crop x/y retain their earlier meaning. See the [agent guide](../apps/server/synkinema/agent_guide.md) for complete defaults, bounds, examples and supported animation combinations.

Media collection tools: `list_asset_folders`, `create_asset_folder`, `rename_asset_folder`, `locate_asset`. REST equivalents: GET/POST `/api/asset-folders`, PATCH `/api/asset-folders/{folder_id}`, PUT `/api/assets/{asset_id}/location`. Asset search and import accept `project_id` and `folder_id`; omitted project_id means the shared library. Private project imports do not appear in shared search until explicitly shared. Membership changes do not modify project revisions.

## Web client and OpenAPI maintenance

The Studio consumes a generated `swagger-typescript-api` client exclusively through
TanStack Query. REST responses and all 16 operation payloads are typed in OpenAPI;
the operation catalog remains shared with MCP. Regenerate and verify the client
when changing contracts; see [WEB_API_ARCHITECTURE.md](WEB_API_ARCHITECTURE.md).

`GET /api/state` returns lightweight project revisions and jobs for cache synchronization.
`POST /api/preview/text-layer` takes `{clip,profile}` and returns the export renderer's
transparent PNG, including unsaved candidate captions, without a project write.
`POST /api/preview/caption` accepts the same body and returns `{url,width,height,bounds}`.
The PNG and bounds come from one cached render. Bounds `{left,top,width,height}`
use output-profile pixels and include font metrics, wrapped lines, subtitle,
style boxes, strokes, accent and safe-area clamping. They exclude the editorial
contrast wash; no visible caption foreground returns `null`. Bind geometry to
the exact URL, and cache by the complete request. This read creates no revision
or render job. The raw PNG endpoints remain supported.
`split_clip` accepts optional `new_clip_id` for the right fragment, enabling stable
optimistic references; omitted IDs are generated as before.

## Export and project deletion

The desktop **Render queue** uses a compact, scrollable list with search/status
filters, selection and one preview player. **Clear finished** removes every
completed/failed/cancelled export in the selected scope. **Clear queue** also stops
running/queued jobs. Both include older jobs beyond the latest-100 listing; search
and status filters only affect display and selection. Inside a project's Exports
tab the scope is that project; the global page covers all projects. Confirmation
shows the scope before any mutation. Project cards offer **Edit details** (name and
brief) and **Delete**.

| REST | MCP | Semantics |
| --- | --- | --- |
| `DELETE /api/jobs/{job_id}` | `delete_render_jobs({job_ids:[id]})` | Remove one export; missing ID is 404. |
| `POST /api/jobs/clear` | `delete_render_jobs(request)` | `{job_ids?: string[], project_id?: string, status?: "finished" \| "all"}`. Exact selection takes precedence over status. All selected IDs must exist in scope before any work stops. |
| `DELETE /api/projects/{project_id}` | `delete_project(project_id, expected_revision)` | Body `{expected_revision}`. Permanently remove project/history/comments/jobs/private folders and exclusive private media. Stale revision: 409. |
| `GET /api/storage/cleanup` | — | Read durable pending cleanup count; GET reports zero files/bytes removed. |
| `POST /api/storage/cleanup` | `retry_file_cleanup()` | Retry already committed cleanup, without selecting new content. |

All deletion responses include `job_ids`, `project_ids`, `asset_ids`,
`deleted_files`, `freed_bytes` and `pending_files`. The cleanup endpoints return
only the three cleanup metrics. Bytes are actual file lengths unlinked during the
pass. A nonzero pending count means metadata deletion committed but disk cleanup
has not fully succeeded; it is **not** a completed physical purge. The desktop
queue shows a persistent warning and a retry action. The worker retries every
10 seconds and on restart. Do not blindly repeat a destructive request after an
ambiguous response: rediscover projects/jobs and check cleanup status first.

Deletion waits for active rendering/subprocess shutdown and serializes against
inspection. MP4, mix/partial outputs, project inspection frames/sheets/audio and
previews are removed. Deleting a project also removes its unused current-renderer
clip/text caches. Shared caches still referenced by another project's historical
revisions are retained. Shared library sources are retained; private sources are
removed only when no other collection, project history or render snapshot needs
them. A clone that references private media keeps access in its own collection.
Files and metadata are linked through a durable SQLite cleanup outbox, committed
in the same transaction as metadata deletion. Disk failures never silently lose
the cleanup intent. There is no undo for deletion.

Queue clearing selects a snapshot of jobs: jobs submitted after selection remain.
Project deletion rechecks revision after stopping work; if another client edited
during shutdown, a 409 may leave renders cancelled but the project intact.
Project detail edits use the existing `update_project` operation and serialized
confirmed revisions, exactly like editor changes. These operations are supported
by generated OpenAPI types and TanStack Query mutations; list removal is
optimistic with rollback, and related caches are purged after acknowledgement.


## Zarządzanie mediami

| REST | MCP | Działanie |
|---|---|---|
| `GET /api/media` | `list_stored_media` | Pełny lokalny inwentarz, również media prywatne i zachowane dla historii. Nie udostępnia plików. |
| `GET /api/assets/{id}/usage` | `get_asset_usage` | Projekty, rewizje i eksporty korzystające ze źródła; `can_delete`. |
| `PUT /api/assets/{id}/metadata` | `update_asset_metadata` | Nazwa, tagi, źródło i licencja; wymagany `expected_version`. |
| `POST /api/assets/batch` | `edit_media_batch` | Atomowe dodawanie/usuwanie tagów lub folder/współdzielenie dla 1–100 plików. |
| `DELETE /api/assets/{id}/location` | `remove_media_membership` | Usunięcie z jednej kolekcji, bez kasowania pliku; `expected_version`. |
| `DELETE /api/asset-folders/{id}` | `delete_asset_folder` | Usunięcie folderu, przeniesienie zawartości do katalogu głównego tej kolekcji. |
| `POST /api/assets/delete` | `delete_media` | Fizyczne usunięcie nieużywanych źródeł i miniatur ze wszystkich kolekcji. |

`Asset.version` jest niezależny od rewizji projektu. Konflikt wersji zwraca 409.
Usunięcie któregokolwiek używanego pliku blokuje całą zaznaczoną grupę; również
historia i snapshoty renderów chronią źródła. Cofnięcie udostępnienia zachowuje
prywatny dostęp projektów. Szczegółowe limity, przykłady i skutki uboczne opisuje
wbudowany agent guide oraz OpenAPI; generowany klient Studio korzysta z tego samego
kontraktu. Operacje UI używają TanStack Query, optimistic updates i rollback.

## Local voice generation

Supertonic 3 is available through the same `get_voice_provider_status` /
`generate_voice_take` MCP tools and `/api/voices/status` / `/api/voices/generate`
REST routes as ElevenLabs. Always choose `provider` explicitly and read `providers[]`
for current availability and supported languages. Supertonic requires an explicit
one of 31 language codes (including `pl`); unsupported languages and auto fallback
are rejected. `project_id` saves privately without changing revision or inserting
clips. Full installation, limits, JSON examples, cache/cancellation behavior and
OpenRAIL-M disclosure requirements: [Supertonic contract](SUPERTONIC.md).

## Export format discovery

`get_export_presets` / `GET /api/export-presets` and `plan_export` /
`POST /api/projects/{id}/export-plan` support export-only dimensions, CRF, FPS and
whole-composition fit/crop. Both are read-only. `start_render` accepts the same
`output` object; it does not edit the project. See [EXPORT_FORMATS.md](EXPORT_FORMATS.md)
for dimensions, defaults, limitations and a complete request example.

Pełna produkcja filmu bez pomocniczych skryptów: [audyt i nowe narzędzia](MCP_PRODUCTION_AUDIT.md). `get_production_capabilities` opisuje import publicznych mediów, modele lokalne, narrację, montaż, kontrolę eksportu i paczkę wynikową.
