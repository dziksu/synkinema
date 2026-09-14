# Porównanie możliwości edytora — 12.09.2026

Punktem odniesienia jest podstawowy montaż opisany w [oficjalnym przeglądzie edycji DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve/edit): wybór In/Out w źródle, decyzja o strumieniach, określenie miejsca montażu, korekta na osi i eksport. To porównanie workflow, nie deklaracja zgodności z pełnym edytorem profesjonalnym.

| Obszar | Przed tą rundą | Wynik / dalszy zakres |
|---|---|---|
| Podgląd źródła i In/Out | Dodawanie całego pliku; źródło przycinane później liczbami | Dodany wizualny monitor filmu/audio, suwak, wartości sekund, I/O, podgląd zaznaczenia |
| Wybór obrazu i audio przed montażem | Wideo dodawane bez audio, wyodrębnianie osobno | Trzy tryby strumieni, wybór torów, opcjonalnie nowy tor audio |
| Miejsce wstawienia | Koniec toru albo DnD całego pliku | Kursor, koniec toru i DnD wybranego zakresu; konflikt na głównym torze rozwiązywany do przodu |
| Cofanie dodania obrazu z audio | Dwie osobne czynności | Jedna atomowa partia, jedno cofnięcie/ponowienie |
| Układ podczas wyboru fragmentu | Wąska kolumna biblioteki | Poszerzony panel źródła, aktywny timeline, układ jednokolumnowy na telefonie |
| Wiele zaznaczonych klipów i grupy | Jedno zaznaczenie | Nadal brak; następny priorytet dla dłuższych montaży |
| Trwałe łączenie obrazu z wydzielonym audio | Oddzielne klipy | Wspólne wstawienie jest dodane; późniejsze ruchy/cięcia pozostają osobne |
| Ripple delete/trim | Usuwanie pozostawia lukę; przejścia mogą przesuwać dalszą część projektu | Nadal brak ogólnego usuwania z domykaniem luki; wymaga zasad dla napisów i nakładającego audio |
| Dzielenie animowanego klipu | Wymagane usunięcie animacji | Nadal ograniczenie; zachowanie krzywych easing przy podziale wymaga osobnej zmiany silnika |

Wybrany do wdrożenia został cały przepływ **źródło → zaznaczony fragment → obraz/audio → timeline**, ponieważ eliminuje potrzebę wstawiania wielominutowego pliku tylko po to, aby wyciąć z niego kilka sekund.

## Implementacja i granice

`SourceMonitor.tsx` obsługuje odtwarzanie i In/Out. `sourceInsert.ts` rozwiązuje ścieżki, zakres oraz wolne miejsce na najnowszym stanie projektu w kolejce zapisów. Backend otrzymuje standardową atomową partię `add_clip` i opcjonalnego `add_track`; nie dodano nowej publicznej operacji. Walidacja odrzuca niepoprawne zakresy, brak audio i niezgodne ścieżki. Podgląd DnD oraz zapis używają tej samej funkcji wyznaczania wolnego miejsca.

Zaznaczenie źródła nie zapisuje się w projekcie; zamknięcie panelu je resetuje. Obraz i audio po dodaniu nie są połączoną grupą. Skróty panelu nie przechwytują pisania w polach. Przewijanie klatkami korzysta z FPS projektu; nie jest to narzędzie analizy timecode źródła/VFR.

## Testy

- **39 testów frontendu PASS**, TypeScript/Vite build PASS; Biome i Ruff format-check PASS.
- Nowe testy: zgodne czasy obrazu/audio, zakres i granice źródła, brak audio, niezgodne/usunięte tory, nowe audio w tej samej partii, zajęte miejsce, sam dźwięk, I/O po użyciu transportu, błędy odtwarzania, payload DnD fragmentu zamiast całego pliku. Zachowano regresje DnD całych plików i SFX.
- Natywne UI: nowy projekt **QA • fragmenty źródłowe**, `0a89cac80fd54c7aa6e9b1dc32d2b809`. Wybrano 1–3 s z `bunny-akcja.mp4`, dodano obraz i nowy tor audio w rewizji 2. Jedno Cofnij usunęło komplet (r3); Ponów przywróciło komplet (r4).
- DnD: zaznaczenie 3–5 s przeciągnięto za pierwsze ujęcie (r5). Backend potwierdził dwa klipy obrazu i dwa audio: starty 0/2000 ms, source_in 1000/3000 ms, długości po 2000 ms.
- Sam dźwięk: dodany na końcu wybranego toru (r6), cofnięty (r7). Odtwarzanie zakresu 4–5 s zatrzymało się przy `currentTime=5`, `paused=true`.
- Sprawdzono desktop 1280×720 i telefon 390×844; plik `bunny-niemy.mp4` oferuje tylko obraz. Panel przewija się pionowo.
- Eksport finalny r7: job `4f2f28f214484d2abb13051483e806b4`, gotowy w 4,67 s. MP4 **4,000 s, 1080×1920, H.264 + AAC**; pełne dekodowanie FFmpeg bez błędów. Klatki z obu ujęć obejrzano w UI.
- Lokalny wynik: `examples/editor-qa/out/source-monitor/source-monitor-test.mp4` (artefakt QA ignorowany przez Git).

Finalna kontrola po wdrożeniu: kontener healthy, panel działa na `http://localhost:8080`. Na desktopie obraz, In/Out oraz ustawienia wstawiania są rozdzielone na trzy kolumny; przewijanie ustawień nie ukrywa obrazu. Na telefonie szerokość dokumentu 384 px przy viewport 390 px, bez poziomego przepełnienia. Konsola przeglądarki bez błędów. Przywrócono standardowy viewport i zatrzymano pomocniczy serwer Vite.
