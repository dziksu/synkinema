"""Wait for an existing job, collect the decoded MP4, and verify basic export metadata."""

import argparse
import json
import subprocess
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--quality", choices=["preview", "final"], default="final")
args = parser.parse_args()
job_path = ROOT / "out" / f"{args.quality}-job.json"
job = json.loads(job_path.read_text())
previous = None
with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as api:
    while True:
        response = api.get(f"/api/jobs/{job['id']}")
        response.raise_for_status()
        job = response.json()
        job_path.write_text(json.dumps(job, indent=2))
        state = (job["status"], job["phase"], round(job["progress"] * 100))
        if state != previous:
            print(*state, flush=True)
            previous = state
        if job["status"] in ["failed", "cancelled"]:
            raise RuntimeError(job.get("error") or job["status"])
        if job["status"] == "completed":
            break
        time.sleep(15)
    target = ROOT / "out" / f"next-up-horror-{args.quality}.mp4"
    with api.stream("GET", job["output_url"]) as response:
        response.raise_for_status()
        with target.open("wb") as video:
            for chunk in response.iter_bytes():
                video.write(chunk)
    metadata = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(target)], text=True
    )
    (ROOT / "out" / f"{args.quality}-ffprobe.json").write_text(metadata)
    decoded = json.loads(metadata)
    stream = next(s for s in decoded["streams"] if s["codec_type"] == "video")
    if args.quality == "final":
        assert (stream["width"], stream["height"], stream["r_frame_rate"]) == (1080, 1920, "30/1")
    assert 35 <= float(decoded["format"]["duration"]) < 60
    print(
        "OUTPUT",
        str(target),
        "DURATION",
        decoded["format"]["duration"],
        "BYTES",
        target.stat().st_size,
        flush=True,
    )
