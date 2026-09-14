"""Import licensed sources and generate English voice takes through Synkinema API."""

import hashlib
import json
import re
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
SOURCES = {
    "rain": ("Window on a rainy day", "window-on-a-rainy-day-2846", 2846),
    "city": (
        "Night walk through the streets of a big city",
        "night-walk-through-the-streets-of-a-big-city-40746",
        40746,
    ),
    "bokeh": (
        "Vertical video of bokeh defocused lights of an avenue at night",
        "vertical-video-of-bokeh-defocused-lights-of-an-avenue-at-44694",
        44694,
    ),
    "traffic": (
        "Out of focus view of car lights at night",
        "out-of-focus-view-of-car-lights-at-night-44702",
        44702,
    ),
}


def main():
    manifest = ROOT / "out/manifest.json"
    story = json.loads((ROOT / "story.json").read_text())
    state = (
        json.loads(manifest.read_text())
        if manifest.exists()
        else {"assets": {}, "takes": {}, "folders": {}, "sources": {}}
    )

    def save():
        manifest.write_text(json.dumps(state, indent=2, ensure_ascii=False))

    with (
        httpx.Client(base_url="http://127.0.0.1:8080", timeout=240) as api,
        httpx.Client(timeout=120, follow_redirects=True) as net,
    ):

        def call(method, path, **kwargs):
            response = api.request(method, path, **kwargs)
            if response.is_error:
                raise RuntimeError(f"{response.status_code}: {response.text}")
            return response.json()

        if "project" not in state:
            state["project"] = call(
                "POST",
                "/api/projects",
                json={
                    "name": "AFTER HOURS • The Girl in His Phone • EN",
                    "brief": story["disclosure"]
                    + " Original relationship-drama thriller with an earned catfishing reveal. English Supertonic narration, licensed Mixkit environmental footage, synchronized captions, original understated score. No real Reddit post or real relationship is depicted.",
                    "script": "\n\n".join(p["text"] for p in story["parts"]),
                    "profile": {
                        "name": "Reel · Full HD · High quality",
                        "kind": "reel",
                        "width": 1080,
                        "height": 1920,
                        "fps": 30,
                        "crf": 18,
                        "target_lufs": -16,
                        "true_peak": -1.5,
                        "normalize": True,
                    },
                },
            )
            save()
        pid = state["project"]["id"]
        for name in ["Licensed night footage", "English narration", "Original sound design"]:
            if name not in state["folders"]:
                state["folders"][name] = call(
                    "POST", "/api/asset-folders", json={"name": name, "project_id": pid}
                )["id"]
                save()
        for key, (title, slug, vid) in SOURCES.items():
            if key in state["assets"]:
                continue
            page = "https://mixkit.co/free-stock-video/" + slug + "/"
            response = net.get(page)
            response.raise_for_status()
            assert "Free Download - 720p Version for Personal" not in response.text, (
                "Restricted source rejected"
            )
            assert "https://mixkit.co/license/#videoFree" in response.text, "Free license must be explicit"
            (ROOT / "out" / f"license-source-{vid}.html").write_text(response.text)
            download_page = net.get(
                f"https://mixkit.co/free-stock-video/download/{vid}/?context=sidebar&type=1080p"
            )
            download_page.raise_for_status()
            url = re.search('data-download--modal-url-value="([^"]+)"', download_page.text)[1]
            path = ROOT / "assets" / f"{key}-mixkit-{vid}.mp4"
            if not path.exists():
                with net.stream("GET", url) as result:
                    result.raise_for_status()
                    with path.open("wb") as stream:
                        for chunk in result.iter_bytes():
                            stream.write(chunk)
            state["sources"][key] = {
                "title": title,
                "page": page,
                "download_url": url,
                "license": "Mixkit Stock Video Free License",
                "license_url": "https://mixkit.co/license/#videoFree",
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "local_path": str(path),
            }
            with path.open("rb") as media:
                state["assets"][key] = call(
                    "POST",
                    "/api/assets",
                    files={"file": (f"{title} · Mixkit.mp4", media, "video/mp4")},
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Licensed night footage"],
                        "tags": json.dumps(["background", "night", "licensed", "relationship-drama-en", key]),
                        "source": page,
                        "license": "Mixkit Stock Video Free License — https://mixkit.co/license/#videoFree. Illustrative environmental footage, no depicted relationship.",
                    },
                )
            save()
            asset = state["assets"][key]
            print("IMPORTED", key, asset["width"], asset["height"], asset["duration_ms"], flush=True)
        for part in story["parts"]:
            key = part["id"]
            if key in state["takes"]:
                continue
            result = call(
                "POST",
                "/api/voices/generate",
                json={
                    "provider": "supertonic",
                    "language": "en",
                    "voice_id": "F1",
                    "text": part["text"],
                    "steps": 12,
                    "speed": 1.08,
                    "project_id": pid,
                },
            )
            asset = result["asset"]
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/metadata",
                json={
                    "expected_version": asset["version"],
                    "name": f"Voice · {key} · Supertonic F1.wav",
                    "tags": asset["tags"] + ["relationship-drama-en", key],
                    "source": asset["source"],
                    "license": asset["license"],
                },
            )
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/location",
                json={"project_id": pid, "folder_id": state["folders"]["English narration"]},
            )
            response = api.get(asset["url"])
            response.raise_for_status()
            path = ROOT / "assets" / f"voice-{key}.wav"
            path.write_bytes(response.content)
            state["takes"][key] = {
                "text": part["text"],
                "chapter": part["chapter"],
                "asset": asset,
                "path": str(path),
            }
            save()
            print("VOICE", key, asset["duration_ms"], flush=True)
        print("PROJECT", pid, flush=True)


if __name__ == "__main__":
    main()
