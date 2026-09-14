# Raport weryfikacji — 2026-09-11

## Wyniki

| Kontrola | Wynik |
|---|---|
| Backend: pytest + rzeczywisty FFmpeg | 11/11 PASS, 12,13 s |
| Ruff | PASS |
| Frontend: TypeScript + Vite production build | PASS; JS 127,31 kB gzip, CSS 9,51 kB gzip |
| Docker build, Linux ARM64 | PASS |
| Render 1,5 s z napisami wewnątrz kontenera | PASS; obraz i audio 1,5 s |
| Inspekcja klatki i inicjalizacja MCP w kontenerze | PASS |
| Docker healthcheck, REST i statyczny frontend | PASS |
| Przeglądarka 1280×720 i 390×844 | Układ, nawigacja, odtwarzanie, panel audio i powiększenie podglądu sprawdzone |
| MCP po przeniesieniu projektu do Docker Compose | Obrazy ImageContent i pomiary audio zweryfikowane ponownie |
| Finalny plik: pełne dekodowanie FFmpeg | 1200 klatek, 0 błędów |

Testy obejmują rewizje i konflikty równoległych zapisów, walidację importu i timeline,
dzielenie klipu z zachowaniem offsetu źródła, REST/MCP, granice ścieżek plikowych,
render z przejściem i napisami, cache, kolejkę, anulowanie, restart workera, miks wielu
ścieżek z duckingiem, kompozycję przezroczystości nakładek i mock dostawcy TTS.

Dwie zależności testowe emitują ostrzeżenia deprecacyjne (Starlette TestClient / AnyIO).
Nie wpływają na wyniki testów. Nie wykonano płatnego wywołania ElevenLabs ani zdalnego
workflow GitHub. Pliki workflow są przygotowane lokalnie; nie opublikowano repozytorium.

## Reel „Zanim zapadnie cisza • Polska”

- Projekt: `5c1436ab1fe743ff96d13a99c3df559c`, rewizja 2.
- 40 s, 1080×1920, 30 FPS, H.264, AAC stereo 48 kHz.
- 5 ścieżek, 29 klipów, 7 ujęć; polski lektor, oryginalna muzyka i akcenty przejść.
- Głośność zintegrowana: −16,01 LUFS; true peak: −5,43 dBTP; LRA: 4,6 LU.
- Pełna długość audio: 40,000 s. Analiza obejmuje 80 okien po 500 ms.
- Render końcowy: 115,28 s na tym komputerze; nie jest to uniwersalny benchmark.
- Wyeksportowany MP4: `examples/polish-wildlife/out/zanim-zapadnie-cisza.mp4`.
- Wyniki maszynowe: `out/verification.json`; kontrola wzrokowa: `out/contact-sheet.jpg`.
- Źródła i autorstwo: `examples/polish-wildlife/CREDITS.md`.

Pierwszy podgląd ujawnił błędne znaczniki czasu audio przy połączeniu opóźnionych
ścieżek i sidechain. Dodano normalizację PTS do liczby próbek, ograniczenie długości
miksu i weryfikację strumieni przed uznaniem renderu za zakończony. Wadliwy job oznaczono
jako odrzucony przez QA. Poprawkę sprawdza test regresyjny z lektorem, muzyką i SFX.

## Działająca instancja

Studio działa przez `docker compose` na http://localhost:8080.
Kontener: `synkinema-synkinema-1`, wolumen: `synkinema_synkinema-data`.
Skopiowano spójny backup SQLite oraz niezmienne media. Katalog `.data` w repozytorium
pozostaje lokalną kopią z etapu developmentu; dalsze zmiany w studio zapisują się w wolumenie
Dockera, nie synchronizują automatycznie do `.data`.

Wymagany jest uruchomiony Docker/Colima. `docker compose stop` zatrzymuje studio bez kasowania
projektów; `docker compose start` uruchamia je ponownie. Zakres i ograniczenia wersji 0.1
opisuje README.
