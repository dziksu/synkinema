# WANDERBURG — short po polsku przez MCP

Lokalny test montażu reklamowego z oficjalnego zwiastuna świeżej gry indie na Steam.

- Format: pionowy 1080×1920, 30 kl./s, 26 s.
- Hook 0–3 s: **TEN ZAMEK ZJADA WIOSKI.**
- Dalej: ruchomy zamek, pochłanianie, moduły, oblężenie i roguelike.
- CTA 23–26 s: **WANDERBURG — SPRAWDŹ NA STEAM — Wczesny dostęp**.
- Polskie napisy są w obrazie oraz w osobnym SRT.

Pliki wynikowe: `out/final/wanderburg-short-pl.mp4`, `out/final/wanderburg-short-pl.srt`, `out/final/project.json`, contact sheet i pomiar audio. Źródłowe wideo znajduje się w `assets/wanderburg-official-trailer.mp4`. Materiały binarne i eksporty są ignorowane przez Git.

[Protokół testu MCP](TEST_PROTOCOL.md) opisuje podział pracy i ograniczenia agenta. [Źródła i atrybucja](CREDITS.md) wskazują grę, twórców oraz zwiastun. Rejestr wywołań klienta MCP: `out/mcp-agent-audit.jsonl`.

Inspekcja rzeczywistych klatek doprowadziła do poprawek kadrowania, usunięcia angielskich plansz z materiału źródłowego i powiększenia CTA. Niezależna kontrola wychwyciła dodatkowo niewielki angielski szyld świata gry; został usunięty z kadru przez tego samego agenta, wyłącznie przez MCP.


## Wynik końcowy

- Projekt `814ab2d68a204995b986728afcb7c52d`, rewizja **7**.
- Finalny job `c61959b0a7c44ffd8fc92f9fdda1b5cd`: **completed**.
- 26 s, 1080×1920, 30 FPS, H.264/AAC, 10 segmentów napisów pokrywających 0–26 s.
- Pełne dekodowanie **780 klatek** bez błędów. Obejrzano 14 rzeczywistych klatek finalnego filmu; agent sprawdził dodatkowo siedem klatek poprawionego ujęcia.
- Audio: **−14,11 LUFS, −2,21 dBTP**. Niewielkie przekroczenie ustawionego celu −2,5 dBTP po kodowaniu AAC pozostaje odnotowane w raporcie; wynik zachowuje zapas do 0 dBTP i spełnia przyjęty limit końcowy ≤−1,5 dBTP.
- Rejestr adaptera: 53 zakończone wywołania MCP, 0 błędów narzędzi (pierwszy get_capabilities był kontrolą adaptera przez agenta nadrzędnego).
- Agent przy niepełnej odpowiedzi adaptera odczytał aktualny stan projektu zamiast ponawiać mutację.
- SHA-256 finalnego MP4: `1cb5b77bbfe3c6aca8e0b8b261ebca27540fb89bac8baef4cad456b54c5c3f84`.

Film nie został opublikowany. Projekt pozostaje dostępny do dalszego ręcznego montażu w Synkinema pod nazwą **WANDERBURG • Zamek na kołach • Short PL**.
