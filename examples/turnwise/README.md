# Turnwisee

Kanał krótkich, zrozumiałych bez słów historii o przedmiotach, materiałach i mechanizmach. Obietnica: **jedna widoczna zagadka, rzeczywisty postęp, pełne rozwiązanie**.

- [Kanał w Synkinema](http://localhost:43817/#/channels/37e4721a1acb4d1d83764e400cbe4b1d)
- [Połączony projekt pierwszego odcinka](http://localhost:43817/#/projects/6f9896834bf24d88a48434c7472dda3e)
- [Publiczny kanał YouTube — @turnwisee](https://www.youtube.com/@turnwisee)
- [Pierwszy opublikowany Short](https://youtube.com/shorts/OBK7J2vAkkY)
- Nazwa: **Turnwisee**, wybrana przez właściciela przy zakładaniu YouTube (pierwotny brief: Turnwise). Skojarzenie ze zmianą spojrzenia i sprytnym obrotem.
- Identyfikacja: ciepły mosiądz, porcelana, głęboki turkus; znak elementu przechodzącego przez pierścień.
- Opis publiczny: “Small mysteries. Clever transformations. Satisfying endings. Visual stories told without words — made to spark curiosity wherever you are. No talking. Just a closer look.”
- Trzy serie: **Will it work?**, **What is it?**, **Flat to form**.

Aktualny brief i reguły produkcji są zapisane w kanale oraz w `channel.json`. Od 15 września obowiązują [zasady generowania v2](GENERATION_RULES.md): widoczny problem od początku, ocena pomysłu przed renderem, mocniejszy postęp i ruch z czytelną przyczyną. Fizyka służy historiom o dynamice; nie jest celem samym w sobie. Aktualne cele pomiarowe i progi decyzji są w [YOUTUBE_EXPERIMENT.md](YOUTUBE_EXPERIMENT.md), a metadane i potwierdzony stan publikacji w `youtube-launch.json`. Kanał YouTube założył właściciel. Na jego zlecenie aktywowano harmonogram w tym samym zadaniu: codziennie 18:30 i 21:30 czasu polskiego, produkcja i jedna publikacja od poniedziałku do soboty, w niedziele tylko analiza. Procedura, upoważnienie do kolejnych publikacji i ograniczenia są w [AUTOMATION.md](AUTOMATION.md). Identyfikator automatyzacji: `turnwisee-analiza-produkcja-i-publikacja`.

Doprecyzowanie dla kolejnych produkcji po odcinkach 002 i 003: otwarcie pokazuje start, istotne przeszkody i cel od pierwszej klatki, a prosty czytelny mechanizm uruchamia się około 1 s. Wcześniejsze 2–3 s nie oznacza obowiązkowego czekania. Widz ma móc przewidzieć wynik lub postawić konkretne pytanie; szczegóły i kontrola `full_problem_first` są w [GENERATION_RULES.md](GENERATION_RULES.md).

Właściciel zaakceptował 10-sekundowy wariant **003 fast-loop** jako wzorzec tempa: domyślnie fizyka 1,0×, żywy ruch bez monotonii i sztucznego wydłużania. Naturalna pętla jest pożądana, gdy pasuje do historii: pełna odpowiedź przed widocznie napędzanym powrotem i płynne połączenie końca z początkiem. Nie jest obowiązkowa. Zasady zapisano także w kanale Synkinema i instrukcji aktywnego harmonogramu. Wieczorny odczyt 16 września ma sprawdzić dostępne wyniki po potwierdzeniu rzeczywistej publikacji właściwej wersji; akceptacja właściciela pozostaje oceną jakościową, nie dowodem poprawy analityki.

## Pierwszy odcinek: The long way through

**22 sekundy, 1080 × 1920, 30 fps.** Oryginalna animacja 3D i proceduralny sound design. Bez dialogu, narracji, napisów i podkładu muzycznego.

Długi mosiężny element nie przechodzi bokiem przez mały okrągły otwór. Podnosi się, obraca pionowo, trafia nad otwór i przechodzi przez niego w ciągłym ujęciu. Kamera obniża się, aby pokazać przejście. Element z tymi samymi trzema nacięciami układa się na dolnej podstawie. Rozwiązanie pozostaje widoczne przez ostatnie 2,3 sekundy.

| Czas | Funkcja |
| --- | --- |
| 0–3 s | Obiekt, otwór i próba ustalają problem. |
| 3–5 s | Odsłonięcie otworu przywraca pełny kontekst. |
| 5–10,8 s | Obrót ujawnia możliwe rozwiązanie. |
| 10,8–13 s | Dopasowanie przekroju do otworu. |
| 13–17 s | Ciągłe przejście na drugą stronę. |
| 17–19,7 s | Ten sam element osiada na dolnej podstawie. |
| 19,7–22 s | Spokojny, kompletny finał. |

To stylizowana animacja z zaprogramowanym ruchem, nie nagranie fizycznego eksperymentu ani symulacja dynamiki. Geometria elementu i otworu pozostaje stała. Długość elementu wynosi 3,10 jednostki sceny, średnica 0,72, średnica otworu 1,02. Nie zmienia on skali i nie jest podmieniany. Grawerowanie pomaga śledzić jego tożsamość.

Projekt ma **4 ścieżki i 14 klipów**: 7 fragmentów ciągłego obrazu i 7 zdarzeń dźwiękowych, rozdzielonych na ruch, kontakt i akcent finału. Cięcia obrazu mają zgodne granice źródłowe, więc zachowują ciągłość. W Synkinema można zmieniać montaż i miks; zmianę samej choreografii/geometrii wykonuje się w `scene.html`, po czym renderuje źródło ponownie.

Tytuł publiczny: **This long piece actually fits**. Film opublikowano 14 września 2026 o 18:50:04 UTC (20:50:04 w Polsce). Konfigurację i przesłanie wykonano w YouTube Studio; właściciel ukończył utworzenie playlisty i publikację. Podłączony YouTube MCP, który obsługuje tylko odczyt, potwierdził status `public`, `processed`, HD oraz właściwy identyfikator kanału. Link i początkowy odczyt publicznych statystyk zapisano przy projekcie w Synkinema. YouTube raportuje długość `PT23S`; zweryfikowany lokalny obraz ma 22 sekundy. Plik `out/publication-copy.json` i zakładka Script zachowują wcześniejszy tekst roboczy — aktualne metadane publikacji są w `youtube-launch.json`.

## Kolejne pomysły — briefy, nie gotowe materiały

Poniższa lista zachowuje pierwotne kandydatury z 14 września. Nie jest obowiązkową kolejką produkcji. Każdy pomysł wymaga ponownej oceny według [GENERATION_RULES.md](GENERATION_RULES.md), gdzie znajdują się nowe kandydatury oraz preferowany test dźwigni. Nie produkuj kolejnego powolnego obrotu lub samego oddalania kamery na podstawie tej tabeli.

| Odcinek | Seria | Pytanie / rozwiązanie |
| --- | --- | --- |
| 002: The object inside the spiral | What is it? | Makro spiralnej krawędzi; trzy wskazówki odsłaniają metalową sprężynę. |
| 003: One sheet, one small box | Flat to form | Jeden arkusz składa się w pudełko; ciągłość materiału pozostaje widoczna. |
| 004: The last piece turns twice | Will it work? | Asymetryczny element potrzebuje obrotu w dwóch osiach, aby wejść w prowadnicę. |
| 005: A familiar shape, up close | What is it? | Makro ząbków i obrotu ujawnia mechanizm zamka błyskawicznego. |
| 006: A flat line becomes a chair | Flat to form | Jeden ciągły pasek zgina się w miniaturowe siedzisko; pokazujemy wszystkie zgięcia. |

Każdy wymaga osobnego sprawdzenia geometrii lub pozyskania pełnej, uprawnionej sekwencji. Nie traktować tych pomysłów jako odnalezionych klipów ani zapowiedzi wyników.

## Pliki i odtworzenie

- `scene.html`: oryginalna geometria, materiały, oświetlenie, kamera i ruch w Three.js.
- `render.mjs`: deterministyczny zapis 660 klatek do niemego źródła H.264.
- `create_assets.py`: oryginalny znak kanału i siedem plików WAV, 48 kHz stereo; stały seed.
- `produce.py`: utworzenie lokalnego kanału/projektu, import prywatnych mediów, próbna i zatwierdzona partia montażu, eksport i jego inspekcja.
- `finish.py`: zachowana korekta miksu z rewizji 2 do 3, weryfikacja, pakiet oraz recenzja wersji roboczej.
- `youtube_branding.py`: baner zgodny z istniejącym znakiem kanału oraz podgląd centralnego kadrowania.
- `youtube_mcp.py`: odczyt przez już skonfigurowany YouTube MCP bez ujawniania klucza; lista dozwolonych narzędzi nie obejmuje zapisu.
- `record_youtube_publication.py`: jednorazowy zapis już zweryfikowanej publikacji w Synkinema; nie przesyła filmu do YouTube i odmawia duplikowania wpisu.
- `assets/`: lokalne wygenerowane media, ignorowane przez Git; zostały także zaimportowane do Synkinema.
- `out/`: wynikowy MP4, dokładny snapshot projektu, metadane, provenance, kontrola klatek, dźwięku i weryfikacja; ignorowane przez Git.

Wykorzystano istniejące Python/Pillow/NumPy/HTTPX oraz Playwright z przykładu product-demo. Biblioteka Three.js 0.180.0 znajduje się w tymczasowym runtime; jej licencja jest zachowana w `THIRD_PARTY_NOTICES.txt`. Nie zmieniono zależności aplikacji ani kontraktu API.

```sh
npm install --prefix /private/tmp/turnwise-runtime --no-audit --no-fund three@0.180.0
.venv/bin/python examples/turnwise/create_assets.py
node examples/turnwise/render.mjs
.venv/bin/python examples/turnwise/produce.py create
.venv/bin/python examples/turnwise/produce.py status
.venv/bin/python examples/turnwise/produce.py inspect
```

`produce.py` zachowuje identyfikatory po kolejnych udanych krokach, nie zastępuje istniejącej osi czasu i nie ponawia automatycznie konfliktów. Nie usuwać `out/production.json`, aby kontynuować tę produkcję. `finish.py polish` jest jednorazową, kontrolowaną korektą dokładnie rewizji 2, nie poleceniem do wielokrotnego zwiększania głośności.

Wszystkie zmiany danych Synkinemy wykonano przez jej lokalne REST API, według opublikowanego kontraktu i z potwierdzonymi rewizjami. Nie edytowano bazy ani istniejących kanałów/projektów. Nie jest to nowy webowy klient aplikacji.

Najnowsza korekta pętli: uruchomienie około **200 ms** zastępuje jednosekundowy wstęp, gdy końcówka już pokazuje powrót na start. Oceniaj łączny postój na styku końca i początku. W odcinku 003 skrócono wyłącznie pierwsze 800 ms obrazu i audio; bieżący montaż trwa **9,2 s**.
