# Gotowa biblioteka krótkich efektów dźwiękowych

15 wybranych nagrań Kenney CC0 jest zaimportowanych do wspólnej biblioteki Synkinema. Są dostępne we wszystkich projektach. To gotowe dźwięki z paczek [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Impact Sounds](https://kenney.nl/assets/impact-sounds) i [RPG Audio](https://kenney.nl/assets/rpg-audio). Kopie licencji znajdują się obok tego pliku. Katalog obejmuje przejścia/świsty, zaskoczenie, uderzenia, klik i potwierdzenie CTA.

## Ręczny montaż

1. W Bibliotece wyszukaj `sfx`, `przejście`, `zaskoczenie`, `uderzenie`, `CTA` lub `Kenney`. Każde nagranie ma odsłuch i edytowalne tagi.
2. W widoku Montaż wyszukaj te same tagi w Materiałach projektu i wybierz filtr Audio. Dodaj ścieżkę typu Dźwięk, jeśli jej nie ma.
3. Przeciągnij kartę materiału na ścieżkę dźwięku w wybranym miejscu. Dopasuj początek do ruchu albo cięcia. Ustaw gain i krótkie fade. Osobną ścieżkę można wyciszyć, aby porównać miks.
4. Odsłuchaj render: większość źródeł ma szczyty blisko 0 dBFS. W przykładowym shortcie ustawiono −8…−12 dB gain. Właściwy poziom zależy od podkładu.

## Agent przez MCP

`search_assets(q="sfx", kind="audio")` zwraca 15 gotowych pozycji; `search_assets(q="whoosh", kind="audio")` zwraca dwa świsty. Wyszukiwanie działa po nazwie i tagach, jako pojedynczy podciąg, nie wyrażenie logiczne. Odczytaj zwrócone `id`, `duration_ms`, `source`, `license`, `has_audio`; identyfikatory są zależne od instancji serwera.

Dodaj `sound` przez `add_track`, a następnie `add_clip` z asset_id, start_ms, duration_ms, gain_db, fade_in_ms i fade_out_ms. Start jest czasem osi projektu; source_in_ms określa pozycję w nagraniu. Dla bardzo krótkich dźwięków pilnuj minimum klipu 100 ms. Glitch ma oryginalnie 20 ms — wersja katalogowa dostała ogonek ciszy do 120 ms, bez modyfikacji samego efektu. Pierwotny import oznaczony `source-only` nie należy do zestawu `sfx`.

Po montażu wywołaj `validate_project`, `start_render`, `get_render_progress` i `analyze_audio` z job_id. Poziom pojedynczego pliku nie gwarantuje braku przesterowania po zmiksowaniu. `tag_asset` zastępuje całą listę tagów; nie dopisuje jej automatycznie.

## Ponowne przygotowanie biblioteki

Z katalogu głównego, przy uruchomionym serwerze:

```sh
.venv/bin/python scripts/import_sfx_library.py --server http://localhost:8080
```

Skrypt pobiera trzy oficjalne archiwa, wybiera pliki z `catalog.json`, zachowuje licencje, przygotowuje krótki glitch i importuje metadane. `manifest.json` zawiera sumy SHA-256 i rzeczywiste ID zwrócone przez serwer. Identyczne pliki są deduplikowane; powtórny import nie nadpisuje istniejących tagów. Pliki audio i ZIP są lokalnymi artefaktami pomijanymi w Git.
