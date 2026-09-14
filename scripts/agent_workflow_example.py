"""Run the documented import -> edit -> render -> inspect workflow against REST or MCP.

Creates a NEW project. No paid providers. Requires a local video file with audio.
Example: .venv/bin/python scripts/agent_workflow_example.py --transport mcp \
    --input examples/editor-qa/assets/bunny-las.mp4 --output-dir /tmp/synkinema-agent-mcp
"""

import argparse
import asyncio
import base64
import json
import os
import time
from contextlib import AsyncExitStack
from pathlib import Path

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def run(args):
    origin = args.origin.rstrip("/")
    headers = {}
    if token := os.environ.get("SYNKINEMA_API_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    async with AsyncExitStack() as stack:
        http = await stack.enter_async_context(
            httpx.AsyncClient(base_url=origin, headers=headers, timeout=args.timeout)
        )

        async def rest(method, path, **kwargs):
            response = await http.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()

        session = None
        if args.transport == "mcp":
            read, write, _ = await stack.enter_async_context(
                streamablehttp_client(f"{origin}/mcp/", headers=headers)
            )
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()

        async def call(name, arguments=None):
            result = await session.call_tool(name, arguments or {})
            if result.isError:
                raise RuntimeError(f"{name}: {result.content}")
            return result

        async def data(name, arguments=None):
            result = await call(name, arguments)
            if result.structuredContent is not None:
                return result.structuredContent
            return json.loads(next(c.text for c in result.content if c.type == "text"))

        if session:
            await call("get_agent_guide")
            await data("get_project_schema")
            await data("get_operation_reference", {"operation": "append_clip"})
            await data("get_capabilities")
        else:
            guide = await http.get("/api/agent/guide")
            guide.raise_for_status()
            await rest("GET", "/api/schema/project")
            await rest("GET", "/api/schema/operations", params={"operation": "append_clip"})
            await rest("GET", "/api/capabilities")

        if session and args.input.stat().st_size <= 12 * 1024**2:
            asset = await data(
                "import_asset",
                {
                    "filename": args.input.name,
                    "data_base64": base64.b64encode(args.input.read_bytes()).decode(),
                    "tags": ["agent-workflow-example"],
                },
            )
        else:
            with args.input.open("rb") as source:
                asset = await rest(
                    "POST",
                    "/api/assets",
                    files={"file": (args.input.name, source, "video/mp4")},
                    data={"tags": '["agent-workflow-example"]'},
                )
        duration = args.seconds * 1000
        if asset["kind"] != "video" or not asset["has_audio"] or (asset["duration_ms"] or 0) < duration:
            raise ValueError("Choose a video with audio at least --seconds long")
        name = f"Agent {args.transport.upper()} workflow example"
        project = (
            await data("create_project", {"name": name})
            if session
            else await rest("POST", "/api/projects", json={"name": name})
        )
        project_id = project["id"]

        half = duration // 2
        overlap = min(300, half // 3)
        steps = [
            {
                "type": "update_project",
                "payload": {
                    "profile": {
                        "name": "Agent example",
                        "kind": "video",
                        "width": 640,
                        "height": 360,
                        "fps": 30,
                    }
                },
            },
            {
                "type": "append_clip",
                "payload": {
                    "track_id": "video",
                    "clip": {
                        "id": "opening",
                        "asset_id": asset["id"],
                        "name": "Opening",
                        "duration_ms": half,
                    },
                },
            },
            {
                "type": "duplicate_clip",
                "payload": {"track_id": "video", "clip_id": "opening", "new_clip_id": "closing"},
            },
            {
                "type": "update_clip",
                "payload": {
                    "track_id": "video",
                    "clip_id": "closing",
                    "changes": {"source_in_ms": half, "name": "Closing"},
                },
            },
            {
                "type": "set_transition",
                "payload": {
                    "track_id": "video",
                    "clip_id": "closing",
                    "transition": {"type": "crossfade", "duration_ms": overlap},
                },
            },
            {
                "type": "extract_audio",
                "payload": {
                    "track_id": "video",
                    "clip_id": "opening",
                    "target_track_id": "voice",
                    "new_clip_id": "opening-audio",
                },
            },
            {
                "type": "extract_audio",
                "payload": {
                    "track_id": "video",
                    "clip_id": "closing",
                    "target_track_id": "voice",
                    "new_clip_id": "closing-audio",
                },
            },
            {
                "type": "append_clip",
                "payload": {
                    "track_id": "titles",
                    "clip": {
                        "id": "title",
                        "text": "Życie ma znaczenie.",
                        "duration_ms": min(3000, duration - overlap),
                        "fade_in_ms": 300,
                        "fade_out_ms": 400,
                    },
                },
            },
        ]
        batch = {"expected_revision": project["revision"], "operations": steps, "dry_run": True}

        async def apply_batch():
            return (
                await data("apply_operations", {"project_id": project_id, "request": batch})
                if session
                else await rest("POST", f"/api/projects/{project_id}/operations/batch", json=batch)
            )

        preview = await apply_batch()
        assert preview["committed"] is False
        current = await rest("GET", f"/api/projects/{project_id}")
        assert current["revision"] == project["revision"]
        batch["dry_run"] = False
        committed = await apply_batch()
        assert committed["committed"] and committed["project"] == preview["project"]
        project = committed["project"]
        duration = project["duration_ms"]
        report = (
            await data("validate_project", {"project_id": project_id, "revision": project["revision"]})
            if session
            else await rest(
                "GET", f"/api/projects/{project_id}/preflight", params={"revision": project["revision"]}
            )
        )
        assert report["valid"] and not report["warnings"], report
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "preflight.json").write_text(json.dumps(report, indent=2))
        (args.output_dir / "batch.json").write_text(json.dumps(batch, indent=2, ensure_ascii=False))
        (args.output_dir / "project.json").write_text(json.dumps(project, indent=2, ensure_ascii=False))
        request = {"expected_revision": project["revision"], "quality": args.quality}
        job = (
            await data("start_render", {"project_id": project_id, **request})
            if session
            else await rest("POST", f"/api/projects/{project_id}/renders", json=request)
        )
        deadline = time.monotonic() + args.timeout
        while job["status"] in ("queued", "running"):
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Job {job['id']} still active; query it before submitting another render")
            await asyncio.sleep(1)
            job = (
                await data("get_render_progress", {"job_id": job["id"]})
                if session
                else await rest("GET", f"/api/jobs/{job['id']}")
            )
        if job["status"] != "completed":
            raise RuntimeError(f"Render {job['status']}: {job.get('error')}")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        response = await http.get(job["output_url"])
        response.raise_for_status()
        (args.output_dir / "film.mp4").write_bytes(response.content)
        if session:
            for tool, filename, arguments in [
                (
                    "render_frames",
                    "contact-sheet.jpg",
                    {
                        "project_id": project_id,
                        "revision": project["revision"],
                        "timestamps_ms": [500, duration // 2, duration - 100],
                    },
                ),
                ("analyze_audio", "audio-map.png", {"project_id": project_id, "job_id": job["id"]}),
            ]:
                result = await call(tool, arguments)
                images = [c for c in result.content if c.type == "image"]
                if not images:
                    raise RuntimeError(f"{tool} did not return ImageContent")
                (args.output_dir / filename).write_bytes(base64.b64decode(images[0].data))
                (args.output_dir / f"{tool}.json").write_text(
                    json.dumps(
                        [c.model_dump() for c in result.content if c.type != "image"],
                        ensure_ascii=False,
                        indent=2,
                    )
                )
        else:
            for endpoint, filename, payload in [
                (
                    "sheet",
                    "contact-sheet.jpg",
                    {"revision": project["revision"], "timestamps_ms": [500, duration // 2, duration - 100]},
                ),
                ("audio", "audio-map.png", {"job_id": job["id"]}),
            ]:
                report = await rest("POST", f"/api/projects/{project_id}/inspection/{endpoint}", json=payload)
                response = await http.get(report.get("url") or report["map_url"])
                response.raise_for_status()
                (args.output_dir / filename).write_bytes(response.content)
                (args.output_dir / f"{endpoint}.json").write_text(
                    json.dumps(report, ensure_ascii=False, indent=2)
                )
        result = {
            "project_id": project_id,
            "revision": project["revision"],
            "job_id": job["id"],
            "status": job["status"],
            "output_url": origin + job["output_url"],
            "visual_review_required": True,
        }
        (args.output_dir / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://localhost:8080")
    parser.add_argument("--transport", choices=["rest", "mcp"], default="rest")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    parser.add_argument("--seconds", type=int, default=4)
    parser.add_argument("--timeout", type=float, default=180)
    args = parser.parse_args()
    if args.seconds < 1:
        parser.error("--seconds must be positive")
    asyncio.run(run(args))
