# AFTER HOURS — The Girl in His Phone

An original English relationship-drama reel in the style of a narrated Reddit
story. The story is fiction, not a retelling of a real Reddit post. A suspicious
message leads a bride-to-be to discover that her fiancé has been impersonating
her online. The apparent rival becomes her ally, and an engagement-ring receipt
provides the final, personal payoff.

The complete editable project lives in Synkinema:
[Open the project](http://localhost:8080/#/projects/2bacabe9710f43aaaaf739a53cafb796).
It has private source folders, separate narration sections, synchronized English
caption clips, story chapters, licensed background shots and an original score.

- Runtime: approximately **2 minutes 1 second**, below the requested five minutes.
- Delivery: **1080 × 1920, 30 FPS, H.264 CRF 18**, AAC stereo.
- Voice: local **Supertonic 3 F1**, English, 12 steps, speed 1.08.
- Audio target: −16 LUFS, maximum true peak −1.5 dBTP.
- Opening: immediate speech, followed by the first decision within four seconds.
- Ending: an opinion question about explaining the cancelled wedding to guests.
- Disclosure: “FICTIONAL STORY • AI-GENERATED VOICE” is visible throughout.
- Footage: real downloaded Mixkit stock, deliberately selected for soft nighttime
  atmosphere. Most sources are native portrait Full HD; the rainy glass source
  is a short crop from landscape footage. Bokeh is present in the originals.

## Production files

`story.json` is the approved script and chapter structure. `prepare.py` creates a
new private project, downloads the licensed clips and requests local speech from
Synkinema. `align_voice.py` uses cached offline Whisper timestamps while retaining
the exact authored caption text. `compose.py` imports the original synthesized
score, validates an atomic timeline batch, commits it using the confirmed revision
and enqueues a draft. It refuses to replace a nonempty composition.
`polish.py` applies the reviewed sentence boundaries and stable closing question
as a single revisioned transaction before enqueueing the high-quality final.
`collect_render.py` only monitors that existing job and downloads its completed
MP4; it never silently creates another render.

`assets/` holds the downloaded source videos and generated audio. `out/` holds
source-page license evidence, checksums, the import manifest, word alignments,
project snapshot, render jobs and review artifacts. Media and runtime manifests
are ignored by Git. No existing project, source or export is replaced.

For a fresh production, use a new output manifest/project. The existing manifest
is resumable for imports and voices; it must not be deleted casually because that
would create a second project. After composition, make explicit revisioned
operations for corrections rather than rerunning the initial composition.

The production commands were:

```sh
.venv/bin/python examples/relationship-drama-en/prepare.py
/tmp/synkinema-reel-asr/bin/python examples/relationship-drama-en/align_voice.py
.venv/bin/python examples/relationship-drama-en/compose.py
.venv/bin/python examples/relationship-drama-en/polish.py
.venv/bin/python examples/relationship-drama-en/collect_render.py
```

The optional ASR pass used an existing isolated `faster-whisper` runtime and an
already cached `tiny.en` model at `/tmp/synkinema-reel-asr-model`. Those temporary
paths must be adjusted on another machine; this production did not add application
dependencies or invoke a remote transcription service. Voice synthesis remains
Synkinema's explicitly selected local Supertonic provider.

See [CREDITS.md](CREDITS.md) for footage and voice licensing. The final encoded
file must be assessed by its completed render job, not the simplified editor or
640-pixel draft. Independent QA is recorded separately.

## Selected final export

- Project revision: **3**.
- Job: `c5b4166047784bc18f2c6806b8bc933b`.
- Local delivery: `out/the-girl-in-his-phone-final.mp4`.
- The closing question stays on screen for **8.7 seconds**.
- Final runtime metadata and completion state are stored in `out/final-job.json`;
  decoded codec/dimension/frame-rate metadata is in `out/final-ffprobe.json`.
