"""Live MCP-only acceptance workflow. No local media processing, REST calls or provider code.

Uses the actual MCP SDK/Streamable HTTP. Writes returned metadata and native MCP
image blocks for human review. Creates one private QA project; never edits an
existing user project. Requires public internet for Steam/model imports.
"""

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def run(args):
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    headers = {}
    if token := os.environ.get("SYNKINEMA_API_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    async with (
        streamablehttp_client(f"{args.origin.rstrip('/')}/mcp/", headers=headers) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        calls = []

        async def call(name, arguments=None, label=None):
            result = await session.call_tool(name, arguments or {})
            calls.append({"name": name, "arguments": arguments or {}, "is_error": bool(result.isError)})
            (out / "calls.json").write_text(json.dumps(calls, indent=2))
            if result.isError:
                raise RuntimeError(f"{name}: {result.content}")
            for i, block in enumerate(result.content):
                if block.type == "image":
                    suffix = "png" if block.mimeType == "image/png" else "jpg"
                    (out / f"{label or name}-{i}.{suffix}").write_bytes(base64.b64decode(block.data))
            data = result.structuredContent
            if data is None:
                texts = [x.text for x in result.content if x.type == "text"]
                data = json.loads(texts[0]) if texts else None
            if isinstance(data, dict) and set(data) == {"result"}:
                data = data["result"]
            if label:
                (out / f"{label}.json").write_text(json.dumps(data, indent=2))
            return data

        async def task(label, request):
            started = await call(
                "start_production_task",
                {"request": {"request_key": f"{project['id']}-{label}", "request": request}},
                label=f"{label}-started",
            )
            print(label, started["id"], started["status"], flush=True)
            # Bounded server waits; retain the ID so a timeout is never a duplicate start.
            while started["status"] in ("queued", "running"):
                started = await call(
                    "wait_production_task",
                    {"task_id": started["id"], "request": {"timeout_seconds": 20}},
                    label=label,
                )
                print(label, started["status"], started["phase"], flush=True)
            if started["status"] != "completed":
                raise RuntimeError(json.dumps(started))
            return started

        caps = await call("get_production_capabilities", label="capabilities")
        await call("get_voice_provider_status", label="voice-providers")
        await call("search_steam_games", {"request": {"query": "horror", "count": 3}}, label="search")
        await call("get_steam_games", {"request": {"app_ids": [4406280]}}, label="steam")
        project = await call(
            "create_project",
            {
                "name": "QA • MCP complete production",
                "brief": "Real Steam HLS, local TTS/ASR, composition and export verification entirely through MCP.",
            },
            label="project",
        )
        print("PROJECT", f"{args.origin}/#/projects/{project['id']}", flush=True)
        await task("voice-model", {"type": "install_voice_model"})
        if not next(x for x in caps["transcribers"] if x["model"] == "tiny.en")["installed"]:
            await task("transcriber", {"type": "install_transcriber", "model": "tiny.en"})
        media = await task(
            "trailer",
            {
                "type": "import_steam_trailer",
                "project_id": project["id"],
                "app_id": 4406280,
                "movie_id": 257291511,
                "from_ms": 10000,
                "to_ms": 25000,
                "max_height": 720,
            },
        )
        asset = media["result"]["assets"][0]
        await call(
            "inspect_source_frames",
            {"request": {"asset_id": asset["id"], "count": 3}},
            label="source-sheet",
        )
        lines = [
            {"id": "hook", "text": "Would you play this alone?"},
            {
                "id": "feature",
                "text": "You and your friends are trapped in a cabin. Every card changes the rooms around you. Can you escape together?",
            },
        ]
        narration = await task(
            "narration",
            {
                "type": "prepare_narration",
                "project_id": project["id"],
                "lines": lines,
                "language": "en",
                "voice_id": "M2",
            },
        )
        request = {
            "expected_revision": project["revision"],
            "narration_task_id": narration["id"],
            "profile": {"width": 360, "height": 640, "fps": 30},
            "series_title": "MCP / PRODUCTION TEST",
            "beats": [
                {
                    "id": "hook",
                    "role": "hook",
                    "title": "PLAYING ALONE?",
                    "shots": [{"asset_id": asset["id"]}],
                },
                {
                    "id": "feature",
                    "role": "feature",
                    "title": "THE CABIN GAME",
                    "subtitle": "1–4 players",
                    "shots": [{"asset_id": asset["id"]}, {"asset_id": asset["id"], "source_in_ms": 6000}],
                },
            ],
        }
        plan = await call("compose_showcase", {"project_id": project["id"], "request": request}, label="plan")
        if not plan["layout"]["passed"]:
            raise RuntimeError("Review caption layout before committing")
        score = await task(
            "score",
            {
                "type": "generate_score",
                "project_id": project["id"],
                "duration_ms": plan["project"]["duration_ms"],
                "mood": "horror",
                "accents_ms": [3000],
            },
        )
        saved = await call(
            "compose_showcase",
            {
                "project_id": project["id"],
                "request": {
                    **request,
                    "dry_run": False,
                    "music_asset_id": score["result"]["assets"][0]["id"],
                },
            },
            label="composed",
        )
        revision = saved["project"]["revision"]
        await call(
            "compare_project_revisions",
            {
                "project_id": project["id"],
                "request": {"before_revision": project["revision"], "after_revision": revision},
            },
            label="revision-diff",
        )
        await call(
            "inspect_caption_layout",
            {"request": {"project_id": project["id"], "revision": revision}},
            label="layout",
        )
        job = await call(
            "start_render",
            {"project_id": project["id"], "expected_revision": revision},
            label="render-started",
        )
        while job["status"] in ("queued", "rendering"):
            job = await call(
                "wait_for_render",
                {"job_id": job["id"], "request": {"timeout_seconds": 20}},
                label="render",
            )
            print("render", job["status"], job["progress"], flush=True)
        if job["status"] != "completed":
            raise RuntimeError(json.dumps(job))
        await call(
            "render_frames",
            {
                "project_id": project["id"],
                "job_id": job["id"],
                "timestamps_ms": [1000, 4000, 8000, saved["project"]["duration_ms"] - 200],
            },
            label="final-sheet",
        )
        verification = await task(
            "verification",
            {
                "type": "verify_render",
                "job_id": job["id"],
                "transcribe": True,
                "reference_text": " ".join(line["text"] for line in lines),
            },
        )
        delivery = await task(
            "delivery",
            {"type": "package_delivery", "job_id": job["id"], "verification_task_id": verification["id"]},
        )
        print(
            json.dumps(
                {
                    "project_url": f"{args.origin}/#/projects/{project['id']}",
                    "delivery": delivery["result"]["delivery"],
                    "visual_review_required": True,
                },
                indent=2,
            ),
            flush=True,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://localhost:8080")
    parser.add_argument("--output-dir", type=Path, required=True)
    asyncio.run(run(parser.parse_args()))
