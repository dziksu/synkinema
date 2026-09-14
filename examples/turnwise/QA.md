# Turnwise 001 — kontrola wersji roboczej

Stan z 14 września 2026: **gotowy projekt i zweryfikowany technicznie eksport do przeglądu właściciela; bez publikacji i bez jej zatwierdzenia**.

- Kanał: `37e4721a1acb4d1d83764e400cbe4b1d`.
- Projekt: `6f9896834bf24d88a48434c7472dda3e`, rewizja **3**.
- Końcowy render: `877f2234d83b42eea2fcffe94b249437`.
- Weryfikacja: `54e568b3588e4ed291df141ad2bab55b`, `completed`, `passed: true`, `decode_passed: true`.
- [MP4 z Synkinema](http://localhost:43817/media/renders/877f2234d83b42eea2fcffe94b249437.mp4).
- Kopia lokalna: `out/turnwise-001-final.mp4`.
- SHA-256: `7c02dcf047d8a13f1f1375128a1e01355a8a6a83d5b86ca0824b3b9b4272d4bb`.

## Wykonane kontrole

Preflight: 4 ścieżki, 14 klipów, 8 mediów, 22 000 ms; zero błędów i ostrzeżeń. Wszystkie źródła zostały zdekodowane przy imporcie. Końcowy eksport: H.264, yuv420p, 1080 × 1920, 30 fps, **660 klatek**, 22,000 s; AAC stereo 48 kHz, również 22,000 s. Pełne dekodowanie przeszło bez błędu. Hash pobranej lokalnej kopii odpowiada zweryfikowanemu eksportowi.

Obejrzano rzeczywiste klatki końcowego joba: 0; 2,1; 5; 8; 10,8; 13; 14,5; 16; 17; 18,5; 20; 21,9 s. Widoczne: obiekt i otwór w otwarciu, ciągła zmiana orientacji, wyjście spod płyty, niezmienione nacięcia i kompletny finał. Brak planszy otwierającej, dialogu, tekstowych nakładek, obcego interfejsu i czarnego zakończenia. Obrót/kamera są animowane, a nie wynikiem symulacji fizyki.

Pierwszy eksport rewizji 2 miał efekty zbyt ciche (-33,87 LUFS). W rewizji 3 zwiększono trzy ścieżki dźwiękowe o 9 dB i ustawiono zamierzony, spokojny poziom odniesienia -24 LUFS, bez automatycznej normalizacji. **Końcowy pomiar: -24,88 LUFS, -7,29 dBTP, brak ostrzeżeń i clippingu.** Przerwy bez dźwięku są celowe; nie ma muzycznej podłogi. Pomiar nie zastępuje odsłuchu.

W przeglądarce otwarto kanał i potwierdzono jeden połączony projekt. Edytor pokazał rewizję 3, 4 ścieżki i oddzielne klipy. Uruchomiono `Play export` i `Play`, po czym zaobserwowano dojście do `00:22.0 / 00:22.0` oraz powrót kontrolki Play. Zapis: `out/browser-review.json`. Serwerowy raport sam nie testuje przeglądarki, dlatego jego `browser_playback_tested: false` pozostawiono bez zmiany; obserwacja UI jest osobnym dowodem.

Kod produkcyjny: Ruff check i format check przeszły; składnia `render.mjs` przeszła `node --check`. Sformatowano MJS/JSON narzędziem Biome z osobną konfiguracją dla materiałów przykładowych. Nie zmieniono aplikacji ani jej kontraktu API, więc nie uruchamiano niezwiązanej regeneracji klienta czy testów aplikacji.

## Przed publikacją

- Właściciel ogląda i zatwierdza film.
- Kilka osób ogląda bez tytułu i dźwięku, po czym własnymi słowami opisuje cel i rezultat.
- Odsłuch na telefonie i słuchawkach ocenia przyjemność oraz proporcje efektów.
- Podglądy docelowych platform sprawdzają położenie akcji pod ich rzeczywistymi nakładkami.

Żadnej z powyższych czynności nie oznaczono jako wykonanej. Recenzja kanałowa jest subiektywną oceną agenta; nie jest prognozą wyników ani zgodą na publikację. Mechanizm jest celowo prosty; krótszy obrót lub trudniejsza zagadka to hipotezy dla następnych odcinków, nie zatwierdzone wnioski z analityki.
