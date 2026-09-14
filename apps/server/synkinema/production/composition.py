"""One revision-guarded operation turns authored beats into an editable showcase."""

import math

from PIL import Image

from ..media import cached_text_layer
from ..models import Clip, EditStep
from .contracts import CompositionResult
from .layout import caption_layout


def compose(service, request, project_id, narration):
    old = service.get(project_id)
    if not request.replace_existing and any(t.clips for t in old.tracks):
        raise ValueError("Project is not empty; clone it or explicitly set replace_existing=true")
    if not 0.45 <= request.profile.width / request.profile.height <= 0.8:
        raise ValueError("showcase-v1 uses a portrait canvas; use ordinary operations for landscape layouts")
    if len({b.id for b in request.beats}) != len(request.beats):
        raise ValueError("Beat IDs must be unique")
    takes = {t.id: t for t in narration}
    tracks = []

    def lane(id, name, kind, **kw):
        row = {"id": id, "name": name, "kind": kind, "clips": [], **kw}
        tracks.append(row)
        return row["clips"]

    bg = lane("atmosphere", "Atmosphere", "video")
    hero = lane("gameplay", "Gameplay", "overlay")
    titles = lane("titles", "Titles & play modes", "text")
    identity = lane("identity", "Series identity", "text")
    labels = lane("labels", "Game mechanics", "text")
    captions = lane("captions", "Spoken captions", "text")
    disclosure = lane("disclosure", "AI voice disclosure", "text")
    voice = lane(
        "voice",
        "English narrator"
        if takes and next(iter(takes.values())).transcript.language == "en"
        else "Narrator",
        "voiceover",
    )
    music = lane("music", "Original score", "music", ducking=True)
    fps = request.profile.fps
    serial = 0

    def frame(n):
        return round(round(n * fps / 1000) * 1000 / fps)

    def ident():
        nonlocal serial
        serial += 1
        return f"showcase-{serial:04}"

    def text(
        target, value, start, end, size=62, y=0.755, style=None, color="#FFFFFF", subtitle="", max_bottom=None
    ):
        if not value:
            return
        c = Clip(
            id=ident(),
            name=value.replace("\n", " "),
            text=value,
            subtitle=subtitle,
            start_ms=start,
            duration_ms=end - start,
            font_size=size,
            text_x=0.075,
            text_y=y,
            caption_style=style or request.caption_style,
            color=color,
            fade_in_ms=0,
            fade_out_ms=0,
        )
        if max_bottom:
            while c.font_size >= 24:
                p = cached_text_layer(
                    c, request.profile.width, request.profile.height, service.store.path("cache")
                )
                with Image.open(p) as im:
                    import json

                    b = json.loads(im.info.get("caption_unclipped_bounds", "null"))
                if (
                    b
                    and b["top"] + b["height"] <= max_bottom * request.profile.height
                    and b["left"] + b["width"] <= request.profile.width
                ):
                    break
                c.font_size -= 2
            if c.font_size < 24:
                raise ValueError("Title is too long for the template; shorten it")
        target.append(c.model_dump())

    def shot(target, s, start, end, ambient=False, full=False):
        target.append(
            Clip(
                id=ident(),
                name=f"{s.asset_id} · source {s.source_in_ms} ms",
                asset_id=s.asset_id,
                source_in_ms=s.source_in_ms,
                start_ms=start,
                duration_ms=end - start,
                transform={"fit": "cover", "opacity": 0.32 if ambient else 0.57 if full else 1},
                placement={"x": 0.5, "y": 0.48, "width": 1, "height": 0.4}
                if target is hero
                else {"x": 0.5, "y": 0.5, "width": 1, "height": 1},
                effects=[{"type": "blur", "value": 7}, {"type": "saturation", "value": 0.65}]
                if ambient
                else [{"type": "brightness", "value": s.brightness}],
            ).model_dump()
        )

    cursor = 0
    scenes = []
    warnings = []
    for beat in request.beats:
        if beat.id not in takes:
            raise ValueError(f"Missing narration line {beat.id}")
        take = takes[beat.id]
        if beat.narration_asset_id not in (None, take.asset.id):
            raise ValueError("Narration asset must match its measured take")
        words = take.transcript.aligned_words
        if not words:
            raise ValueError(f"{beat.id}: no trustworthy aligned word timings; review/regenerate narration")
        voice_length = math.floor(take.asset.duration_ms * fps / 1000) * 1000 // fps
        offset = 0 if beat.role == "hook" else 100
        length = frame(
            beat.duration_ms
            if beat.duration_ms is not None
            else max(
                3000 if beat.role == "hook" else 5000 if beat.role == "outro" else 11000,
                voice_length + offset + 300,
            )
        )
        if voice_length + offset > length:
            raise ValueError(
                f"{beat.id}: duration shorter than actual voice; increase duration or regenerate speech"
            )
        if beat.role == "hook" and take.transcript.speech_end_ms > 3000:
            raise ValueError("Hook speech exceeds 3 seconds; shorten or regenerate it")
        start, end = cursor, cursor + length
        vstart = start + offset
        voice.append(
            Clip(
                id=ident(),
                name=take.text,
                asset_id=take.asset.id,
                start_ms=vstart,
                duration_ms=voice_length,
                fade_in_ms=0,
                fade_out_ms=0,
            ).model_dump()
        )
        groups = []
        group = []
        for word in words:
            if group and (len(group) >= 5 or len(" ".join(w.word for w in group)) + len(word.word) > 29):
                groups.append(group)
                group = []
            group.append(word)
            if word.word.endswith((".", "?", "!", ",", ";")) and len(group) >= 2:
                groups.append(group)
                group = []
        if group:
            groups.append(group)
        for i, g in enumerate(groups):
            a = vstart + frame(g[0].start_ms)
            b = vstart + frame(groups[i + 1][0].start_ms) if i + 1 < len(groups) else end
            if b <= a:
                raise ValueError("Caption timestamps collapse to one frame; review the transcript")
            text(captions, " ".join(w.word for w in g).upper(), a, b, color=beat.color, size=60)
        for i, s in enumerate(beat.shots):
            a = start + frame(length * i / len(beat.shots))
            b = start + frame(length * (i + 1) / len(beat.shots))
            shot(bg, s, a, b, ambient=beat.role != "hook", full=beat.role == "hook")
            if beat.role != "hook":
                shot(hero, s, a, b)
        text(
            titles,
            beat.title.upper(),
            start,
            end,
            size=100 if beat.role == "hook" else 78,
            y=0.31 if beat.role == "hook" else 0.145,
            style="bold" if beat.role in ("hook", "outro") else "editorial",
            subtitle=beat.subtitle,
            color=beat.color,
            max_bottom=0.54 if beat.role == "hook" else 0.267,
        )
        text(
            labels,
            beat.tagline.upper(),
            start,
            end,
            size=32,
            y=0.575 if beat.role == "hook" else 0.70,
            style="bold",
            color=beat.color,
        )
        scenes.append(
            {
                "id": beat.id,
                "title": beat.title,
                "start_ms": start,
                "duration_ms": length,
                "narration": take.text,
                "voice_asset_id": take.asset.id,
                "notes": "showcase-v1; source cuts must be visually inspected before final export.",
            }
        )
        warnings.extend(f"{beat.id}: {w}" for w in take.transcript.warnings)
        cursor = end
    text(identity, request.series_title, 0, cursor, size=27, y=0.105, style="minimal")
    text(disclosure, "AI-GENERATED VOICE • EDITORIAL PICKS", 0, cursor, size=27, y=0.85, style="minimal")
    if request.music_asset_id:
        music.append(
            Clip(
                id=ident(),
                name="Score",
                asset_id=request.music_asset_id,
                start_ms=0,
                duration_ms=cursor,
                gain_db=-8,
                fade_in_ms=20,
                fade_out_ms=700,
            ).model_dump()
        )
    operations = (
        [
            {"type": "remove_clip", "payload": {"track_id": t.id, "clip_id": c.id}}
            for t in old.tracks
            for c in t.clips
        ]
        + [{"type": "remove_track", "payload": {"track_id": t.id}} for t in old.tracks]
        + [{"type": "add_track", "payload": t} for t in tracks]
        + [
            {
                "type": "update_project",
                "payload": {
                    "profile": request.profile.model_dump(),
                    "scenes": scenes,
                    "script": "\n\n".join(takes[b.id].text for b in request.beats),
                },
            }
        ]
    )
    # Internal generated steps share the ordinary batch transaction/validation path.
    # The public 100-operation payload limit need not force a template into partial revisions.
    steps = [EditStep.model_validate(o) for o in operations]
    project = service._apply_edits(
        project_id, request.expected_revision, steps, dry_run=True, validate_final=True
    )
    layout = caption_layout(service, project)
    if not request.dry_run and not layout.passed:
        raise ValueError(f"Caption layout failed: {layout.issues}; adjust titles/copy before committing")
    if not request.dry_run:
        project = service._apply_edits(project_id, request.expected_revision, steps, validate_final=True)
    return CompositionResult(
        committed=not request.dry_run,
        base_revision=request.expected_revision,
        project=service.summary(project),
        layout=layout,
        warnings=warnings,
    )
