# NEXT UP — 3 horrors you shouldn't play alone

A **43-second English editorial Reel**, 1080 × 1920, 30 fps, H.264 CRF 18.
It extends the 27-second Steam breakout reference by **16 seconds** and gives
each game 11.5–12 seconds for role, mechanics, threats and actual gameplay.

[Open the editable project](http://localhost:8080/#/projects/a5906a4f5245418d98fe3c81b9420576).
The final MP4 is retained locally at `out/next-up-horror-final.mp4` and in the
project's **Exports** tab. The delivered project snapshot is `out/project.json`.

## Script and pacing

| Time | Beat | Narration |
| --- | --- | --- |
| 0–3 s | Fast threat montage and hook | Three new horrors. Don't play these alone. |
| 3–14.5 s | #3 the cabin game | In The Cabin Game, you and your friends are trapped inside a cabin. Play cards to find the exit, while your choices reshape the rooms and unleash monsters. |
| 14.5–26.5 s | #2 Ashes of the Damned: The Forgotten Ward | In The Forgotten Ward, you wake up in an abandoned psychiatric ward with no memory. Search patient files, solve puzzles, and flee the things stalking you. You cannot fight back. |
| 26.5–38 s | #1 Halloween: The Game | In Halloween, you become Michael Myers, or a Haddonfield defender. Stalk your victims, or grab household weapons and rescue families before the killer finds you. |
| 38–43 s | Three gameplay choices and a question | Which one would make you quit first? Tell me in the comments. |

The scare theme does not imply all three games support multiplayer. The film
labels the cabin game **1–4 players / Early Access**, The Forgotten Ward
**single-player**, and Halloween **multiplayer + solo**. The order is an editorial
selection, not a sales or review ranking. No claim of guaranteed popularity is made.

## Edit and audio

- Nine editable tracks: softened background, gameplay window, game names/modes,
  series identity, mechanic labels, phrase captions, AI disclosure, narrator, score.
- Gameplay occupies 40% of the vertical frame, over a subdued source background.
  Main cuts last approximately four seconds. The Ward has modest brightness
  correction; the other hero footage retains its source grading.
- Narration: **Supertonic 3**, English M2, 12 steps, speed 1.08, generated locally.
  Audio takes use native timeline speed, with no fade that obscures initial words.
  The spoken hook finishes within 3 seconds. “AI-GENERATED VOICE” is visible.
- Captions retain the authored script and align to the actual generated speech
  with offline Whisper tiny.en. The raw ASR and aligned words are in
  `out/voice-alignment.json`; game-name spellings come from the authored text.
- Original procedural 96 BPM low pulse and transition accents, seed 120920263;
  no external melody, samples or trailer soundtrack. Music ducks under narration.
- Private folders separate official trailers, English narration and original score.
  Alternate voice takes and the unused Halloween launch trailer remain clearly
  named in project media, while the final edit uses its multiplayer gameplay overview.
- Output profile: 1080 × 1920, 30 fps, CRF18, target −16 LUFS, true-peak −1.5 dBTP.
  The final decoded file must be measured, rather than assuming targets were met.

## Reproduction

Prerequisites: the local Synkinema API at port 8080, configured local Supertonic,
FFmpeg/ffprobe, the repository Python environment (httpx/numpy/soundfile), and the
existing offline faster-whisper environment/model. The scripts do not install
packages, rebuild the app, or change existing projects.

From the repository root:

```sh
.venv/bin/python examples/steam-horror-en/download.py
.venv/bin/python examples/steam-horror-en/prepare.py
/tmp/synkinema-reel-asr/bin/python examples/steam-horror-en/align_voice.py
.venv/bin/python examples/steam-horror-en/compose.py
.venv/bin/python examples/steam-horror-en/collect_render.py --quality preview
# Review the actual preview before applying the recorded polish and final export.
.venv/bin/python examples/steam-horror-en/polish.py
.venv/bin/python examples/steam-horror-en/collect_render.py --quality final
```

`download.py` pins original Steam movie IDs and retains API metadata, selected
1080p HLS URLs, decoded source metadata and SHA-256 hashes. `prepare.py` creates
one new private project and imports media. `compose.py` refuses to overwrite an
existing timeline; it validates a dry-run, commits atomically, runs preflight and
starts one preview. `polish.py` is explicitly revision 2-specific and starts one
final job. Its current version includes the final source-range correction for a
fresh reproduction, so no second final export is needed. `revise_closing.py`
records the delivered project's historical revision 3→4 correction: only the last
gameplay clip and its matching ambient switch from source 52s (a trailer card)
to a checked 20–21.667s shot of Michael Myers. It must only be run against the
original revision 3. Narration, captions, all timing and output settings remain
identical; the reviewed revision 3 export is archived as
`out/next-up-horror-final-r3-review.mp4`. `collect_render.py` observes an existing
job without enqueueing more.
Working assets and outputs are intentionally ignored in Git.

Source ownership, facts checked on 12 September 2026 and suggested publication text
are recorded in [CREDITS.md](CREDITS.md). The result is local and has not been posted
on a social platform. Independent final checks are recorded in [QA.md](QA.md).
