"""Fetch selected Commons originals. Attribution verified on file pages 2026-09-11."""

import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1] / "examples" / "polish-wildlife"
FILES = [
    (
        "hamster",
        "C.cricetus Lublin1.jpg",
        "Agnieszka Szeląg",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0/",
        "European hamster photographed in Lublin, Poland.",
    ),
    (
        "warbler",
        "Aquatic warbler - Waterrietzanger - Acrocephalus paludicola.jpg",
        "Bouke ten Cate",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0/",
        "Aquatic warbler in Biebrza marshes, Poland.",
    ),
    (
        "porpoise",
        "Harbor Porpoise Fjord Baelt Denmark.JPG",
        "Rene (da.wikipedia)",
        "Public domain",
        "https://commons.wikimedia.org/wiki/File:Harbor_Porpoise_Fjord_Baelt_Denmark.JPG",
        "Harbour porpoise at Fjord & Bælt Centre, Denmark. Species illustration, not a photograph of the Baltic Proper population.",
    ),
]


def main():
    (ROOT / "assets").mkdir(parents=True, exist_ok=True)
    manifest = []
    for key, title, author, license, license_url, description in FILES:
        normalized = title.replace(" ", "_")
        digest = hashlib.md5(normalized.encode()).hexdigest()
        url = f"https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{quote(normalized)}"
        asset = {
            "key": key,
            "filename": key + ".jpg",
            "source": "https://commons.wikimedia.org/wiki/File:" + quote(normalized),
            "download": url,
            "author": author,
            "license": license,
            "license_url": license_url,
            "description": description,
            "changes": "Crop, zoom, color grading and text overlays in composition.",
        }
        destination = ROOT / "assets" / asset["filename"]
        if not destination.exists():
            subprocess.run(
                ["curl", "-L", "--fail", "--retry", "2", "--max-time", "90", url, "-o", str(destination)],
                check=True,
            )
        asset["sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
        manifest.append(asset)
        print(f"{key}: {destination.stat().st_size} bytes · {license}", flush=True)
    (ROOT / "assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
