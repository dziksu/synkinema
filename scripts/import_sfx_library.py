"""Download the curated Kenney CC0 catalogue and import reusable tagged audio assets."""

import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1] / "examples" / "sfx-library"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8080")
    args = parser.parse_args()
    catalogue = json.loads((ROOT / "catalog.json").read_text())
    for folder in ("source", "assets"):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    records = []
    with httpx.Client(timeout=90, follow_redirects=True) as client:
        for key, pack in catalogue["packs"].items():
            archive = ROOT / "source" / f"{key}.zip"
            if not archive.exists():
                response = client.get(pack["url"])
                response.raise_for_status()
                archive.write_bytes(response.content)
            with zipfile.ZipFile(archive) as bundle:
                (ROOT / f"LICENSE-{key}.txt").write_bytes(bundle.read("License.txt"))
        for item in catalogue["items"]:
            pack, original = item["pack"], item["original"]
            path = ROOT / "assets" / f"{pack}-{original}"
            with zipfile.ZipFile(ROOT / "source" / f"{pack}.zip") as bundle:
                path.write_bytes(bundle.read(f"Audio/{original}"))
            source = catalogue["packs"][pack]["page"] + f" | Audio/{original}"
            changes = None
            if item.get("pad_to_ms"):
                padded = path.with_name(path.stem + "-padded.wav")
                subprocess.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-y",
                        "-i",
                        str(path),
                        "-af",
                        "apad",
                        "-t",
                        str(item["pad_to_ms"] / 1000),
                        str(padded),
                    ],
                    check=True,
                )
                path = padded
                changes = f"Silence tail added; original sound unchanged. Total {item['pad_to_ms']} ms."
                source += " | " + changes
            response = client.post(
                args.server.rstrip("/") + "/api/assets",
                files={"file": (item["name"], path.read_bytes(), "application/octet-stream")},
                data={
                    "tags": json.dumps(item["tags"], ensure_ascii=False),
                    "source": source,
                    "license": "CC0 1.0 Universal — Kenney",
                },
            )
            response.raise_for_status()
            asset = response.json()
            records.append(
                {
                    "pack": pack,
                    "original": original,
                    "local_path": str(path.relative_to(ROOT)),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "asset": asset,
                    "changes": changes,
                }
            )
            print(f"{asset['name']}: {asset['duration_ms']} ms · {asset['id']}", flush=True)
    (ROOT / "manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
