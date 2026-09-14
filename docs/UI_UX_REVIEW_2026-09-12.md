# Ponowny przegląd UI/UX — 12.09.2026

Przepływ wykonano w rzeczywistej przeglądarce przez CUA: nowy projekt, biblioteka, montaż myszą/klawiaturą, import przez wybór pliku, odsłuch, eksport i odtworzenie finalnego MP4. Projekt testowy **Review UX • montaż od zera**, `14a2dbe7c04145379aec535f38d3cbe6`, rewizja 33. Wcześniejsze projekty pozostały bez zmian.

## Naprawy wynikające z przejścia flow

- Szybka zmiana początku, długości i animacji mogła przywrócić stary początek albo wysłać klatki kluczowe poza nową długością. Zamiar zmiany jest teraz przeliczany na aktualnym klipie dopiero przy wykonaniu kolejnej operacji. Regresję odtworzono ręcznie przed poprawką i powtórzono z wynikiem PASS po zmianie.
- Pola liczbowe odrzucały poprawne wartości niepasujące do kroku strzałek, np. 50 ms fade przy kroku 100. Przyjmują teraz precyzyjne wartości w granicach zakresu; fade ma krok 1 ms. Test ręczny potwierdził zapis 50 ms.
- Materiały audio dostały osobny przycisk odsłuchu w panelu montażu. Odsłuch nie dodaje klipu i tylko jedna próbka biblioteki gra jednocześnie. Krótkie długości pokazują milisekundy.
- DnD i przycisk dodawania korzystają z tych samych początkowych poziomów audio: SFX −12 dB, inne samodzielne audio −18 dB. Źródło wideo zachowuje dotychczasowe ustawienia. Zbyt krótkie materiały (<100 ms) nie mogą zostać przypadkowo dodane do osi czasu; nadal można je odsłuchać.
- Nowy klip jest automatycznie zaznaczany, a kursor ustawiany na jego początku. Dodawanie przyciskiem uwzględnia wybraną zgodną ścieżkę.
- Uzupełniono ręczne ustawienia grayscale, winiety i wyostrzenia. Najazd rozpoczyna się od bieżącego powiększenia. Stan animacji jest dostępny dla technologii asystujących, a wszystkie animacje można wyłączyć jednym przyciskiem.
- Ekstrakcja przez przycisk korzysta ze wspólnej operacji `extract_audio`, zachowującej offset, prędkość, gain i fade. Brak ścieżki audio daje komunikat zamiast bezczynnego przycisku.
- Projekty i główne widoki mają adresy w hash URL. Odświeżenie otwiera ten sam projekt; Wstecz wraca do poprzedniego widoku. Dodano stan ładowania i obsługę niedostępnego projektu.
- Puste wyniki wyszukiwania nie sugerują już, że cała biblioteka jest pusta. Dostępne jest czyszczenie filtrów; pola wyszukiwania mają etykiety dostępności.
- Poprawiono wysokość i proporcje obszarów edytora w oknie laptopa o wysokości 720 px. Timeline nie jest już ściskany wbrew ruchowi uchwytu.
- Linki źródłowe poprawnie wyodrębniają adres z metadanych typu `URL | nazwa pliku`; wcześniej kierowały na nieistniejącą stronę zawierającą dopisek.

## Sprawdzone scenariusze

| Flow użytkownika | Wynik |
|---|---|
| Utworzenie projektu pionowego przez modal | PASS |
| Biblioteka → obraz przez DnD, dodanie drugiego filmu przyciskiem | PASS |
| Szybkie zmiany startu, długości i zoomu | PASS po poprawce |
| Włączenie/wyłączenie zoomu; nowe efekty 0.5 grayscale, 0.2 winieta, 0.3 sharpen | PASS |
| Przenikanie 300 ms i cofnięcie do cięcia | PASS |
| Wyodrębnienie audio przyciskiem oraz pionowym przeciągnięciem | PASS |
| Audio między ścieżkami; SFX z biblioteki na sound | PASS |
| Osobna ścieżka SFX, mute/unmute, gain −12 dB, fade 50 ms | PASS |
| Odsłuch świstu bez zmiany rewizji | PASS; media currentTime rośnie, brak media error |
| Polski tekst na obu ujęciach; autozaznaczenie nowego napisu | PASS |
| Import istniejącego MP4 przez chooser; deduplikacja | PASS, biblioteka nadal 31 materiałów |
| Brak wyników → wyczyść filtry | PASS |
| Biblioteka → Wstecz → projekt; odświeżenie projektu | PASS |
| Eksport z UI, status Gotowe, MP4 w podglądzie | PASS |
| Produkcyjne linki źródeł Kenney | PASS |
| Desktop 1440×1000 i 1280×720; widok 390×844 | PASS; bez poziomego przepełnienia dokumentu |
| Konsola końcowego buildu | Bez błędów |

Wąski widok sprawdzono w przeglądarce desktopowej. Nie jest to test dotykowego DnD na fizycznym telefonie ani macierz Safari/Firefox. Podgląd montażu pozostaje uproszczony; finalne efekty oceniono również w rzeczywistym eksporcie. Animowany klip wymaga wyłączenia animacji przed podziałem. Stosy cofania są sesyjne; pełne rewizje pozostają w Historii.

## Weryfikacja automatyczna i artefakt

29 testów frontendowych przeszło, w tym 14 nowych regresji względem poprzednich 15. Obejmują przeliczanie kolejkowanych zmian, odsłuch bez dodawania klipu, jeden aktywny odsłuch, adresy projektów, linki źródeł, dokładne wartości liczbowe, minimalną długość materiału i gain SFX w rzeczywistym komponencie Timeline. TypeScript/Vite oraz produkcyjny build Docker przeszły. Backend nie był zmieniany; wcześniejszy zestaw 38 testów i działający renderer uzupełniono rzeczywistym eksportem przez UI.

Final job `05d92ca38a354e6f806abc4cf75688da`: **1080×1920, 30 fps, 6 s, H.264/AAC**, render 12.57 s. 7 klipów: dwa obrazy, dwa niezależne audio źródłowe, SFX i dwa napisy. Napisy pokrywają 0–3 i 3–6 s. Pełne dekodowanie bez błędów; cztery klatki obejrzane. Odtwarzacz przeglądarki potwierdził 1080×1920 i rosnący czas odtwarzania finalnego pliku.

Pliki lokalne: `examples/editor-qa/out/review-2026-09-12/` — `ui-review.mp4`, `project.json`, `job.json`, `validation.json`, `contact-sheet.jpg`. SHA-256 MP4: `f1e3e10d9e43eb2002eabfa73a3b4932d37d47cd31b22e0128a200ec8b61fcaf`. Materiały Big Buck Bunny: licencja i źródła w `examples/editor-qa/CREDITS.md`; świst Kenney CC0 z biblioteki SFX.

Poprawki wdrożono na lokalny serwer `http://localhost:8080`; stan kontenera healthy. Projekt można otworzyć pod `/#/projects/14a2dbe7c04145379aec535f38d3cbe6`.
