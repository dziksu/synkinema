# Audyt poleceń agentów — 12 września 2026

REST, MCP i CLI obsługują pełny obecnie zaimplementowany przepływ: import → montaż → kontrola projektu → render → inspekcja obrazu/audio → poprawki. MCP ma 44 narzędzia, katalog montażu 16 operacji. Wbudowana instrukcja i schematy są dostępne bez repozytorium.

## Uzupełnione braki

- `append_clip` oblicza koniec docelowej ścieżki i opcjonalnie długość pozostałego źródła z uwzględnieniem prędkości.
- `duplicate_clip` kopiuje ustawienia, generuje nowe ID i usuwa przejście wejściowe; umożliwia wybór ścieżki i czasu.
- `extract_audio` kopiuje dźwięk wideo z zachowaniem przycięcia, czasu, prędkości, głośności i fade; usuwa ustawienia wizualne. Dalsze zmiany obu klipów są niezależne.
- `apply_operations` wykonuje 1–100 operacji atomowo, z jedną rewizją. `dry_run` zwraca projekt próbny, bez zapisu. Jawne ID umożliwiają odwołania do klipów z wcześniejszych kroków.
- `validate_project` wykrywa błędy źródeł/ścieżek/przejść oraz ostrzega o lukach, braku audio i końcówce wydłużonej przez wyciszone klipy. Nie dekoduje materiału i nie zastępuje oceny renderu.
- `clone_project` tworzy niezależny wariant z dokładnej rewizji. Współdzieli źródła, zachowuje lokalne ID klipów, nie kopiuje komentarzy ani renderów.
- MCP: odczyt pojedynczego zasobu, lista renderów, rozwiązanie komentarza, eksport SRT i metadane źródła/licencji przy imporcie.
- REST: wybór rewizji punktów inspekcji i napisów. SRT zawiera tekst główny oraz podtytuł, domyślnie pomija wyciszone ścieżki.
- Lista jobów filtruje projekt **przed** ograniczeniem do 100 wyników; aktywność innych projektów nie ukrywa starszego joba wskazanego projektu.
- CLI: odczyt projektu/zasobów/historii/schematów, edycje i partie z plików JSON lub stdin, preflight, kopia, napisy, komentarze, render z przypiętą rewizją, oczekiwanie/anulowanie oraz dostęp do pozostałych endpointów przez `request`.

## Mapa poleceń

Adresy REST poniżej zaczynają się od `/api`. `P`, `A`, `J`, `C` oznaczają ID projektu, zasobu, joba i komentarza zwrócone przez serwer.

| Potrzeba | REST | MCP | CLI |
|---|---|---|---|
| Instrukcja, możliwości, schematy | GET `/agent/guide`, `/capabilities`, `/schema/project`, `/schema/operations` | `get_agent_guide`, `get_capabilities`, `get_project_schema`, `get_operation_reference` | `guide`, `capabilities`, `schema` |
| Projekty i stan rewizji | GET/POST `/projects`, GET `/projects/P?revision=R` | `list_projects`, `create_project`, `get_project` | `projects`, `create`, `project --revision` |
| Wariant projektu | POST `/projects/P/clone` | `clone_project` | `clone P "Nazwa" --revision R` |
| Montaż pojedynczy | POST `/projects/P/operations` | `apply_operation` | `edit P operation.json` |
| Montaż atomowy i próba | POST `/projects/P/operations/batch` | `apply_operations` | `batch P batch.json --dry-run` |
| Historia i przywracanie | GET `/projects/P/history`; operacja `restore_revision` | `list_revisions`; `apply_operation` | `history`; `edit` |
| Kontrola przed renderem | GET `/projects/P/preflight?revision=R` | `validate_project` | `validate P --revision R` |
| Wyszukiwanie/odczyt źródeł | GET `/assets`, `/assets/A` | `search_assets`, `get_asset` | `assets`, `asset` |
| Import z atrybucją | POST `/assets` multipart | `import_asset` base64, do 12 MiB | `import file --source ... --license ... --tag ...` |
| Tagi | PUT `/assets/A/tags` | `tag_asset` | `request PUT ... --json-file tags.json` |
| Głos | GET `/voices/status`, POST `/voices/generate` | `get_voice_provider_status`, `generate_voice_take` | `request` z odpowiednim endpointem |
| Render / zakres filmu | POST `/projects/P/renders` | `start_render` | `render P --expected-revision R --from-ms X --to-ms Y --wait` |
| Lista / status / anulowanie | GET `/jobs?project_id=P`, GET `/jobs/J`, POST `/jobs/J/cancel` | `list_render_jobs`, `get_render_progress`, `cancel_render` | `jobs`, `job`, `wait`, `cancel` |
| Punkty inspekcji | GET `/projects/P/inspection/points?revision=R` | `get_inspection_points` | `points P --revision R` |
| Klatka / contact sheet / dźwięk | POST `/projects/P/inspection/frame`, `/sheet`, `/audio` | `render_frame`, `render_frames`, `analyze_audio` | `request POST ... --json-file inspection.json` |
| Komentarze i rozwiązanie | GET/POST `/projects/P/comments`, PATCH `/projects/P/comments/C` | `list_review_comments`, `create_review_comment`, `resolve_review_comment` | `comments`, `request POST`, `resolve-comment` |
| Eksport SRT | GET `/projects/P/captions.srt?revision=R` | `export_captions` | `captions P --revision R` |

