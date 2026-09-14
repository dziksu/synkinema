"""Create a private showcase and validated English voice assets via Synkinema API."""

import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent


def main():
    manifest = ROOT / "out/manifest.json"
    story = json.loads((ROOT / "script.json").read_text())
    sources = json.loads((ROOT / "out/sources.json").read_text())
    state = (
        json.loads(manifest.read_text()) if manifest.exists() else {"assets": {}, "takes": {}, "folders": {}}
    )

    def save():
        manifest.write_text(json.dumps(state, ensure_ascii=False, indent=2))

    with httpx.Client(base_url="http://127.0.0.1:8080", timeout=300) as api:

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
                    "name": "NEXT UP • 3 horrors you shouldn't play alone • EN",
                    "brief": "An English editorial horror showcase. Three new Steam releases verified 12 September 2026: the cabin game (27 Aug, Early Access, 1–4 players), Ashes of the Damned: The Forgotten Ward (19 Aug, solo), Halloween: The Game (8 Sep, multiplayer + solo). The scare theme does not imply every game has co-op. Official trailer excerpts, AI-generated local Supertonic voice, original synthetic score. No sponsorship.",
                    "script": "\n\n".join(story.values()),
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
        for name in ["Official Steam trailers", "English narrator", "Original horror score"]:
            if name not in state["folders"]:
                state["folders"][name] = call(
                    "POST", "/api/asset-folders", json={"name": name, "project_id": pid}
                )["id"]
                save()
        for key, source in sources.items():
            if key in state["assets"]:
                continue
            with (ROOT / "assets" / f"{key}-official-trailer.mp4").open("rb") as video:
                state["assets"][key] = call(
                    "POST",
                    "/api/assets",
                    files={
                        "file": (
                            source["name"] + " • " + source["movie"]["name"] + ".mp4",
                            video,
                            "video/mp4",
                        )
                    },
                    data={
                        "project_id": pid,
                        "folder_id": state["folders"]["Official Steam trailers"],
                        "tags": json.dumps(["horror", "steam", "official-trailer", "steam-horror-en", key]),
                        "source": source["page"] + " | " + source["movie"]["name"],
                        "license": "Official promotional footage © "
                        + " / ".join(dict.fromkeys(source["developers"] + source["publishers"]))
                        + ". Not openly licensed. Short editorial excerpts; no endorsement or publication implied.",
                    },
                )
            save()
            print("IMPORTED", key, state["assets"][key]["id"], flush=True)
        for key, text in story.items():
            if key in state["takes"]:
                continue
            asset = call(
                "POST",
                "/api/voices/generate",
                json={
                    "provider": "supertonic",
                    "language": "en",
                    "voice_id": "M2",
                    "text": text,
                    "steps": 12,
                    "speed": 1.08,
                    "project_id": pid,
                },
            )["asset"]
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/metadata",
                json={
                    "expected_version": asset["version"],
                    "name": f"Voice · {key} · Supertonic M2.wav",
                    "tags": asset["tags"] + ["steam-horror-en", key],
                    "source": asset["source"],
                    "license": asset["license"],
                },
            )
            asset = call(
                "PUT",
                f"/api/assets/{asset['id']}/location",
                json={"project_id": pid, "folder_id": state["folders"]["English narrator"]},
            )
            response = api.get(asset["url"])
            response.raise_for_status()
            path = ROOT / "assets" / f"voice-{key}.wav"
            path.write_bytes(response.content)
            state["takes"][key] = {"text": text, "asset": asset, "path": str(path)}
            save()
            print("VOICE", key, asset["duration_ms"], flush=True)
        print("PROJECT", pid, flush=True)


if __name__ == "__main__":
    main()
