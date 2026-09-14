# Montaż ręczny

Otwórz projekt w zakładce **Montaż**. Importuj własne pliki przyciskiem **+** przy bibliotece albo upuść je w oknie aplikacji.

- **Biblioteka → ścieżka:** przeciągnij miniaturę w wybrane miejsce. Kolor podpowiada zgodność materiału ze ścieżką; prostokąt pokazuje położenie i długość. Kliknięcie miniatury dodaje materiał na końcu głównej ścieżki odpowiedniego rodzaju.
- **Wideo bez dźwięku:** ścieżki obrazu odtwarzają obraz. Aby użyć audio z filmu, przeciągnij istniejący klip wideo na ścieżkę audio albo wybierz **Dodaj dźwięk wideo**. Powstaje osobny klip audio z zachowaniem początku, przycięcia i prędkości. Od tego momentu oba klipy edytujesz niezależnie. Niemy materiał nie trafi na ścieżkę audio.
- **Przenoszenie:** przeciągnij środek klipu. Możesz zmieniać czas oraz przenosić obraz między główną ścieżką i warstwami obrazu, a audio między ścieżkami dźwiękowymi. Każda ścieżka automatycznie wybiera wolne miejsce bez nakładania klipów. Przeniesienie odłącza przejścia powiązane ze zmienianym miejscem.
- **Przycinanie:** przeciągnij lewą lub prawą krawędź. Lewa zmienia też początek używanego fragmentu źródła. Prawa nie wykracza poza dostępny materiał. W inspektorze można podać dokładny początek, długość i start źródła. Animacje dopasowują czas do przyciętego klipu.
- **Przyciąganie:** działa do krawędzi klipów i kursora. Przycisk z magnesem przełącza je; **Alt** chwilowo wyłącza. **Esc** anuluje przeciąganie. Strzałki na zaznaczonym klipie przesuwają go o klatkę; **Shift + strzałka** o sekundę.
- **Kursor i dzielenie:** przeciągnij linijkę czasu. Zaznacz klip, ustaw kursor wewnątrz i wybierz nożyczki. Po obu stronach musi zostać minimum 0,1 s. Przed dzieleniem klipu z animacją wyłącz animację; można ją dodać osobno do obu części.
- **Przejścia:** wybierz kolejne ujęcie na głównej ścieżce i ustaw typ oraz czas przejścia. Aplikacja wyrównuje ujęcia i przesuwa kolejne rozpoczynające się klipy, napisy oraz audio razem. Pierwszy klip nie ma przejścia z poprzednikiem.
- **Ścieżki:** przyciskiem **+ Ścieżka** dodaj obraz nałożony, tekst lub audio. Uchwyt z kropkami przy nazwie pozwala przeciągnąć ścieżkę nad inną. Kosz usuwa pustą dodatkową ścieżkę. Ikona oka ukrywa obraz lub napisy; ikona głośnika wycisza audio. Obraz i dźwięk mają niezależne przełączniki.
- **Układ:** przeciągnij górną krawędź timeline, aby zmienić jego wysokość. Oś przewija się w obu kierunkach. Przyciski lupy zmieniają skalę czasu.
- **Korekty:** **Duplikuj**, **Usuń klip** lub **Delete/Backspace**. Cofanie: **Cmd/Ctrl+Z**; ponawianie: **Cmd/Ctrl+Shift+Z**. Stos cofania obejmuje bieżącą sesję edycji; starsze rewizje znajdziesz w **Historii**. Skróty montażowe nie przechwytują pisania w formularzach.
- **Zapis i eksport:** zmiany zapisują się kolejno lokalnie. Nie pomijają szybkich edycji. Po konflikcie zapisu już oczekujące zależne zmiany są anulowane; odczytaj komunikat i powtórz zmianę. Wybierz **Eksportuj → Finalny film** i pobierz MP4.

Podgląd montażu pozostaje uproszczony. Finalne przejścia, efekty i miks ocenisz na wyrenderowanym filmie lub przez inspekcję klatek.

Przykładowe materiały i atrybucja: [Big Buck Bunny](../examples/editor-qa/CREDITS.md).

## Wybór fragmentu przed dodaniem na timeline

