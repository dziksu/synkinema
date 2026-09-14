# Testy edytora i DnD

Zakres: lokalny build Docker, rzeczywista przeglądarka sterowana myszą i klawiaturą przez CUA, pliki zaimportowane przez systemowy wybór plików. Projekt testowy **Montaż ręczny • Big Buck Bunny**, ID `3981685c85074291bcca0ffb7fc0820a`. Istniejący projekt o zagrożonych gatunkach pozostał zachowany.

## Poprawione problemy

- Dekoracyjne uchwyty klipów zastąpiono działającym przycinaniem obu krawędzi z ograniczeniami źródła i sąsiadów.
- Dodano przenoszenie między zgodnymi ścieżkami i wyodrębnianie audio przez przeciągnięcie klipu wideo na audio. Poprawiono wykrywanie ruchu wyłącznie pionowego.
- Dodano podgląd położenia, zgodność ścieżek, przyciąganie, anulowanie, przewijanie podczas ruchu i stabilną skalę osi czasu.
- Kolejne szybkie zmiany są kolejkowane zamiast pomijane; każda używa najnowszej zapisanej rewizji. Konflikt anuluje zależne zmiany.
- Cofanie i ponawianie korzystają ze stosów rewizji zamiast przełączać dwie ostatnie wersje.
- Zapis nie remountuje inspektora przy każdym żądaniu; przechodzenie między polami zachowuje fokus. Cofnięcie i błąd odświeżają wartości.
- Przejście automatycznie dopasowuje nakładanie ujęć. Przenoszenie klipu odłącza nieaktualne przejścia; przycięcie końca zachowuje poprawne przejście wejściowe.
- Dodano tworzenie, przeciąganie kolejności i usuwanie pustych dodatkowych ścieżek, duplikowanie klipów i regulację wysokości timeline.
- Rozdzielono ikony ukrywania obrazu od wyciszania dźwięku. Najczęstsze błędy mają polskie komunikaty.

## Sprawdzone ręcznie w przeglądarce

| Scenariusz | Wynik |
|---|---|
| Utworzenie projektu 16:9, przeładowanie i ponowne otwarcie | PASS |
| Import trzech plików MP4 z audio, filtrowanie biblioteki | PASS |
| Import uszkodzonego MP4 | Odrzucony; edytor pozostaje sprawny |
| Biblioteka → główna ścieżka obrazu | PASS |
| Prawy uchwyt: 8 s → 6 s | PASS; inspektor aktualizuje długość |
| Pionowe DnD wideo → audio | PASS; źródło, przycięcie, czas i prędkość zachowane; obraz pozostaje |
| Audio → inna ścieżka audio | PASS |
| Wyciszenie audio | PASS; w podglądzie pozostaje wideo |
| Ukrycie obrazu | PASS; w podglądzie pozostaje audio |
| Nieme MP4 → ścieżka audio | Odrzucone bez dodania klipu |
| Nieme MP4 → obraz | PASS; przycisk wyodrębniania audio jest ukryty |
| Wideo → napisy | Odrzucone bez zmiany montażu |
| Dodanie ścieżki obrazu i przeciągnięcie jej kolejności | PASS |
| Wideo → overlay → główna ścieżka | PASS; kolizja rozwiązywana wolnym miejscem |
| Przenikanie między ujęciami | PASS; start 6,0 s → 5,7 s dla przejścia 300 ms |
| Cofnięcie i ponowienie przejścia | PASS |
| Dzielenie źródła na 3 s + 3 s | PASS |
| Lewy uchwyt drugiej części: przycięcie o 1 s | PASS; start źródła 4 s, długość 2 s |
| Dosunięcie przyciętej części bez przerwy | PASS |
| Ekstrakcja audio z podzielonych i przyciętych części | PASS; kontrola zapisanych offsetów przez API |
| Szybkie wpisanie nagłówka, podpisu, rozmiaru, dwóch fade | PASS; wszystkie wartości w zapisanym projekcie |
| Szybkie zmiany skali i kadru X | PASS; oba pola zachowane |
| Duplikowanie napisu, edycja planszy końcowej | PASS |
| Usunięcie pustej ścieżki, cofnięcie, ponowienie | PASS |
| Delete na klipie i Cmd+Z | PASS |
| Regulacja wysokości timeline | PASS |
| Widoki 1440×1000 i 390×844 | Bez poziomego przepełnienia dokumentu; mały ekran przewija się pionowo |
| Konsola przeglądarki | Brak błędów JavaScript podczas sprawdzanych przepływów |
| Dwa szybkie kliknięcia dodawania materiału | PASS; kolejne pozycje 17,7 s i 23,7 s bez kolizji |
| Dwa kolejne cofnięcia dodanych klipów | PASS |
| Numeryczne przycięcie końca ujęcia z przejściem | PASS; długość 6 s i poprawny start 5,7 s |
| Przyspieszenie 2× | PASS; długość ograniczona do 4 s dla źródła 8 s |
| Start źródła 100 s przy źródle 8 s | Odrzucony; pole wraca do zapisanej wartości 0 s |
| Szybkie ustawienie kontrastu i nasycenia | PASS; oba efekty zapisane |
| Eksport uruchomiony przez UI | PASS |

