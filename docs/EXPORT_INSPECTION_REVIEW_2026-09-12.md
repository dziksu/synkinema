# Kontrola eksportów dla agentów i użytkowników — 12.09.2026

Poprzednią rundę UI/UX zapisano najpierw jako `03622b6` (`fix(studio): improve manual editing and asset workflows`). Ta runda uzupełnia kontrolę wyników montażu.

## Wykryte braki i poprawki

- Inspekcja obrazu wybierała render według rewizji; agent nie mógł wskazać konkretnego eksportu ani sprawdzić eksportu fragmentu tak jak analizy audio. MCP `render_frame` / `render_frames` i odpowiadające REST endpointy przyjmują teraz `job_id`. Ładują dokładny MP4 i jego historyczną rewizję. Niepoprawny job, cudzy projekt, nieukończony eksport lub brak pliku zwracają błąd bez zastępczego renderowania.
- Czasy klatek pozostają absolutne względem projektu. Zakres `[from_ms,to_ms)` jest walidowany przed ekstrakcją, a frame zwraca też `output_time_ms`. Domyślne punkty arkusza są ograniczone do eksportu, z jego środkiem jako rozwiązaniem, gdy żaden punkt nie pasuje.
- Żądanie ostatniej milisekundy filmu wcześniej mogło zwrócić nieistniejący PNG. Ekstrakcja wybiera teraz klatkę obejmującą żądany czas oraz sprawdza powstanie pliku.
- Arkusze różnych plików tej samej rewizji mają osobne adresy cache zależne od rzeczywistego medium.
- Mapa audio pomijała w `active_tracks` krótkie SFX leżące pomiędzy początkami okien. Teraz etykiety obejmują wszystkie klipy nachodzące na okno, z pominięciem wyciszonych ścieżek. `duration_ms` opisuje długość okna. To informacja o obecności klipu, nie pomiar słyszalności pojedynczej ścieżki.
- Przy gotowym eksporcie w UI dodano **Sprawdź klatki**, dialog z rewizją i zakresem, stan ładowania, obsługę błędu i ponowienie oraz pobranie arkusza. Zamknięcie i ponowne otwarcie wykorzystuje już pobrany wynik.
- Zaktualizowano przewodnik agentów, opisy MCP, OpenAPI i dokumentację REST z przykładem zakresu 12–15 s.

## Weryfikacja

- Frontend: **31 testów PASS**, TypeScript i produkcyjny build Vite PASS.
- Backend: pełny zestaw **41 testów PASS**; po dodatkowym teście ostatniej milisekundy i poprawce seek ponownie **14 testów inspekcji i rzeczywistych efektów FFmpeg PASS**. Ruff PASS. Pozostałe ostrzeżenia dotyczą deprecjacji zależności TestClient.
- Nowe testy REST używają prawdziwego MP4 o czerwonej i niebieskiej połowie. Potwierdzają przeliczenie czasu, granice zakresu, pierwszeństwo rewizji joba, filtrację/fallback arkusza, limit 24 klatek, odrzucenie cudzego i niegotowego joba, brak pliku oraz SFX 100 ms wewnątrz okna 500 ms.
- Docker build i uruchomienie z istniejącym wolumenem: PASS, kontener healthy.
- Rzeczywiste MCP Streamable HTTP: oba schematy zawierają job_id; `render_frame(time_ms=5999,job_id=05d92ca38a354e6f806abc4cf75688da)` zwrócił PNG ImageContent, `render_frames` zwrócił JPEG ImageContent z punktami 1500 i 4500 ms. Oba wskazały rewizję 33 i zakres 0–6000 ms.
- UI w przeglądarce: projekt `Review UX • montaż od zera` → Eksporty → Sprawdź klatki → obejrzenie arkusza → zamknięcie. Oba napisy polskie są widoczne. Sprawdzono desktop 1280×720 i telefon 390×844; przyciski oraz dialog mieszczą się w szerokości, przewijanie dialogu na desktopie umożliwia dostęp do pobrania. Konsola bez błędów. Przywrócono standardowy viewport.

Projekt i istniejące filmy zachowano. Nie uruchamiano płatnych usług. Inspekcja pojedynczych klatek/arkusza nie zastępuje obejrzenia pełnego ruchu i odsłuchania MP4.
