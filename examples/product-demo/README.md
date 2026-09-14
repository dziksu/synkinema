# Synkinema — pierwsza prezentacja produktu

Pierwsza, długa prezentacja produktu po polsku: 15 rozdziałów i około 3 minuty 19 sekund. `storyboard.json` jest scenariuszem. `record.mjs` nagrywa rzeczywiste Studio przez Playwright. `produce.py` tworzy osobny projekt Synkinema, zapisuje scenariusz i sceny, generuje lokalnego lektora oraz muzykę, a następnie układa edytowalny montaż i uruchamia eksport w Synkinema.

Nagranie pokazuje istniejący projekt **wyłącznie do odczytu**. Wszystkie nowe media i zmiany montażowe trafiają do osobnego projektu prezentacji. `out/` zawiera lokalne ujęcie, zrzuty, stan produkcji i gotowy plik; katalog jest ignorowany przez Git.

Domyślne selektory klipów w `record.mjs` pasują do projektu „SpawnBrief — 3 unusual mechanics in new games”. Dla innego projektu ustaw także `SYNKINEMA_VIDEO_CLIP_BUTTON` i `SYNKINEMA_CAPTION_CLIP_BUTTON` na nazwy przycisków odpowiednich klipów; opcjonalnie `SYNKINEMA_SOURCE_PROJECT_NAME` pozwoli poczekać na widoczną nazwę projektu.

## Przygotowanie i ponowne nagranie

Wymagane są działające Studio, Chrome, Node.js, Python z zależnościami repozytorium oraz lokalnie zainstalowany Supertonic 3. Domyślny adres to `http://127.0.0.1:43817`; można go zmienić przez `SYNKINEMA_ORIGIN`. Podaj ID istniejącego projektu, który wolno pokazać:

```sh
npm --prefix examples/product-demo ci
SYNKINEMA_SOURCE_PROJECT_ID=<id> npm --prefix examples/product-demo run record
```

Przed nową produkcją użyj nowego katalogu przez `SYNKINEMA_DEMO_OUT`, aby nie nadpisać materiałów poprzedniej wersji. Z katalogu głównego repozytorium:

```sh
./.venv/bin/python examples/product-demo/produce.py prepare
./.venv/bin/python examples/product-demo/produce.py start-score
./.venv/bin/python examples/product-demo/produce.py upload
./.venv/bin/python examples/product-demo/produce.py status
./.venv/bin/python examples/product-demo/produce.py compose
./.venv/bin/python examples/product-demo/produce.py render
./.venv/bin/python examples/product-demo/produce.py render-status
./.venv/bin/python examples/product-demo/produce.py verify
./.venv/bin/python examples/product-demo/produce.py verification-status
./.venv/bin/python examples/product-demo/produce.py download
```

`compose` wymaga ukończenia generowania lektora i muzyki. Zapisuje całą oś czasu w jednej transakcji z kontrolą rewizji, po wcześniejszym przebiegu próbnym. `render` sprawdza projekt i układ napisów przed uruchomieniem eksportu. `verify` jest uruchamiane po zakończeniu renderu i kontroluje dekodowanie, dźwięk oraz rozpoznanie polskiej narracji. `download` zapisuje MP4 w `out/`. Stan w `out/production.json` zapobiega przypadkowemu powtórzeniu tworzenia projektu, importu i renderu.

Jest to lokalna wersja robocza. Przed publiczną publikacją trzeba sprawdzić prawa do materiałów widocznych w przykładowym projekcie i oznaczyć lektora generowanego przez AI; informacja o nim znajduje się także na planszy końcowej.
