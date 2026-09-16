"""Deterministic server-produced edit examples for the optimistic reducer's parity tests."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from synkinema.models import Clip, Operation, Project, Scene, ScriptLine, Track
from synkinema.service import Service
from synkinema.storage import Store


def export(destination):
    identity = {"track_id": "video", "clip_id": "one"}
    examples = [
        ("update_project", {"name": "Renamed", "profile": {"kind": "square", "width": 1080, "height": 1080}}),
        (
            "update_project",
            {"script_lines": [{"id": "line-one", "text": "Hello"}, {"id": "line-two", "text": "World"}]},
        ),
        ("update_project", {"script_lines": []}),
        ("update_project", {"script": "Legacy replacement"}),
        ("add_track", {"id": "extra", "name": "Extra", "kind": "overlay"}),
        ("reorder_tracks", {"track_ids": ["empty", "voice", "titles", "overlay", "video"]}),
        ("remove_track", {"track_id": "empty"}),
        ("remove_track", {"track_id": "titles", "remove_clips": True}),
        ("update_track", {"track_id": "voice", "changes": {"gain_db": -9, "name": "Quiet voice"}}),
        (
            "add_clip",
            {"track_id": "overlay", "clip": {"id": "new", "shape": "rectangle", "placement": {"x": 0.2}}},
        ),
        (
            "append_clip",
            {"track_id": "video", "clip": {"id": "new", "asset_id": "asset", "duration_ms": 1000}},
        ),
        ("duplicate_clip", {**identity, "new_clip_id": "copy"}),
        ("extract_audio", {**identity, "new_clip_id": "audio", "target_track_id": "voice"}),
        (
            "update_clip",
            {
                **identity,
                "changes": {
                    "transform": {"scale": 2},
                    "effects": [{"type": "blur", "value": 4, "enabled": True}],
                },
            },
        ),
        ("trim_clip", {**identity, "changes": {"start_ms": 100, "duration_ms": 1200, "source_in_ms": 500}}),
        ("move_clip", {**identity, "start_ms": 900, "target_track_id": "overlay"}),
        (
            "set_transition",
            {"track_id": "video", "clip_id": "two", "transition": {"type": "crossfade", "duration_ms": 300}},
        ),
        ("split_clip", {**identity, "time_ms": 701, "new_clip_id": "right"}),
        ("remove_clip", identity),
        ("restore_revision", {"revision": 1}),
    ]
    cases = []
    for kind, payload in examples:
        with (
            TemporaryDirectory(prefix="synkinema-edit-contract-") as directory,
            patch("synkinema.service.uid", return_value="project"),
            patch("synkinema.service.now", return_value="2026-01-01T00:00:00+00:00"),
        ):
            store = Store(directory)
            try:
                asset = {"id": "asset", "kind": "video", "duration_ms": 20000, "has_audio": True}
                store.execute(
                    "INSERT INTO assets VALUES(:id,:doc,:hash,:time)",
                    id="asset",
                    doc=json.dumps(asset),
                    hash="fixture",
                    time="0",
                )
                service = Service(store)
                project = service.create(
                    Project(
                        name="Reducer contract",
                        tracks=[
                            Track(
                                id="video",
                                name="Video",
                                kind="video",
                                clips=[
                                    Clip(
                                        id="one",
                                        speed=0.5,
                                        asset_id="asset",
                                        duration_ms=2000,
                                        fade_in_ms=900,
                                        fade_out_ms=600,
                                    ),
                                    Clip(id="two", asset_id="asset", start_ms=2000, duration_ms=2000),
                                ],
                            ),
                            Track(id="overlay", name="Elements", kind="overlay"),
                            Track(
                                id="titles",
                                name="Captions",
                                kind="text",
                                clips=[Clip(id="title", text="Title", start_ms=2000, duration_ms=2000)],
                            ),
                            Track(id="voice", name="Voice", kind="voiceover"),
                            Track(id="empty", name="Empty", kind="sound"),
                        ],
                        scenes=[Scene(id="scene", title="Scene", start_ms=2000)],
                    )
                )
                restored = service.summary(project) if kind == "restore_revision" else None
                if restored:
                    project = service.apply(
                        project.id,
                        Operation(type="update_project", payload={"name": "Changed"}, expected_revision=1),
                    )
                before = service.summary(project)
                operation = Operation(type=kind, payload=payload, expected_revision=project.revision)
                after = service.summary(service.apply(project.id, operation))
                cases.append(
                    {
                        "name": kind,
                        "before": before,
                        "plan": {
                            "steps": [{"type": kind, "payload": payload}],
                            **({"restored": restored} if restored else {}),
                        },
                        "after": after,
                    }
                )
            finally:
                store.engine.dispose()
    cases.append(script_audio_case())
    Path(destination, "edit-cases.json").write_text(
        json.dumps(cases, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def script_audio_case():
    with (
        TemporaryDirectory(prefix="synkinema-script-contract-") as directory,
        patch("synkinema.service.uid", return_value="project"),
        patch("synkinema.service.now", return_value="2026-01-01T00:00:00+00:00"),
    ):
        store = Store(directory)
        try:
            assets = {
                name: {"id": name, "kind": "audio", "duration_ms": duration, "has_audio": True}
                for name, duration in [("old", 1000), ("new", 700)]
            }
            for name, asset in assets.items():
                store.execute(
                    "INSERT INTO assets VALUES(:id,:doc,:hash,:time)",
                    id=name,
                    doc=json.dumps(asset),
                    hash=name,
                    time="0",
                )
            service = Service(store)
            project = service.create(
                Project(
                    name="Script audio replacement",
                    script_lines=[
                        ScriptLine(
                            id="line",
                            text="Hello",
                            audio_text="Hello",
                            audio_source="generated",
                            audio_asset_id="old",
                        )
                    ],
                    tracks=[
                        Track(
                            id="voice",
                            name="Voice",
                            kind="voiceover",
                            clips=[
                                Clip(
                                    id="take",
                                    name="Hello",
                                    asset_id="old",
                                    duration_ms=1000,
                                    start_ms=100,
                                    gain_db=-4,
                                    fade_out_ms=800,
                                )
                            ],
                        )
                    ],
                    scenes=[Scene(id="line", title="Line", narration="Hello", voice_asset_id="old")],
                )
            )
            step = {
                "type": "update_project",
                "payload": {
                    "script_lines": [
                        {
                            "id": "line",
                            "text": "New words",
                            "audio_text": "New words",
                            "audio_source": "generated",
                            "audio_asset_id": "new",
                        }
                    ]
                },
            }
            before = service.summary(project)
            after = service.summary(service.apply(project.id, Operation(expected_revision=1, **step)))
            return {
                "name": "replace_script_audio",
                "before": before,
                "plan": {"steps": [step], "audioAssets": assets},
                "after": after,
            }
        finally:
            store.engine.dispose()


if __name__ == "__main__":
    export(sys.argv[1])
