"""Inspect a completed Synkinema render, never a reconstructed local composition."""

import argparse
import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    args = parser.parse_args()
    state = json.loads((ROOT / "out/manifest.json").read_text())
    pid = state["project"]["id"]
    job = json.loads((ROOT / "out" / f"{args.quality}-job.json").read_text())
    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as c:
        previous = None
        deadline = time.monotonic() + 900
        while job["status"] not in ["completed", "failed", "cancelled"] and time.monotonic() < deadline:
            time.sleep(2)
            r = c.get(f"/api/jobs/{job['id']}")
            r.raise_for_status()
            job = r.json()
            status = (job["status"], job.get("phase"))
            if status != previous:
                print(status, job.get("progress"), flush=True)
                previous = status
        assert job["status"] == "completed", job
        (ROOT / "out" / f"{args.quality}-job.json").write_text(json.dumps(job, indent=2))
        r = c.get(job["output_url"])
        r.raise_for_status()
        path = ROOT / "out" / f"next-up-steam-{args.quality}.mp4"
        path.write_bytes(r.content)

        def post(path, data):
            r = c.post(path, json=data)
            r.raise_for_status()
            return r.json()

        times = [500, 1700, 3300, 5200, 7600, 9300, 12000, 14400, 15800, 18000, 20700, 23200, 25300, 26700]
        sheet = post(f"/api/projects/{pid}/inspection/sheet", {"job_id": job["id"], "timestamps_ms": times})
        image = c.get(sheet["url"])
        image.raise_for_status()
        (ROOT / "out" / f"{args.quality}-contact-sheet.jpg").write_bytes(image.content)
        report = post(f"/api/projects/{pid}/inspection/audio", {"job_id": job["id"]})
        (ROOT / "out" / f"{args.quality}-audio.json").write_text(json.dumps(report, indent=2))
        r = c.get(f"/api/projects/{pid}/captions.srt")
        r.raise_for_status()
        (ROOT / "out" / "all-text.srt").write_bytes(r.content)
        print(
            json.dumps(
                {
                    "job": job["id"],
                    "file": str(path),
                    "bytes": path.stat().st_size,
                    "integrated_lufs": report["integrated_lufs"],
                    "true_peak_dbtp": report["true_peak_dbtp"],
                    "warnings": report["warnings"],
                    "clipping_windows": sum(w["clipping"] for w in report["windows"]),
                }
            ),
            flush=True,
        )
        if args.quality == "final":
            assert not report["warnings"], report["warnings"]
            assert not any(w["clipping"] for w in report["windows"])
            assert (job["metadata"]["width"], job["metadata"]["height"]) == (1080, 1920)


if __name__ == "__main__":
    main()
