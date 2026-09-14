"""Download official Steam trailer video renditions; soundtrack is omitted."""

import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urljoin

import httpx

ROOT = Path(__file__).resolve().parent
(ROOT / "out").mkdir(exist_ok=True)
(ROOT / "assets").mkdir(exist_ok=True)
apps = {"cabin": 4406280, "ward": 3843760, "halloween": 3219630}
for key, appid in apps.items():
    path = ROOT / "out" / f"{key}-steam.json"
    if not path.exists():
        response = httpx.get(
            "https://store.steampowered.com/api/appdetails",
            params={"appids": appid, "l": "english"},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()[str(appid)]
        assert payload["success"], f"Steam data unavailable: {appid}"
        path.write_text(json.dumps(payload["data"], indent=2))
sources = {}
for key, meta_key, movie_id, limit in [
    ("cabin", "cabin", 257291511, None),
    ("ward", "ward", 257391019, None),
    ("halloween", "halloween", 257416913, None),
    ("halloween_gameplay", "halloween", 257315288, 100),
]:
    meta = json.loads((ROOT / "out" / f"{meta_key}-steam.json").read_text())
    movie = next(movie for movie in meta["movies"] if movie["id"] == movie_id)
    master = movie["hls_h264"]
    r = httpx.get(master, timeout=60)
    r.raise_for_status()
    lines = r.text.splitlines()
    variants = []
    for i, line in enumerate(lines):
        match = re.search(r"RESOLUTION=(\d+)x(\d+)", line)
        if match:
            w, h = map(int, match.groups())
            variants.append((w, h, urljoin(master, lines[i + 1])))
    selected = max((v for v in variants if v[1] <= 1080), key=lambda v: v[0] * v[1])
    path = ROOT / "assets" / f"{key}-official-trailer.mp4"
    if not path.exists():
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                selected[2],
                *(["-t", str(limit)] if limit else []),
                "-map",
                "0:v:0",
                "-an",
                "-c:v",
                "copy",
                "-movflags",
                "+faststart",
                str(path),
            ],
            check=True,
        )
    probe = json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
        )
    )
    sources[key] = {
        "name": meta["name"],
        "steam_appid": meta["steam_appid"],
        "release_date": meta["release_date"],
        "developers": meta["developers"],
        "publishers": meta["publishers"],
        "page": f"https://store.steampowered.com/app/{meta['steam_appid']}/?l=english",
        "movie": movie,
        "download_url": selected[2],
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "probe": probe,
    }
    (ROOT / "out/sources.json").write_text(json.dumps(sources, indent=2))
    print(key, selected[:2], probe["format"]["duration"], probe["format"]["size"], flush=True)
