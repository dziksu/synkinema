# Independent final review — 2026-09-12

Delivered project `a5906a4f5245418d98fe3c81b9420576`, revision **4**, final job
`91d81959177f4c3c93bd955237fbfa38`. The parent agent performed this review
separately from the production agent.

## Encoded delivery

- **43.000 seconds**, 16 seconds longer than the 27-second reference.
- **1080 × 1920**, **30 FPS**, H.264/yuv420p, final CRF 18.
- AAC stereo, 48 kHz; **22,264,720 bytes**.
- Full FFmpeg video/audio decode: exit code 0, no errors.
- SHA-256: `d14b55faadc5107745721bc58faeb8139fa7fe58510e5cee77cb454692539072`.

The final file is `out/next-up-horror-final.mp4`, also available through the
project's Exports tab. All measurements below concern the actual encoded file,
with API inspections pinned to its job and revision.

## Narration and audio

Independent offline Whisper transcription, without a script prompt, retained
the complete opening, all three game descriptions and the closing question.
The hook finishes before three seconds. The minor recognition homophone
“stock” for “stalk” does not appear in the authored captions.

Transcription was performed on the first final review, revision 3. The delivered
revision 4 has **identical decoded audio**, verified by SHA-256:
`d8eec61a37e2a78e1cafdf19dfb373301984751eb7e71924adb7107305c70021`.
Every voice clip retains at least 300 ms after its aligned final spoken word.

A fresh inspection of the delivered revision 4 measured **−16.84 LUFS**,
**−1.74 dBTP** and **5.5 LU** loudness range, with no audio warnings.
The local AI narrator is disclosed on screen; the score uses original generated
audio without the downloaded trailers' soundtracks.

## Composition and corrections

The nine tracks contain 76 editable clips, without overlaps on an individual
track. There are 29 spoken caption phrases. All **43 text clips** were checked
against their actual raster foreground bounds: no offscreen text or simultaneous
text collisions. Revision 4 leaves those text clips unchanged.

The three game sections last 11.5, 12 and 11.5 seconds. Their gameplay windows
occupy 40% of the vertical canvas, with approximately four-second main cuts.
The game labels distinguish 1–4-player Early Access, single-player, and
multiplayer plus a separate solo mode. Release status and role/mechanic claims
were independently compared with official Steam information; fresh API
snapshots resolve a stale cached release notice for The Forgotten Ward.
See [CREDITS.md](CREDITS.md) for sources and ownership.

The first draft review led to clearer monster shots, more space above the
gameplay window and a two-line closing question. Final review then caught a
trailer title card in the last Halloween excerpt. Only that excerpt and its
matching background changed for revision 4, from source 52 s to 20 s.
Profile, scenes, script, audio and all other clips remained identical.

Twelve frames from the delivered job were inspected at 0.5, 3.3, 12.8, 18,
25.5, 28.8, 36.5, 38.4, 41.4, 41.8, 42.3 and 42.9 seconds. The closing samples
all show Michael Myers, with a clear question and invitation to comment.
The 15 source-upscale notices apply only to the full-frame atmosphere/opening
track; none applies to the main gameplay windows. The softened background
is intentional, not a claim of additional source detail.

Raw evidence is retained in ignored `out/independent-*` files, with the prior
review in `out/r3-independent-review/` and the archived revision 3 export.

## Studio playback

The delivered revision 4 MP4 was selected using **Play export** and played
continuously from the beginning to the end in Studio. The browser confirmed
the correct job URL, `currentTime=43`, `duration=43`, `ended=true`,
`readyState=4`, `videoWidth=1080`, `videoHeight=1920`, and `error=null`.