`request` jest ogólnym klientem REST, a nie dodatkowym API serwera. Specyfikację wszystkich jego wejść udostępnia `/api/openapi.json`. Dla dużych plików należy używać importu multipart, a nie base64.

## Ograniczenia

Brak automatycznej transkrypcji, detekcji ujęć, pobierania URL, wyszukiwania stocków i automatycznego powiązania audio z wideo po ekstrakcji. Przycinanie animacji wymaga obliczenia klatek kluczowych; animowanego klipu nie można bezpośrednio podzielić. Obecny renderer obsługuje jedną aktywną główną ścieżkę video i dodatkowe overlay. Warstwy mają statyczne pozycjonowanie i rozmiar (placement), w tym picture-in-picture; arbitralne filtry FFmpeg pozostają poza API. TTS wymaga skonfigurowanego ElevenLabs i autoryzowanego użycia płatnej usługi.

Nie dodano usuwania projektów/źródeł ani automatycznego pobierania z dowolnych URL: nie są wymagane do montażu i eksportu. Po przerwanym wywołaniu mutacji trzeba sprawdzić stan, ponieważ nie ma kluczy idempotencji. `dry_run` nie rezerwuje rewizji ani wygenerowanych ID; zapis może zgłosić konflikt po równoległej edycji użytkownika.

## Weryfikacja

- 27/27 testów backendu, 15/15 testów frontendu, Ruff: PASS.
- Testy schematów i przykładów wszystkich 16 operacji, pełne pokrycie opisów tras i 44 narzędzi MCP.
- Testy atomowości obejmują błąd późnego kroku, błąd końcowej walidacji, tryb próbny bez historii i dwóch jednoczesnych autorów — jeden zapisuje, drugi otrzymuje konflikt.
- Testy audio obejmują offset źródła, prędkość 1,25×/2×, fade, gain, usunięcie animacji wizualnych oraz odrzucenie źródła bez dźwięku.
- Testy backendu generują własny mały MP4 przez FFmpeg; nie wymagają pobierania ani ignorowanych plików demo.
- Obraz Docker zbudowany i sprawdzony na oddzielnej instancji. Prawdziwy Big Buck Bunny: przez REST i sesję MCP wykonano dry-run → zapis ośmiu zmian → preflight → render → contact sheet → audio. Oba filmy: 3,7 s, 640×360, 30 FPS, H.264/AAC, rewizja 2, −16,03 LUFS, −1,82 dBTP, bez ostrzeżeń.
- Obejrzano rzeczywiste klatki z przejściem i polskimi znakami. Eksporty REST/MCP są identyczne bajtowo: SHA-256 `096e9b91a6562ceebed33bffe3416931490ece958736eaaac9a7a12f980c949d`. Pełne dekodowanie FFmpeg bez błędów.
- Rzeczywisty CLI: kopia projektu → próbna partia → zapis → odczyt schematu i źródła → SRT → render zakresu 500–2500 ms z oczekiwaniem → lista jobów → analiza audio. Job `completed`, −17,45 LUFS, bez ostrzeżeń.
- OpenAPI zawiera 29 ścieżek URL. Wyniki i pliki testowe są lokalnie w `examples/editor-qa/out/agent-helpers/{rest,mcp,cli}/`; film testowy nie zastępuje istniejących projektów użytkownika. Atrybucja materiału: [CREDITS.md](../examples/editor-qa/CREDITS.md).
