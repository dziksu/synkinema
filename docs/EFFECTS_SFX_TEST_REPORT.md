# Test efektów obrazu i gotowej biblioteki SFX — 12.09.2026

Zakończono test na kopii shorta Wanderburg: projekt `3740ead770b24e878cf9966f584df5bd`, rewizja 3, final job `91200cdd642c48d0a2d18a2b561facff`. Oryginał `814ab2d68a204995b986728afcb7c52d` pozostał w rewizji 7. Agent montował przez MCP; rodzic dostarczył materiały, naprawił renderer i niezależnie zweryfikował eksport. Granice testu MCP opisano w `examples/steam-short/TEST_PROTOCOL.md`.

## Znalezione i naprawione błędy

- Natywne przejście FFmpeg `zoomin` rozciągało środek obrazu do niemal jednolitego koloru. Zastąpiono je ograniczonym zoomem do 1.18× z przenikaniem. Test regresji sprawdza zachowanie detalu w środku przejścia; odtworzył błąd przed zmianą i przeszedł po poprawce.
- `grayscale.value` było ignorowane w rendererze i podglądzie CSS. Teraz 0 zachowuje kolor, 0.5 częściowo desaturuje, 1 usuwa kolor. Regresja obejmuje wszystkie trzy wartości.
- Inspekcja mogła zwracać zapamiętaną klatkę podglądu mimo ukończenia finalnego renderu tej samej rewizji. Klucz cache klatki uwzględnia konkretny plik wideo, jego rozmiar i czas zmiany. Test sprawdza przejście od podglądu ≤640 px do finalnej klatki 720×960 oraz ponowne użycie właściwego cache. Cache wizualnych klipów i podglądów ma wersję renderera.

## Weryfikacja

- 38 testów backendu przeszło, w tym 11 nowych testów efektów/inspekcji na rzeczywistym FFmpeg.
- 15 istniejących testów frontendowych przeszło; produkcyjny build TypeScript/Vite przeszedł. W tej iteracji nie powtarzano pełnej ręcznej sesji DnD; wcześniejsza sesja jest opisana w UI_TEST_REPORT.md.
- 10 testów pikselowych efektów i przejść przeszło dodatkowo na kontenerowym FFmpeg 5.1; lokalny zestaw używa FFmpeg 8. Poprawiona inspekcja została następnie użyta przez żywe MCP na finalnym MP4.
- Sprawdzono blur, brightness, contrast, saturation, grayscale, vignette, sharpen, wyłączony efekt, animację zoomu i opacity oraz wszystkie przejścia: crossfade, fade_black, slide, wipe, zoom, blur.
- Ruff: bez błędów. Pytest zwraca dwa ostrzeżenia deprecacyjne bibliotek testowych Starlette/httpx/anyio.

## Biblioteka i miks

15 gotowych SFX z Kenney Interface Sounds, Impact Sounds i RPG Audio, licencja CC0, polskie nazwy oraz tagi PL/EN. Ponowny import potwierdził deduplikację. Wyszukiwanie `sfx` zwraca 15 pozycji, `whoosh` — dwie. Wszystkie mają co najmniej 100 ms. Oryginalny 20-ms glitch dostał ciszę do 120 ms; sam dźwięk pozostał niezmieniony. Surowy import ma tag `source-only` i nie jest elementem zestawu SFX.

| Akcent | Początek | Długość | Gain |
|---|---:|---:|---:|
| Zaskoczenie — bong | 0,100 s | 123 ms | −8 dB |
| Zoom — szybki świst | 2,850 s | 600 ms | −11 dB |
| Moduły — metal | 10,500 s | 272 ms | −11 dB |
| Blur — świst | 17,850 s | 569 ms | −12 dB |
| CTA — potwierdzenie | 23,000 s | 290 ms | −10 dB |

Obecność każdego SFX w finalnym AAC potwierdzono niezależnie przez dopasowanie jego fali po odjęciu dopasowanego podkładu. Korelacje wyniosły 0.903, 0.598, 0.605, 0.434 i 0.940; w kontrolnych przesuniętych oknach maksimum wynosiło 0.008–0.039. Dwie generacje stratnego AAC osłabiają korelację szumowych świstów. To kontrola sygnału, a nie deklaracja subiektywnego odsłuchu. Mapa audio w oknach 500 ms może nie wymienić bardzo krótkiego bongu w metadanych aktywnych ścieżek; niezależna kontrola fali potwierdziła jego obecność.

## Odbiór finalnego filmu

26 s, 1080×1920, 30 fps, H.264/AAC, 30 380 694 bajty. Pełne dekodowanie 780 klatek bez błędów. 10 polskich napisów pokrywa 0–26 s bez przerw; hook trwa 0–3 s. Rodzic obejrzał arkusz 23 klatek finalnego renderu, agent ponownie obejrzał klatki krytyczne po poprawce cache. Napisy pozostają ostre; kadr z modułami nie pokazuje angielskiego szyldu SHOP. Zoom działa w 3–3,2 s, blur w 18–18,22 s.

Miks: −14.11 LUFS, −2.16 dBTP. Brak clippingu. Pomiar pozostawia ostrzeżenie o przekroczeniu ustawionego celu −2.5 dBTP o 0.34 dB po kodowaniu AAC; zmierzony wynik spełnia kryterium odbioru ≤−1.5 dBTP.

MP4, SRT, projekt, arkusz klatek, mapa audio i raporty JSON: `examples/steam-short/out/effects-sfx/`. SHA-256 MP4: `692a1fd65202afcc956ba3e131fdbec40a35f6081ad55fb7315ccfcc5f00cb45`.

Aktualny serwer lokalny zawiera poprawki. Przejściowy błąd eksportu obrazu Dockera wynikał z braku miejsca; usunięto wyłącznie odtwarzalne pliki robocze tego zadania w `/private/tmp` (pobrany BBB i cache npm), po czym build i uruchomienie zakończyły się pomyślnie. Nie usuwano wolumenów ani projektów.

Instrukcja katalogu: [biblioteka SFX](../examples/sfx-library/README.md). Sposób montowania i inspekcji efektów opisano także w przewodniku dostępnym agentom przez MCP `get_agent_guide` i REST `/api/agent/guide`.
