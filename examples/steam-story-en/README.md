# NEXT UP · 3 stories to get lost in · EN

A 47-second English Steam reel in the established NEXT UP format: a three-second
hook, three story-focused game introductions, and a closing audience question.

[Open the editable local project](http://localhost:8080/#/projects/e05bf63c0ad84df6bdd596a16b30522f).
The local server and its existing data volume must be available.

## Editorial plan

| Timeline | Game / purpose | Narration focus |
| --- | --- | --- |
| 0–3 s | Hook | “Need your next story obsession?” |
| 3–15.5 s | Sovereign Tower | Rule a kingdom, recruit knights, rewind a failed reign. |
| 15.5–29.33 s | Sunken Engine | Inherit a shipyard, repair ships, uncover unsettling secrets. |
| 29.33–41.77 s | The Blood of Dawnwalker | Become Coen, face a vampire identity, save your family. |
| 41.77–46.97 s | Three moving choice panels | “Which story would you get lost in first? Tell me your pick in the comments.” |

These are editorial picks, not a sales ranking or a prediction guarantee. Steam
availability was checked on September 13, 2026. All three games are single-player.
Sunken Engine is explicitly introduced as a **new full release**, following its
earlier Early Access release. Sources and reuse details are in [CREDITS.md](CREDITS.md).

## Production

Media discovery/import, local Supertonic M2 narration, word-timing inspection,
composition, timeline edits, rendering, and delivery checks use the Synkinema MCP
server at `http://localhost:8080/mcp/`. An MCP SDK client transports calls; Python
does not download, synthesize, mix, or encode the media outside MCP. Browser checks
are separate playback verification.

The editable revision contains 17 tracks and 86 clips: atmosphere, landscape
footage windows, titles, phrase captions, narration, music, transition sounds,
credits, and three moving panels in the final question. The output profile is
1080 × 1920, 30 fps, H.264 CRF 18, with a −16 LUFS normalization target.

### Audio revision

The original procedural pulse and its embedded transition tones were replaced
with Scott Buckley's cinematic **Signal to Noise**. A continuous excerpt begins
at source 60 seconds, with a 300 ms fade-in, 1.3-second fade-out, and −15 dB clip
gain (reduced by another 6 dB after user playback feedback). Automatic aggressive
ducking is disabled; narration remains on a separate
track at its original level.

Two separate, editable sound tracks add restrained whooshes (−19 dB) and impacts
(−21 dB) at the major section boundaries: 3, 15.5, 29.333 and 41.766 seconds.
The previous synthetic score remains in the private media collection, unused.

### Local evidence

`out/` is intentionally ignored by Git. It contains the MCP call audit
(`calls.jsonl`), source metadata, narration checks, committed project responses,
contact sheets, and render/verification/package responses. Actual media and
exports live in Synkinema's data volume. Keep that volume when restarting Docker.

See [QA.md](QA.md) for the measured final export and playback results.
