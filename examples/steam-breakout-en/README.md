# NEXT UP — 3 Steam breakout picks

An English 27-second editorial Reel/Short made in Synkinema, 1080 × 1920 at 30 fps.
All gameplay cuts, captions, labels, local TTS narration, music and accents remain
editable in the project. Ranking represents an editorial choice of recent releases
with breakout potential, not a sales chart or a promise of future popularity.

Open the [editable project](http://localhost:8080/#/projects/21f98d7acf244fb6b3f1c83fafe19159)
and select **Exports** to play the finished film. The MP4 is also retained at
`out/next-up-steam-final.mp4`. See [QA.md](QA.md) for final export measurements.

## Script and pacing

| Time | Story beat | Narration |
|---|---|---|
| 0–3 s | Three rapid gameplay flashes; “WHAT TO PLAY NEXT?” | Still wondering what to play? Check out these games. |
| 3–9 s | #3 Allumeria; exploration, building, boss fight | In Allumeria, you and your friends explore a blocky world. Build your own base, and take on bosses together. |
| 9–15.5 s | #2 WheelMates; tiny cars and cooperative puzzles | In WheelMates, you and a friend become tiny RC cars. Solve puzzles together, in a scientist's oversized house. |
| 15.5–22.5 s | #1 Wanderburg; fortress growth and combat | In Wanderburg, you command a castle on wheels. Devour villages, stack ridiculous weapons, and become a rolling nightmare. |
| 22.5–27 s | Three moving game strips; viewer choice | Three new Steam games I think could blow up. Which one wins? Tell me in the comments. |

Why these three: distinct mechanics that are easy to show in a short clip, recent
releases, and formats suited to repeat play or sharing with friends. Allumeria and
WheelMates support online co-op; Wanderburg is single-player. The choice is not
presented as an objective quality ranking. Store review snapshots were mixed:
Allumeria 92% positive (~398 reviews), WheelMates 75% (~444), Wanderburg 78% (~1,021).
These changing figures were used only as context and are omitted from the video.

## Production

- Sources: official Steam trailer footage; game-specific crops and an animated
  landscape window over a subdued moving background.
- Voice: local Supertonic 3, English (`en`), M2, 12 steps. Original takes use
  generate speed 1.16 and timeline speed 0.88. The revised opening sentence and
  comment CTA use generate speed 1.0, timeline speeds 1.0 / 1.05, and at least
  130 ms of source padding before and after audible speech. Original and revised
  takes remain in project media.
- Captions: editable short phrase groups timed against each separate TTS take.
  Timing is authored, not an ASR/forced-alignment result. Final editorial review
  should include a human listening pass for game-name pronunciation.
- Music: original procedural 124 BPM instrumental with no third-party samples;
  music ducking under narration. Accents: reusable Kenney CC0 library sounds.
- On-screen disclosure: “AI-GENERATED VOICE • EDITORIAL PICKS”. No paid speech or
  external voice-generation service was used.
- Private folders: Official trailers, English voiceover, Music and accents.
- `prepare.py` imports sources and creates takes through the REST API.
  `compose.py` initializes an empty project's timeline with a dry-run and atomic
  batch. It deliberately refuses to overwrite an existing composition.
  `revise_copy.py` applies the two reviewed copy changes to revision 4 with an
  atomic batch, retaining the previous export and project snapshot.
  `verify_render.py` checks a completed server job and its actual media.
- The delivered project JSON is the canonical final edit. Source metadata and
  working/render artifacts are retained under ignored `assets/` and `out/` paths.

See [CREDITS.md](CREDITS.md) for source ownership, release-date verification and
suggested publication text. This project has been created locally; it has not been
posted to a social platform.
