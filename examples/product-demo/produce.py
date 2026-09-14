"""Assemble the Playwright take as an editable Synkinema project through MCP.

The only direct REST request is multipart upload of the large browser recording;
all project edits, narration, score and renders use Synkinema MCP operations.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

HERE = Path(__file__).resolve().parent
VARIANT = os.environ.get("SYNKINEMA_DEMO_VARIANT", "tour")
if VARIANT not in {"tour", "promo"}:
    raise ValueError(f"Unknown demo variant: {VARIANT}")
VERSION = os.environ.get("SYNKINEMA_DEMO_VERSION", "v3" if VARIANT == "promo" else "v1")
STORYBOARD = json.loads(
    (HERE / ("storyboard-promo.json" if VARIANT == "promo" else "storyboard.json")).read_text()
)
OUT = Path(
    os.environ.get(
        "SYNKINEMA_DEMO_OUT",
        HERE
        / (("out-promo" if VERSION == "v2" else f"out-promo-{VERSION}") if VARIANT == "promo" else "out"),
    )
).resolve()
ORIGIN = os.environ.get("SYNKINEMA_ORIGIN", "http://127.0.0.1:43817").rstrip("/")
STATE = OUT / "production.json"


def save(state):
    OUT.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2))


def read_state():
    return json.loads(STATE.read_text())


async def call(session, name, arguments=None):
    result = await session.call_tool(name, arguments or {})
    if result.isError:
        raise RuntimeError(f"{name}: {result.content}")
    data = result.structuredContent
    if data is None:
        blocks = [part.text for part in result.content if part.type == "text"]
        data = json.loads(blocks[0]) if blocks else None
    if isinstance(data, dict) and set(data) == {"result"}:
        data = data["result"]
    return data


async def prepare(session):
    if STATE.exists():
        raise RuntimeError(f"Project already started in {STATE}; do not duplicate it")
    script = "\n\n".join(part["narration"] for part in STORYBOARD)
    if VARIANT == "promo":
        brief = (
            "Fast English promotional draft for Synkinema, the MIT-licensed local video studio. "
            "Eleven tight chapters, cuts paced to the measured voice takes, and a pulse music bed. "
            "Playwright records the running Studio and views an existing owner project read-only. "
            "Editing, voice, music and export are created in Synkinema. "
            "Review rights to footage visible in the example project before publishing. "
            "Disclose the AI voice; the final card does so."
        )
        project_name = f"Synkinema • open-source product promo — {VERSION}"
    else:
        brief = (
            "Pierwsza, ogólna prezentacja produktu Synkinema. Lokalny film roboczy, "
            "bez publikacji. Ekran nagrany Playwrightem z uruchomionego Studio. "
            "Pokazuje istniejący projekt wyłącznie do odczytu. Montaż, polski lektor "
            "Supertonic 3, napisy, muzyka i eksport powstają w Synkinema. "
            "Przed publiczną publikacją należy sprawdzić prawa do treści widocznych "
            "w przykładowym projekcie. Lektor AI wymaga oznaczenia przy publikacji."
        )
        project_name = "Synkinema • prezentacja produktu — wersja 1"
    project = await call(
        session,
        "create_project",
        {"name": project_name, "brief": brief},
    )
    project_id = project["id"]
    planned_start = 0
    scenes = []
    for part in STORYBOARD:
        scenes.append(
            {
                "id": part["id"],
                "title": part["title"],
                "narration": part["narration"],
                "notes": part["subtitle"],
                "start_ms": planned_start,
                "duration_ms": part["hold_ms"],
            }
        )
        planned_start += part["hold_ms"]
    project = await call(
        session,
        "apply_operation",
        {
            "project_id": project_id,
            "operation": {
                "expected_revision": project["revision"],
                "type": "update_project",
                "payload": {
                    "script": script,
                    "scenes": scenes,
                    "profile": {
                        "name": "Product promo · 16:9"
                        if VARIANT == "promo"
                        else "Prezentacja produktu · 16:9",
                        "kind": "video",
                        "width": 1600,
                        "height": 900,
                        "fps": 30,
                        "crf": 20,
                        "target_lufs": -16,
                        "true_peak": -1.5,
                        "normalize": True,
                    },
                },
            },
        },
    )
    request_key = f"{project_id}-product-{VARIANT}-narration"
    task = await call(
        session,
        "start_production_task",
        {
            "request": {
                "request_key": request_key,
                "request": {
                    "type": "prepare_narration",
                    "project_id": project_id,
                    "language": "en" if VARIANT == "promo" else "pl",
                    "voice_id": "M2",
                    "model": "tiny.en" if VARIANT == "promo" else "tiny",
                    "speed": 1.14 if VARIANT == "promo" else 1.03,
                    "steps": 8,
                    "lines": [{"id": part["id"], "text": part["narration"]} for part in STORYBOARD],
                },
            }
        },
    )
    state = {
        "origin": ORIGIN,
        "project_id": project_id,
        "project_url": f"{ORIGIN}/#/projects/{project_id}",
        "revision": project["revision"],
        "narration_task_id": task["id"],
    }
    save(state)
    print(json.dumps(state, ensure_ascii=False, indent=2), flush=True)


async def status(session):
    state = read_state()
    for key in ["narration_task_id", "score_task_id"]:
        if key not in state:
            continue
        task = await call(session, "get_production_task", {"task_id": state[key]})
        summary = {"id": task["id"], "status": task["status"], "phase": task.get("phase")}
        if task["status"] == "completed":
            summary["assets"] = [
                {"id": asset["id"], "duration_ms": asset["duration_ms"]}
                for asset in task["result"].get("assets", [])
            ]
        if task["status"] == "failed":
            summary["error"] = task.get("error")
        print(key, json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


async def promo_cuts(session, state):
    if "promo_voice_cuts" in state:
        return state["promo_voice_cuts"]
    task = await call(session, "get_production_task", {"task_id": state["narration_task_id"]})
    if task["status"] != "completed":
        raise RuntimeError("Narration must finish before measuring the promo cut")
    assets = {line["id"]: line["asset"] for line in task["result"]["narration"]}
    cuts = {}
    for part in STORYBOARD:
        asset = assets[part["id"]]
        plan = await call(
            session,
            "plan_narration_cut",
            {
                "request": {
                    "project_id": state["project_id"],
                    "expected_revision": state["revision"],
                    "track_id": "voice",
                    "asset_id": asset["id"],
                    "leading_ms": 40,
                    "trailing_ms": 120,
                }
            },
        )
        segments = plan["segments"]
        if not segments:
            raise RuntimeError(f"No audible narration found for {part['id']}")
        source_in = segments[0]["source_in_ms"]
        source_end = max(segment["source_in_ms"] + segment["duration_ms"] for segment in segments)
        if source_end > asset["duration_ms"]:
            raise RuntimeError(f"Invalid voice cut for {part['id']}")
        cuts[part["id"]] = {
            "asset_id": asset["id"],
            "source_in_ms": source_in,
            "duration_ms": source_end - source_in,
            "asset_duration_ms": asset["duration_ms"],
        }
    state["promo_voice_cuts"] = cuts
    save(state)
    return cuts


async def start_score(session):
    state = read_state()
    if "score_task_id" in state:
        raise RuntimeError("Score task already started")
    if VARIANT == "promo":
        cuts = await promo_cuts(session, state)
        length = sum(cuts[part["id"]]["duration_ms"] + 180 for part in STORYBOARD)
        accents = []
        cursor = 0
        for part in STORYBOARD[1:]:
            previous = STORYBOARD[STORYBOARD.index(part) - 1]
            cursor += cuts[previous["id"]]["duration_ms"] + 180
            accents.append(cursor)
    else:
        take = json.loads((OUT / "take.json").read_text())
        length = take["scenes"][-1]["end_ms"] - take["scenes"][0]["start_ms"]
        accents = [s["start_ms"] - take["scenes"][0]["start_ms"] for s in take["scenes"][1:]]
    task = await call(
        session,
        "start_production_task",
        {
            "request": {
                "request_key": f"{state['project_id']}-product-{VARIANT}-score",
                "request": {
                    "type": "generate_score",
                    "project_id": state["project_id"],
                    "duration_ms": length,
                    "mood": "pulse" if VARIANT == "promo" else "ambient",
                    "bpm": 116 if VARIANT == "promo" else 88,
                    "seed": 14092027 if VARIANT == "promo" else 14092026,
                    "accents_ms": accents,
                },
            }
        },
    )
    state["score_task_id"] = task["id"]
    save(state)
    print("score_task_id", task["id"], flush=True)


def upload():
    state = read_state()
    if "video_asset_id" in state:
        raise RuntimeError("Screen recording already uploaded")
    recording = OUT / "studio-tour.webm"
    with recording.open("rb") as source:
        response = httpx.post(
            f"{ORIGIN}/api/assets",
            data={
                "project_id": state["project_id"],
                "tags": json.dumps(["Synkinema", "Playwright", "product demo", "screen recording"]),
                "source": "Playwright recording of the owner's local Synkinema Studio",
                "license": "Owner-authored screen recording; third-party footage in the example project is for local draft review only.",
            },
            files={"file": ("synkinema-studio-tour.webm", source, "video/webm")},
            timeout=300,
        )
    response.raise_for_status()
    asset = response.json()
    state["video_asset_id"] = asset["id"]
    state["video_duration_ms"] = asset["duration_ms"]
    save(state)
    print(json.dumps({"id": asset["id"], "duration_ms": asset["duration_ms"]}), flush=True)


async def compose(session):
    if VARIANT == "promo":
        return await compose_promo(session)
    state = read_state()
    if "composed_revision" in state:
        raise RuntimeError("Timeline already composed; inspect the project before editing")
    if "video_asset_id" not in state:
        raise RuntimeError("Upload the screen recording first")
    take = json.loads((OUT / "take.json").read_text())
    source_start = take["scenes"][0]["start_ms"]
    duration = take["scenes"][-1]["end_ms"] - source_start
    if source_start + duration > state["video_duration_ms"]:
        raise RuntimeError("Screen recording is shorter than the measured take")

    narration_task = await call(session, "get_production_task", {"task_id": state["narration_task_id"]})
    score_task = await call(session, "get_production_task", {"task_id": state["score_task_id"]})
    if narration_task["status"] != "completed" or score_task["status"] != "completed":
        raise RuntimeError("Narration and score must both be complete")
    voices = {line["id"]: line["asset"] for line in narration_task["result"]["narration"]}
    score = score_task["result"]["assets"][0]
    if score["duration_ms"] < duration:
        raise RuntimeError("Generated music is shorter than the take")

    project = await call(session, "get_project", {"project_id": state["project_id"]})
    if project["revision"] != state["revision"]:
        raise RuntimeError("Project revision changed; reconcile before composing")
    tracks = {track["id"]: track["kind"] for track in project["tracks"]}
    if tracks != {"video": "video", "titles": "text", "voice": "voiceover", "music": "music"}:
        raise RuntimeError(f"Unexpected project tracks: {tracks}")

    scenes = []
    operations = []
    for part in take["scenes"]:
        start = part["start_ms"] - source_start
        scene_duration = part["end_ms"] - part["start_ms"]
        voice = voices[part["id"]]
        voice_start = start + 500
        if voice_start + voice["duration_ms"] > start + scene_duration:
            raise RuntimeError(f"Narration overflows scene {part['id']}")
        scenes.append(
            {
                "id": part["id"],
                "title": part["title"],
                "narration": part["narration"],
                "notes": part["subtitle"],
                "start_ms": start,
                "duration_ms": scene_duration,
                "voice_asset_id": voice["id"],
            }
        )
        operations.append(
            {
                "type": "add_clip",
                "payload": {
                    "track_id": "titles",
                    "clip": {
                        "id": f"demo-title-{part['id']}",
                        "name": part["title"],
                        "text": part["title"],
                        "subtitle": part["subtitle"],
                        "start_ms": start,
                        "duration_ms": scene_duration,
                        "caption_style": "boxed",
                        "font_size": 44,
                        "text_x": 0.05,
                        "text_y": 0.76,
                        "color": "#d8fb76",
                        "fade_in_ms": 250,
                        "fade_out_ms": 250,
                    },
                },
            }
        )
        operations.append(
            {
                "type": "add_clip",
                "payload": {
                    "track_id": "voice",
                    "clip": {
                        "id": f"demo-voice-{part['id']}",
                        "name": f"Lektor: {part['title']}",
                        "asset_id": voice["id"],
                        "start_ms": voice_start,
                        "duration_ms": voice["duration_ms"],
                        "fade_in_ms": 90,
                        "fade_out_ms": 150,
                    },
                },
            }
        )

    operations.insert(0, {"type": "update_project", "payload": {"scenes": scenes}})
    operations.insert(
        1,
        {
            "type": "add_clip",
            "payload": {
                "track_id": "video",
                "clip": {
                    "id": "demo-screen-recording",
                    "name": "Studio nagrane Playwrightem",
                    "asset_id": state["video_asset_id"],
                    "start_ms": 0,
                    "source_in_ms": source_start,
                    "duration_ms": duration,
                },
            },
        },
    )
    operations.append(
        {
            "type": "add_clip",
            "payload": {
                "track_id": "music",
                "clip": {
                    "id": "demo-music-bed",
                    "name": "Muzyka ambient 88 BPM",
                    "asset_id": score["id"],
                    "start_ms": 0,
                    "duration_ms": duration,
                    "gain_db": -25,
                    "fade_in_ms": 1200,
                    "fade_out_ms": 1800,
                },
            },
        }
    )
    operations.append(
        {"type": "update_track", "payload": {"track_id": "music", "changes": {"ducking": True}}}
    )
    request = {"expected_revision": project["revision"], "operations": operations}
    dry_run = await call(
        session,
        "apply_operations",
        {"project_id": state["project_id"], "request": {**request, "dry_run": True}, "compact": True},
    )
    print(
        "dry_run",
        json.dumps(
            {
                key: dry_run.get(key)
                for key in ("committed", "base_revision", "confirmed_revision", "applied_operations")
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    result = await call(
        session,
        "apply_operations",
        {"project_id": state["project_id"], "request": {**request, "dry_run": False}, "compact": True},
    )
    revision = result.get("confirmed_revision") or result["project"]["revision"]
    state["revision"] = revision
    state["composed_revision"] = revision
    save(state)
    print(
        "composed",
        json.dumps({"revision": revision, "duration_ms": duration, "operations": len(operations)}),
        flush=True,
    )


async def compose_promo(session):
    state = read_state()
    if "composed_revision" in state:
        raise RuntimeError("Promo timeline already composed")
    if "video_asset_id" not in state:
        raise RuntimeError("Upload the Playwright recording first")
    take = json.loads((OUT / "take.json").read_text())
    if [part["id"] for part in take["scenes"]] != [part["id"] for part in STORYBOARD]:
        raise RuntimeError("Recording chapters do not match the promo storyboard")
    cuts = await promo_cuts(session, state)
    score_task = await call(session, "get_production_task", {"task_id": state["score_task_id"]})
    if score_task["status"] != "completed":
        raise RuntimeError("Music generation is not complete")
    score = score_task["result"]["assets"][0]
    project = await call(session, "get_project", {"project_id": state["project_id"]})
    if project["revision"] != state["revision"]:
        raise RuntimeError("Project revision changed; review it before composing")
    tracks = {track["id"]: track["kind"] for track in project["tracks"]}
    if tracks != {"video": "video", "titles": "text", "voice": "voiceover", "music": "music"}:
        raise RuntimeError(f"Unexpected tracks: {tracks}")

    scenes = []
    operations = []
    cursor = 0
    for part in take["scenes"]:
        cut = cuts[part["id"]]
        scene_duration = cut["duration_ms"] + 180
        source_available = part["end_ms"] - part["start_ms"]
        if scene_duration > source_available:
            raise RuntimeError(f"Not enough recorded video for {part['id']}")
        if part["start_ms"] + scene_duration > state["video_duration_ms"]:
            raise RuntimeError(f"Video source bounds exceeded in {part['id']}")
        scenes.append(
            {
                "id": part["id"],
                "title": part["title"],
                "narration": part["narration"],
                "notes": part["subtitle"],
                "start_ms": cursor,
                "duration_ms": scene_duration,
                "voice_asset_id": cut["asset_id"],
            }
        )
        if part["id"] == "hook":
            # The recorded hook changes pages. Cut around navigation loading so
            # the opening moves directly from MCP setup to a ready editor.
            source_shots = [
                ("agent", part["start_ms"] + 500, cursor, 1000),
                (
                    "editor",
                    part["start_ms"] + 3600,
                    cursor + 1000,
                    scene_duration - 1000,
                ),
            ]
        else:
            source_shots = [(part["id"], part["start_ms"], cursor, scene_duration)]
        for shot_id, source_in, shot_start, shot_duration in source_shots:
            if source_in + shot_duration > part["end_ms"]:
                raise RuntimeError(f"Recorded shot is too short for {part['id']}: {shot_id}")
            operations.append(
                {
                    "type": "add_clip",
                    "payload": {
                        "track_id": "video",
                        "clip": {
                            "id": f"promo-video-{shot_id}",
                            "name": f"Playwright: {part['title']} · {shot_id}",
                            "asset_id": state["video_asset_id"],
                            "source_in_ms": source_in,
                            "start_ms": shot_start,
                            "duration_ms": shot_duration,
                        },
                    },
                }
            )
        if part["id"] == "hook":
            title_duration, font_size = min(scene_duration, 3700), 30
        elif part["id"] == "outro":
            title_duration, font_size = scene_duration, 30
        else:
            title_duration, font_size = min(scene_duration, 1800), 25
        operations.append(
            {
                "type": "add_clip",
                "payload": {
                    "track_id": "titles",
                    "clip": {
                        "id": f"promo-title-{part['id']}",
                        "name": part["title"],
                        "text": part["title"],
                        "subtitle": part["subtitle"],
                        "start_ms": cursor,
                        "duration_ms": title_duration,
                        "caption_style": "boxed",
                        "font_size": font_size,
                        "text_x": 0.05,
                        "text_y": 0.80,
                        "color": "#d8fb76",
                        "fade_in_ms": 140,
                        "fade_out_ms": 180,
                    },
                },
            }
        )
        operations.append(
            {
                "type": "add_clip",
                "payload": {
                    "track_id": "voice",
                    "clip": {
                        "id": f"promo-voice-{part['id']}",
                        "name": f"Voice: {part['title']}",
                        "asset_id": cut["asset_id"],
                        "source_in_ms": cut["source_in_ms"],
                        "start_ms": cursor,
                        "duration_ms": cut["duration_ms"],
                        "fade_in_ms": 30,
                        "fade_out_ms": 90,
                    },
                },
            }
        )
        cursor += scene_duration

    if score["duration_ms"] < cursor:
        raise RuntimeError("Generated music is shorter than the measured promo")
    operations.insert(0, {"type": "update_project", "payload": {"scenes": scenes}})
    operations.extend(
        [
            {
                "type": "add_clip",
                "payload": {
                    "track_id": "music",
                    "clip": {
                        "id": "promo-music-bed",
                        "name": "Pulse score · 116 BPM",
                        "asset_id": score["id"],
                        "start_ms": 0,
                        "duration_ms": cursor,
                        "gain_db": -17,
                        "fade_in_ms": 450,
                        "fade_out_ms": 800,
                    },
                },
            },
            {"type": "update_track", "payload": {"track_id": "music", "changes": {"ducking": True}}},
        ]
    )
    request = {"expected_revision": project["revision"], "operations": operations}
    dry_run = await call(
        session,
        "apply_operations",
        {"project_id": state["project_id"], "request": {**request, "dry_run": True}, "compact": True},
    )
    if dry_run["committed"]:
        raise RuntimeError("Dry run unexpectedly committed")
    result = await call(
        session,
        "apply_operations",
        {"project_id": state["project_id"], "request": {**request, "dry_run": False}, "compact": True},
    )
    revision = result["confirmed_revision"]
    state["revision"] = revision
    state["composed_revision"] = revision
    state["duration_ms"] = cursor
    save(state)
    print(json.dumps({"revision": revision, "duration_ms": cursor, "operations": len(operations)}))


async def render(session, *, replace_completed=False):
    state = read_state()
    previous_job_id = state.get("render_job_id")
    if previous_job_id:
        if not replace_completed:
            raise RuntimeError("A render has already been started; inspect its job first")
        previous_job = await call(session, "get_render_progress", {"job_id": previous_job_id})
        if previous_job["status"] != "completed":
            raise RuntimeError(f"Previous render is not complete: {previous_job['status']}")
    elif replace_completed:
        raise RuntimeError("No completed render to replace; use render")
    preflight = await call(
        session,
        "validate_project",
        {"project_id": state["project_id"], "revision": state["revision"]},
    )
    if not preflight["valid"]:
        raise RuntimeError(f"Preflight failed: {preflight['errors']}")
    layout = await call(
        session,
        "inspect_caption_layout",
        {"request": {"project_id": state["project_id"], "revision": state["revision"]}},
    )
    if not layout["passed"]:
        raise RuntimeError(f"Caption layout failed: {layout['issues']}")
    job = await call(
        session,
        "start_render",
        {
            "project_id": state["project_id"],
            "expected_revision": state["revision"],
            "quality": "final",
        },
    )
    if previous_job_id:
        state.setdefault("render_history", []).append(previous_job_id)
        state.pop("verification_task_id", None)
        state.pop("render_output_url", None)
        state.pop("local_mp4", None)
    state["render_job_id"] = job["id"]
    save(state)
    print(json.dumps({"id": job["id"], "status": job["status"]}), flush=True)


async def render_status(session):
    state = read_state()
    job = await call(session, "get_render_progress", {"job_id": state["render_job_id"]})
    print(json.dumps(job, ensure_ascii=False, indent=2), flush=True)


async def verify(session):
    state = read_state()
    if "verification_task_id" in state:
        raise RuntimeError("Verification already started")
    job = await call(session, "get_render_progress", {"job_id": state["render_job_id"]})
    if job["status"] != "completed":
        raise RuntimeError(f"Render is not complete: {job['status']}")
    task = await call(
        session,
        "start_production_task",
        {
            "request": {
                "request_key": f"{state['project_id']}-product-{VARIANT}-verification-{job['id']}",
                "request": {
                    "type": "verify_render",
                    "job_id": job["id"],
                    "transcribe": True,
                    "language": "en" if VARIANT == "promo" else "pl",
                    "model": "tiny.en" if VARIANT == "promo" else "tiny",
                    "reference_text": " ".join(part["narration"] for part in STORYBOARD),
                },
            }
        },
    )
    state["verification_task_id"] = task["id"]
    save(state)
    print(json.dumps({"id": task["id"], "status": task["status"]}), flush=True)


async def verification_status(session):
    state = read_state()
    task = await call(session, "get_production_task", {"task_id": state["verification_task_id"]})
    summary = {"id": task["id"], "status": task["status"], "phase": task.get("phase")}
    if task["status"] == "completed":
        report = task["result"].get("verification") or {}
        audio = report.get("audio") or {}
        transcript = report.get("transcription") or report.get("transcript") or {}
        layout = report.get("layout") or {}
        summary["verification"] = {
            "decode_passed": report.get("decode_passed"),
            "passed": report.get("passed"),
            "sha256": report.get("sha256"),
            "integrated_lufs": audio.get("integrated_lufs"),
            "true_peak_dbtp": audio.get("true_peak_dbtp"),
            "layout_passed": layout.get("passed"),
            "transcript_match_ratio": transcript.get("match_ratio"),
            "warnings": report.get("warnings"),
        }
    elif task["status"] == "failed":
        summary["error"] = task.get("error")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


async def download(session):
    state = read_state()
    job = await call(session, "get_render_progress", {"job_id": state["render_job_id"]})
    if job["status"] != "completed" or not job.get("output_url"):
        raise RuntimeError(f"Render is not downloadable: {job['status']}")
    destination = OUT / (
        f"synkinema-open-source-promo-{VERSION}.mp4"
        if VARIANT == "promo"
        else "synkinema-product-demo-v1.mp4"
    )
    with httpx.stream("GET", f"{ORIGIN}{job['output_url']}", timeout=300) as response:
        response.raise_for_status()
        with destination.open("wb") as output:
            for chunk in response.iter_bytes():
                output.write(chunk)
    state["render_output_url"] = job["output_url"]
    state["local_mp4"] = str(destination)
    save(state)
    print(json.dumps({"path": str(destination), "size": destination.stat().st_size}), flush=True)


async def main(command):
    if command == "upload":
        upload()
        return
    async with (
        streamablehttp_client(f"{ORIGIN}/mcp/") as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        if command == "prepare":
            await prepare(session)
        elif command == "status":
            await status(session)
        elif command == "start-score":
            await start_score(session)
        elif command == "compose":
            await compose(session)
        elif command == "render":
            await render(session)
        elif command == "rerender":
            await render(session, replace_completed=True)
        elif command == "render-status":
            await render_status(session)
        elif command == "verify":
            await verify(session)
        elif command == "verification-status":
            await verification_status(session)
        elif command == "download":
            await download(session)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=[
            "prepare",
            "status",
            "start-score",
            "upload",
            "compose",
            "render",
            "rerender",
            "render-status",
            "verify",
            "verification-status",
            "download",
        ],
    )
    args = parser.parse_args()
    asyncio.run(main(args.command))
