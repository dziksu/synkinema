"""Import official sources and generate English narration via Synkinema's public API."""

import json
import math
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
TAKES = [
    ("hook-a", "Still wondering what to play?"),
    ("hook-b", "Try these three."),
    ("allumeria-a", "In Allumeria, you and your friends explore a blocky world."),
    ("allumeria-b", "Build your own base, and take on bosses together."),
    ("wheelmates-a", "In Wheelmates, you and a friend become tiny R C cars."),
    ("wheelmates-b", "Solve puzzles together, in a scientist's oversized house."),
    ("wanderburg-a", "In Wanderburg, you command a castle on wheels."),
    ("wanderburg-b", "Devour villages, stack ridiculous weapons, and become a rolling nightmare."),
    ("outro-a", "Three new Steam games I think could blow up."),
    ("outro-b", "Which one are you playing first?"),
]


def main():
    manifest_path = ROOT / "out/manifest.json"
    state = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    def save():
        manifest_path.write_text(json.dumps(state, ensure_ascii=False, indent=2))

    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=180) as client:

        def call(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            if response.is_error:
                raise RuntimeError(f"{response.status_code}: {response.text}")
            return response.json()

        if "project" not in state:
            state["project"] = call(
                "POST",
                "/api/projects",
                json={
                    "name": "NEXT UP • 3 Steam breakout picks • EN",
                    "brief": "A fast English editorial reel: 3 fresh Steam releases with breakout potential. Opinion, not a prediction or sales ranking. Official trailer excerpts, local Supertonic narration, kinetic captions, original music and CC0 SFX. Games verified 2026-09-12: Allumeria (2026-08-28, Early Access, online co-op), WheelMates (2026-09-01, two-player co-op), Wanderburg (2026-09-08, Early Access, solo).",
                    "script": "\n\n".join(t[1] for t in TAKES),
                },
            )
            state["assets"] = {}
            state["takes"] = {}
            state["folders"] = {}
            save()
        pid = state["project"]["id"]
        for name in ["Official trailers", "English voiceover", "Music and accents"]:
            if name not in state["folders"]:
                state["folders"][name] = call(
                    "POST", "/api/asset-folders", json={"name": name, "project_id": pid}
                )["id"]
                save()
        for key in ["allumeria", "wheelmates", "wanderburg"]:
            if key in state["assets"]:
                continue
            path = ROOT / "assets" / f"{key}-official-trailer.mp4"
            if key == "wanderburg":
                path = ROOT.parent / "steam-short/assets/wanderburg-official-trailer.mp4"
            meta = json.loads((ROOT / f"{key}-steam.json").read_text())
            with path.open("rb") as source:
                asset = call(
                    "POST",
                    "/api/assets",
                    files={"file": (f"{meta['name']} • Official trailer.mp4", source, "video/mp4")},
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Official trailers"],
                        "tags": json.dumps(["steam", "official-trailer", key]),
                        "source": f"https://store.steampowered.com/app/{meta['steam_appid']}/ | {meta['movies'][0]['name']}",
                        "license": f"Official promotional footage © {' / '.join(meta['developers'] + meta['publishers'])}. Not openly licensed. Editorial excerpt; no endorsement or publication implied.",
                    },
                )
            state["assets"][key] = asset
            save()
            print("IMPORTED", key, asset["id"], flush=True)
        for key, text in TAKES:
            if key in state["takes"]:
                continue
            result = call(
                "POST",
                "/api/voices/generate",
                json={
                    "provider": "supertonic",
                    "language": "en",
                    "voice_id": "M2",
                    "text": text,
                    "steps": 12,
                    "speed": 1.16,
                    "project_id": pid,
                },
            )
            asset = result["asset"]
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/metadata",
                json={
                    "expected_version": asset["version"],
                    "name": f"VO • {key}.wav",
                    "tags": asset["tags"] + ["steam-breakout-en", key],
                    "source": asset["source"],
                    "license": asset["license"],
                },
            )
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/location",
                json={"project_id": pid, "folder_id": state["folders"]["English voiceover"]},
            )
            response = client.get(asset["url"])
            response.raise_for_status()
            path = ROOT / "assets" / f"voice-{key}.wav"
            path.write_bytes(response.content)
            samples, rate = sf.read(path)
            if samples.ndim > 1:
                samples = np.mean(samples, axis=1)
            size = round(rate * 0.01)
            energies = np.array(
                [np.sqrt(np.mean(samples[i : i + size] ** 2)) for i in range(0, len(samples), size)]
            )
            audible = np.flatnonzero(energies > 10 ** (-42 / 20))
            start = max(0, round(audible[0] * 10 - 55))
            end = min(asset["duration_ms"], round((audible[-1] + 1) * 10 + 95))
            duration = math.floor((end - start) / (1000 / 30)) * (1000 / 30)
            state["takes"][key] = {
                "text": text,
                "asset": asset,
                "source_in_ms": start,
                "duration_ms": round(duration),
                "raw_duration_ms": asset["duration_ms"],
            }
            save()
            print("VOICE", key, start, round(duration), flush=True)
        print("PROJECT", pid, flush=True)


if __name__ == "__main__":
    main()
