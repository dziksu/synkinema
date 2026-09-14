"""Verify final example through MCP, independently probe and fully decode the MP4."""

import asyncio
import base64
import json
import subprocess
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

ROOT = Path(__file__).resolve().parents[1] / "examples" / "polish-wildlife"


async def main():
    run = json.loads((ROOT / "run.json").read_text())
    pid = run["project_id"]
    jid = run["job_id"]
    async with (
        streamablehttp_client("http://127.0.0.1:8080/mcp/") as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        progress = await session.call_tool("get_render_progress", {"job_id": jid})
        job = json.loads(progress.content[0].text)
        assert job["status"] == "completed"
        images = await session.call_tool(
            "render_frames", {"project_id": pid, "timestamps_ms": [800, 6200, 15300, 28400]}
        )
        if images.isError:
            raise RuntimeError(str(images.content))
        image = next(c for c in images.content if c.type == "image")
        (ROOT / "out" / "mcp-contact-sheet.jpg").write_bytes(base64.b64decode(image.data))
        audio = await session.call_tool("analyze_audio", {"project_id": pid, "job_id": jid})
        if audio.isError:
            raise RuntimeError(str(audio.content))
        result = json.loads(next(c.text for c in audio.content if c.type == "text"))
        if isinstance(result, list):
            result = result[0]
        assert abs(result["integrated_lufs"] + 16) < 1
        assert not result["warnings"]
        assert len(result["windows"]) == 80
        assert any(c.type == "image" for c in audio.content)
    video = ROOT / "out" / "zanim-zapadnie-cisza.mp4"
    metadata = json.loads(
        await asyncio.to_thread(
            subprocess.check_output,
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(video)],
        )
    )
    vs = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    au = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
    assert (vs["width"], vs["height"], vs["nb_frames"]) == (1080, 1920, "1200")
    assert abs(float(au["duration"]) - 40) < 0.1
    decode = await asyncio.to_thread(
        subprocess.run,
        ["ffmpeg", "-v", "error", "-i", str(video), "-f", "null", "-"],
        capture_output=True,
        check=True,
    )
    assert not decode.stderr
    report = {
        "project_id": pid,
        "revision": job["revision"],
        "job_id": jid,
        "duration_seconds": 40,
        "frames": 1200,
        "width": 1080,
        "height": 1920,
        "video_codec": vs["codec_name"],
        "audio_codec": au["codec_name"],
        "integrated_lufs": result["integrated_lufs"],
        "true_peak_dbtp": result["true_peak_dbtp"],
        "render_seconds": job["render_seconds"],
        "mcp_image_content": True,
        "audio_windows": len(result["windows"]),
        "full_decode_errors": 0,
    }
    (ROOT / "out" / "verification.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


asyncio.run(main())