1. W materiałach wybierz **Wybierz fragment** pod filmem albo plikiem audio. Otwiera się poszerzony podgląd źródła, a timeline nadal przyjmuje przeciągane materiały.
2. Przewiń źródło suwakiem. Ustaw **Wejście / Wyjście** przyciskami, skrótami **I / O** w panelu lub wpisując sekundy. Strzałki w aktywnym podglądzie przesuwają pozycję o krok wynikający z FPS projektu. Zaznaczenie musi mieć co najmniej 0,1 s.
3. **Odtwórz fragment** zaczyna od wejścia i zatrzymuje się na wyjściu. **Cały plik** resetuje zaznaczenie. Czas panelu jest czasem źródła, a nie projektu.
4. Wybierz **Sam obraz**, **Sam dźwięk** albo **Obraz i dźwięk**. Niedostępne strumienie nie są oferowane. Możesz wybrać osobną ścieżkę audio lub utworzyć ją razem z wstawieniem.
5. Użyj **Wstaw przy kursorze**, **Dodaj na końcu ścieżki** albo przeciągnij **Przeciągnij fragment** na odpowiednią ścieżkę. DnD ma podgląd długości zaznaczenia oraz przyciąganie. Na zajętej ścieżce fragment trafia do pierwszego wolnego miejsca za żądaną pozycją; istniejące klipy nie są nadpisywane. Przy obrazie z dźwiękiem oba klipy zajmują wspólny wolny przedział. Równoczesne materiały wymagają osobnych ścieżek.
6. Wstawienie obrazu z audio zapisuje się atomowo: jedno **Cofnij** usuwa oba klipy i ewentualnie nową ścieżkę, **Ponów** przywraca komplet. Po wstawieniu są to osobne klipy — późniejsze przesuwanie/przycinanie nie jest jeszcze połączone.

Na wąskim ekranie panel źródła jest przewijany pionowo; przyciski wstawiania są alternatywą dla przeciągania. Powrót do biblioteki lub zmiana projektu zamyka podgląd i resetuje zaznaczenie źródła. Przeglądarka musi umieć odtworzyć materiał, aby wybrać go wizualnie; komunikat błędu blokuje wstawianie w tym panelu.

### Canvas, captions and media collections (desktop)

- Click a visible layer in the canvas to select it; drag to move it. Corner handles resize with locked proportions; Shift allows independent width/height. Alt disables center/edge snapping. Escape cancels the drag. Arrow keys nudge selected layers; Shift increases the step. Each completed drag is one undoable edit.
- Portions outside the output frame stay visible and dimmed in the preview workspace. You can grab those portions and their corner handles. Use **Preview zoom → 75%, 50% or 25%** to reach distant handles, and **Fit** to fill the available panel again. Zoom changes only the workspace view. The frame automatically refits when expanding/closing the preview, resizing a panel or resizing the desktop window; exports contain only the output frame.
- **Canvas position & size** exposes center X/Y and width/height in percentages, plus Full frame, Picture in picture and four half-frame presets. **Crop anchor X/Y** and zoom adjust the image inside that box.
- **Elements** adds a rectangle, ellipse or line on an overlay track. Set color, position, size, rotation, fades and opacity in the inspector. For logos or video overlays, open a media card's **Organize & insert → Add as overlay**, or drag its thumbnail to the canvas.
- **Caption / Add caption** opens four style choices. The selected clip's inspector can change the style later. Text X/Y, size, heading, subtitle and accent remain editable. Preview and export use the same text rasterizer.
- The media panel has **Project media** and **Library** tabs. Project uploads stay in that collection. Shared assets used on the timeline also appear in project media. **Add to project media** keeps an unused asset with the project; **Share to library** makes a private asset reusable elsewhere.
- Browse named folders, create or rename them, and drag a thumbnail onto a folder to move its membership. The **Move to folder** select offers the same action without dragging. Folder organization preserves source files and timeline clips.


### Preview drops and independent layers

- Click empty preview or timeline background to clear clip selection. Clicking a visible element selects it; inspector controls preserve selection.
- On desktop, source selection stays beside the timeline preview so both remain accessible. Drag media or a source range onto the preview to insert at the **current playhead frame**. The editor reuses an unmuted track of the same kind only when the whole clip fits; otherwise it creates a new track. Canvas drops keep their start and never append past a collision.
- Visual drops create `Elements` overlay layers; tagged SFX use `Sound effects`, tagged voice uses `Voiceover`, other audio uses `Music`. A source range with **Video + audio** creates aligned visual/audio clips and respects its source trim. Whole video/audio retains its full duration; images and shapes start at 4 seconds.
- The **Elements** palette stays beside the preview. Click a shape to insert it at the playhead or drag it to its desired canvas position. Repeat to stack multiple simultaneous layers. **Add caption** likewise reuses a free caption track or creates another one.
- No ordinary clips overlap on any single track. Drag/trim and inspector timing respect neighboring clips even with snapping off. Intentional primary-video transitions remain supported; a transition ripple that collides on another track is rejected. Move simultaneous audio/captions onto separate tracks first.
- Each preview insertion is one optimistic, atomic edit and one undo step, including any new tracks. At the 32-track limit an unavailable slot shows an error without overwriting content. Preflight warns about preserved overlaps in older projects; move those clips onto separate tracks to repair them.

## Output formats

Use Export to choose delivery resolution and aspect independently of the canvas,
including 720p, Full HD, QHD and UHD 4K. Fit preserves all layers with bars; Fill
crops all layers, including text. Use the alignment guide and Check framing before
final export. New story also offers the full preset catalog. See
[output formats and quality](EXPORT_FORMATS.md).
