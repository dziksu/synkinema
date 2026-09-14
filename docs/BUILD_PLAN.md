# Synkinema — plan wynikający z całej rozmowy

Źródło: [pełna rozmowa](SOURCE_CONVERSATION.md), 16 tur, odczytane 2026-09-11.
Nazwa końcowa: Synkinema. Wcześniejsze nazwy nie są nazwami modułów.

## Obowiązujące decyzje

- Lokalny, niezależny od UI silnik kompozycji; REST, MCP, CLI wywołują wspólny Service.
- Python 3.12, FastAPI, Pydantic 2, SQLite WAL przez SQLAlchemy, pliki w wolumenie.
- React 19, TypeScript, Vite, Tailwind, dostępne prymitywy Radix/shadcn, Query i Zustand.
- FFmpeg jako proces z tablicą argumentów, bez shella, ograniczone wątki, jeden worker.
- Jedna aplikacja/kontener z frontendem; bez Redis, Chromium, Playwright i modeli AI.
- Biblioteka globalna z checksumami i tagami, projekty referencjonują niezmienne media.
- Scenariusz, sceny, narracja, napisy, wielościeżkowy timeline i profile wyjścia.
- Edycja niedestrukcyjna, snapshoty rewizji i optimistic concurrency dla człowieka i agenta.
- Transformacje, stos efektów, przejścia, klatki kluczowe, głośność, ducking i dwupass LUFS.
- Inspekcja rzeczywiście wyrenderowanych klatek, contact sheet, preview, mapa audio i komentarze.
- Lektor: import oraz wymienny provider BYOK. Późniejsza decyzja dopuszcza TTS; nieoficjalny Edge nie jest fundamentem produktu.
- MIT dla własnego kodu. Żadnego kopiowania VideoFlow/RVE/Twick ani uzależniania domeny od edytora.

## Kolejność realizacji

1. Model domenowy i trwały storage, import/probe/miniatury, operacje i rewizje.
2. RenderPlan/FFmpeg, cache, kolejka i anulowanie, podstawowy miks.
3. Web Studio: projekty, biblioteka, podgląd, timeline, inspektor, scenariusz, rendery, historia.
4. REST i MCP: wspólna domena; klatki zwracane jako ImageContent; CLI.
5. Diagnostyka audio i wizualna, uwagi na timeline, testy integracyjne.
6. Docker, CI, dokumentacja i powtarzalny projekt demonstracyjny.
7. Render dynamicznego reela o zagrożonych gatunkach w Polsce, kontrola obrazu/dźwięku/parametrów.

## Strategia implementacji

Pierwsze wydanie daje kompletną pętlę import → montaż → render → inspekcja → poprawka.
Złożone funkcje rozszerzające (np. semantyczne wyszukiwanie, LUT, stabilizacja, transkrypcja,
zaawansowany alignment słów, automatyczna ocena estetyki) pozostają rozszerzeniami,
a nie przyciskami udającymi działanie. Zakres obsługi renderera jest jawny w `/api/capabilities`.
