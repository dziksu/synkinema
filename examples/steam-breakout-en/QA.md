# Final verification — revision 5, 12 September 2026

Editable project: `21f98d7acf244fb6b3f1c83fafe19159`, revision **5**.
Final server job: `3ff7718b861c4a4097745c3b57188bd4`.

- Regenerated the second opening take as “Check out these games.” and changed
  the last sentence to “Which one wins? Tell me in the comments.”
- Exactly two voice clips and three corresponding caption clips changed.
  Script and scene narration were synchronized. Gameplay, other narration,
  music, effects, profile and the 27-second duration are preserved.
- Local Whisper tiny.en transcription matches every word of both revised
  sentences, first in the source WAVs and then in the final mixed AAC export.
  Evidence: `out/revision-5-source-transcription.json` and
  `out/revision-5-export-transcription.json`. This is automated speech recognition,
  not a human listening review.
- Actual export frames at 2.0, 25.2 and 26.5 seconds show the revised captions
  inside the frame, without overlapping the other labels or disclosure.
- File: `out/next-up-steam-final.mp4`, **18,203,858 bytes**, **1080 × 1920**,
  30 fps, H.264 and stereo AAC. **−18.96 LUFS / −2.17 dBTP**, no audio warnings
  or measured clipping. Preflight valid, no warnings: 16 tracks, 81 clips,
  17 referenced assets. All 25 English caption cues are retained in the SRT.
- Revision 5 played to its 27-second end in the project's Exports tab at native
  resolution (`ended=true`, `readyState=4`), with no media or console errors.
- The previous revision 4 export and original voice sources remain available
  in the app. Prior local delivery artifacts are archived in `out/revision-4/`.

## Previous revision 4 renderer verification

Editable project: `21f98d7acf244fb6b3f1c83fafe19159`, revision **4**.
Final server job: `bcb155b7c86544fe9620d9930fb18811`.

- Full export: `out/next-up-steam-final.mp4`, **27.000 seconds**, 810 frames,
  **1080 × 1920**, 30 fps, H.264, yuv420p, stereo AAC at 48 kHz.
- File size: **18,225,024 bytes**. Actual frames inspected at 14 timestamps.
- Integrated loudness: **−18.94 LUFS**; true peak: **−1.97 dBTP**.
  No audio inspection warnings and no clipping in the measured windows.
- Final preflight: valid; no errors or warnings. 16 tracks, 81 clips, 17 assets.
- 25 authored English caption cues retained separately in
  `out/english-captions.srt`; the API's complete text export is `out/all-text.srt`.
- Source footage hashes and byte counts: `out/source-checksums.json`.
- The browser decoded the final server export at full resolution and played it
  to its 27-second end with no media or console errors (`readyState=4`, `ended=true`).
- Only this project's three intermediate exports were removed from the app and
  disk after the final passed inspection; project revisions and source media remain.

The production exposed two renderer inefficiencies: unbounded per-input decoder
pools and endlessly looping image layers after their captions had ended. Both were
fixed. Observed FFmpeg thread count fell from approximately 619 to 72; the corrected
run completed in **209.45 seconds**, using previously prepared source-clip caches.
The earlier run took 570.46 seconds, but the cache states differ, so this is not a
controlled speed benchmark. Full-video SSIM against the first reviewed export was
**0.998326**; the final contact sheet was also reviewed after the renderer changes.

AAC output is now measured after encoding; peak correction changes audio only.
The regression test verifies the exact encoded video-packet hash survives that
correction, and the video duration remains unchanged.

Narration is locally generated English Supertonic 3 M2 speech. Caption timing is
authored against separate takes, not forced alignment. Game-name pronunciation has
not been independently reviewed by a human listener. See `CREDITS.md` for official
sources, ownership and suggested publication wording. The film was not published.