To testy desktopowej przeglądarki, również przy wąskim viewport. Nie stanowią testów dotykowego DnD na fizycznym telefonie ani pełnej macierzy Safari/Firefox.

## Testy automatyczne

`npm --prefix apps/studio test`: 15 testów — geometria i ograniczenia montażu, kolejka i konflikt zapisu, rzeczywisty komponent Timeline w jsdom: pionowa ekstrakcja, niezgodne ścieżki, Esc, lewy uchwyt, drop bez poprzedniego dragover. `npm run build`: TypeScript i build produkcyjny.

`.venv/bin/pytest -q`: 15 testów — atomowe rewizje, źródła, render i audio, błędy importu, kolejka renderów, przejścia, DnD na poziomie operacji: przeniesienie audio, mute, kolejność i usunięcie ścieżki, odrzucenie kolizji oraz zachowanie przejścia przy przycinaniu końca.

`ruff check apps/server tests scripts`: PASS. Dwie istniejące ostrzegawcze informacje o deprecated API zależności Starlette nie blokują testów.

## Rzeczywisty film kontrolny

`examples/editor-qa/out/mala-przygoda-ui-test.mp4`: 4 fragmenty wideo, 4 odpowiadające im klipy audio, 2 napisy, przenikanie i zmienione kadrowanie. Cały montaż wykonano przez UI.

- 1920×1080, 30 FPS, H.264 + AAC.
- Wideo i audio: dokładnie 17,700 s; 531 klatek.
- Pełne dekodowanie FFmpeg: bez błędów.
- Głośność po dekodowaniu AAC: −15,97 LUFS, true peak −1,42 dBTP.
- Render pierwszego eksportu: 40,34 s.
- Obejrzany arkusz sześciu rzeczywistych klatek: obraz, tytuł, kolejne ujęcia i atrybucja obecne.

Dowody lokalne: `examples/editor-qa/out/project.json`, `contact-sheet.jpg`, `validation.log`. Źródła i licencja: [CREDITS.md](../examples/editor-qa/CREDITS.md). Instrukcja: [MANUAL_EDITING.md](MANUAL_EDITING.md).

Ograniczenia: podgląd montażu jest uproszczony; dzielenie klipu z animacją wymaga jej uprzedniego wyłączenia. Wyodrębnione audio jest niezależnym klipem, a nie automatycznie połączoną parą z obrazem.

Końcowa rewizja projektu: **59**. Jej zawartość poza numerem rewizji jest identyczna z pierwszym zweryfikowanym eksportem rewizji 47; ponowiono eksport dla aktualnej rewizji.

Eksport końcowy rewizji 59: job `a9ae2bd919924bfdaab0f18439e5447c`, status `completed`, 33,38 s. Plik `mala-przygoda-ui-test-final.mp4` jest bitowo identyczny z analizowanym pierwszym eksportem (SHA-256 obu: `26bbc716435de12984f07ec84e23e44f4d78c643003164bfe2c70d22fb3ecb4d`). Końcowa konsola przeglądarki: bez błędów. Po testach przywrócono domyślny viewport.
