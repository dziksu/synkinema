# Test agenta montującego wyłącznie przez MCP

Zlecenie: nowa popularna gra indie na Steam, krótki film promocyjny po polsku, hook 0–3 s, dalsze sceny z napisami, format pionowy.

## Podział pracy

Agent nadrzędny wybiera grę na podstawie oficjalnych źródeł, pobiera zwiastun ze Steama i importuje go do biblioteki. Wybrano Wanderburg. Agent montażysta dostaje asset ID i zweryfikowane fakty; sam odczytuje instrukcję MCP, ogląda klatki, układa projekt, dodaje polskie napisy i audio, sprawdza oraz renderuje film.

Sesja nie ma bezpośrednio zamontowanych narzędzi Synkinema. Montażysta wywołuje zatem stały adapter `scripts/mcp_agent_transport.py`, który łączy się wyłącznie z `http://127.0.0.1:8080/mcp/` przez klienta MCP Streamable HTTP. Nie ma w nim wywołań REST, pobierania URL, edycji dokumentów projektu ani FFmpeg. Pomniejszane są jedynie obrazy kontrolne otrzymane jako MCP ImageContent, żeby agent mógł je obejrzeć. Każde wywołanie jest rejestrowane w `out/mcp-agent-audit.jsonl`.

Agent ma zakaz używania innych poleceń, odczytu/edycji plików, REST, CLI edytora i przeglądarki. To ograniczenie instrukcji agenta i stałego adaptera; środowisko współpracy nie udostępnia osobnego systemowego przełącznika odcinającego mu odziedziczone narzędzia. Agent nadrzędny może później pobrać gotowy eksport i wykonać niezależną kontrolę FFmpeg, bez zmieniania montażu.

## Kryteria odbioru

- nowy projekt; istniejące projekty nie są edytowane;
- 1080×1920, 30 FPS, około 24–30 s;
- mocny obraz i polski hook od początku, w oknie 0–3 s;
- polskie napisy opowiadają mechaniki w krótkich, czytelnych porcjach;
- szybkie zmiany obrazu, bez początkowego czarnego ekranu;
- bez angielskich plansz reklamowych/daty premiery ze źródła;
- muzyka/audio ze źródła i zmierzona głośność finalnego eksportu;
- końcowe CTA po polsku, nazwa WANDERBURG i informacja o wczesnym dostępie;
- preflight, prawdziwe klatki z MCP, finalny job completed, analiza konkretnego joba;
- zachowany projekt, MP4, SRT i rejestr wywołań MCP.

Źródła oraz atrybucja: [CREDITS.md](CREDITS.md). Test nie publikuje filmu na Steamie ani w mediach społecznościowych.
