"""Replace a line's unambiguously associated whole-take timeline clips atomically."""

import math


def replace_script_audio(service, document, previous_lines):
    previous = {line["id"]: line for line in previous_lines}
    original_clips = {
        id(clip): clip.get("asset_id") for track in document["tracks"] for clip in track["clips"]
    }
    original_scenes = {id(scene): scene.get("voice_asset_id") for scene in document["scenes"]}
    for line in document["script_lines"]:
        old = previous.get(line["id"])
        before = old.get("audio_asset_id") if old else None
        after = line.get("audio_asset_id")
        if not before or not after or before == after:
            continue
        clips = [
            clip
            for track in document["tracks"]
            if track["kind"] == "voiceover"
            for clip in track["clips"]
            if original_clips[id(clip)] == before
        ]
        if not clips:
            continue
        if sum(item.get("audio_asset_id") == before for item in previous_lines) > 1:
            raise ValueError(
                "This take belongs to multiple script lines. Update its intended timeline clips explicitly in the same batch before replacing the line audio."
            )
        source, replacement = service.asset(before), service.asset(after)
        if (
            replacement["kind"] != "audio"
            or not replacement.get("has_audio")
            or not replacement.get("duration_ms")
        ):
            raise ValueError("Script lines require a probed audio asset with a duration")
        for clip in clips:
            if clip["source_in_ms"] or abs(clip["duration_ms"] * clip["speed"] - source["duration_ms"]) > 100:
                raise ValueError(
                    "This narration take is trimmed or split. Update its timeline clips explicitly in the same batch before replacing the line audio; source word timings cannot be inferred."
                )
            duration = math.floor(replacement["duration_ms"] / clip["speed"])
            if duration < 100:
                raise ValueError("Replacement narration must last at least 100 ms at the clip's speed")
            if any(k["time_ms"] > duration for a in clip["animations"] for k in a["keyframes"]):
                raise ValueError(
                    "Replacement narration ends before an existing audio keyframe; adjust the automation first"
                )
            if clip["transition"]["type"] != "cut" and clip["transition"]["duration_ms"] >= duration:
                raise ValueError(
                    "Replacement narration is shorter than its transition; adjust the transition first"
                )
            clip.update(
                asset_id=after,
                duration_ms=duration,
                fade_in_ms=min(clip["fade_in_ms"], duration),
                fade_out_ms=min(clip["fade_out_ms"], duration),
            )
            if clip["name"] == old.get("audio_text"):
                clip["name"] = line["audio_text"][:300]
        for scene in document["scenes"]:
            if original_scenes[id(scene)] == before:
                scene.update(voice_asset_id=after, narration=line["audio_text"])
