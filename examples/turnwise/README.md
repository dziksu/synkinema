# Turnwise

Kanał krótkich, zrozumiałych bez słów historii o przedmiotach, materiałach i mechanizmach. Obietnica: **jedna widoczna zagadka, rzeczywisty postęp, pełne rozwiązanie**.

- [Kanał w Synkinema](http://localhost:43817/#/channels/37e4721a1acb4d1d83764e400cbe4b1d)
- [Połączony projekt pierwszego odcinka](http://localhost:43817/#/projects/6f9896834bf24d88a48434c7472dda3e)
- Nazwa: **Turnwise**. Skojarzenie ze zmianą spojrzenia i sprytnym obrotem.
- Identyfikacja: ciepły mosiądz, porcelana, głęboki turkus; znak elementu przechodzącego przez pierścień.
- Opis publiczny: “Small mysteries. Clever transformations. Satisfying endings. Visual stories told without words — made to spark curiosity wherever you are. No talking. Just a closer look.”
- Trzy serie: **Will it work?**, **What is it?**, **Flat to form**.

Kompletny brief, reguły źródeł, montażu, dźwięku, metadanych, oceny i sześciotygodniowego eksperymentu są zapisane w kanale oraz w `channel.json`. Harmonogram pozostaje planem redakcyjnym: nie utworzono automatyzacji ani zaplanowanych publikacji. Nie utworzono kont YouTube/TikTok i nie sprawdzano dostępności nazwy na tych platformach.

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

Tytuł i opis do publikacji są zapisane w zakładce Script i `out/publication-copy.json`. Stan: gotowy lokalny draft do obejrzenia przez właściciela. Publikacja nie nastąpiła.

## Kolejne pomysły — briefy, nie gotowe materiały

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
