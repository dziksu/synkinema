import asyncio
import io
import json
import subprocess

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from synkinema.app import create_app
from synkinema.media import cached_text_layer
from synkinema.models import Clip, OutputProfile, Project, Track
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store


def test_private_media_folders_and_dedup(tmp_path):
    service = Service(Store(tmp_path / "data"))
    p = service.create(Project(name="Private"))
    other = service.create(Project(name="Other"))
    folder = service.create_folder("Brand assets", p.id)
    with pytest.raises(ValueError, match="already exists"):
        service.create_folder("brand assets", p.id)
    path = tmp_path / "logo.png"
    Image.new("RGB", (64, 64), "red").save(path)
    asset = service.import_file(path, project_id=p.id, folder_id=folder["id"])
    assert not service.assets() and not service.assets(project_id=other.id)
    assert [a["id"] for a in service.assets(project_id=p.id, folder_id=folder["id"])] == [asset["id"]]
    with pytest.raises(ValueError, match="belong"):
        service.locate_asset(asset["id"], other.id, folder["id"])
    assert service.import_file(path, project_id=other.id)["id"] == asset["id"]
    assert not service.assets()
    service.locate_asset(asset["id"], folder_id="images")
    assert service.assets(folder_id="images")[0]["id"] == asset["id"]
    service.rename_folder(folder["id"], "Logos")
    assert service.folders(p.id)[0]["name"] == "Logos"
    assert service.get(p.id).revision == 1
    assert len(list((tmp_path / "data/library").glob("*"))) == 1
    # Referenced shared media also appears in a project's collection.
    linked = service.create(
        Project(name="Linked", tracks=[Track(name="Video", kind="video", clips=[Clip(asset_id=asset["id"])])])
    )
    assert service.assets(project_id=linked.id)[0]["id"] == asset["id"]
    # Reopening keeps chosen membership, including renamed folders.
    again = Service(Store(tmp_path / "data"))
    assert again.folders(p.id)[0]["name"] == "Logos"
    assert again.asset(asset["id"])["locations"][p.id] == folder["id"]


def test_existing_library_migrates_once(tmp_path):
    store = Store(tmp_path / "data")
    store.execute("DELETE FROM schema_version WHERE version=2")
    store.execute(
        "INSERT INTO assets VALUES('old',:doc,'checksum','2026')",
        doc=json.dumps({"id": "old", "kind": "audio", "tags": ["sfx"]}),
    )
    migrated = Service(Store(tmp_path / "data"))
    assert migrated.asset("old")["locations"] == {"library": "sound-effects"}


def test_folder_rest_and_mcp_contract(tmp_path):
    with TestClient(create_app(tmp_path / "data", start_worker=False)) as client:
        p = client.post("/api/projects", json={"name": "Private"}).json()
        folder = client.post("/api/asset-folders", json={"name": "Logos", "project_id": p["id"]})
        assert folder.status_code == 201
        assert (
            client.patch("/api/asset-folders/" + folder.json()["id"], json={"name": "Brand"}).status_code
            == 200
        )
        data = io.BytesIO()
        Image.new("RGBA", (80, 80), "red").save(data, format="PNG")
        asset = client.post(
            "/api/assets",
            files={"file": ("logo.png", data.getvalue(), "image/png")},
            data={"project_id": p["id"], "folder_id": folder.json()["id"]},
        ).json()
        assert client.get("/api/assets").json() == []
        assert client.get("/api/assets", params={"project_id": p["id"]}).json()[0]["id"] == asset["id"]
        assert (
            client.put("/api/assets/" + asset["id"] + "/location", json={"folder_id": "images"}).status_code
            == 200
        )
        schema = client.get("/api/schema/project").json()
        assert "placement" in schema["$defs"]["Clip"]["properties"]
        headers = {"Accept": "application/json, text/event-stream"}
        tools = client.post(
            "/mcp/", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        ).json()["result"]["tools"]
        names = {t["name"] for t in tools}
        assert {"list_asset_folders", "create_asset_folder", "rename_asset_folder", "locate_asset"} <= names
        result = client.post(
            "/mcp/",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "search_assets", "arguments": {"project_id": p["id"]}},
            },
        ).json()["result"]
        assert not result.get("isError")


def frame(path):
    data = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-threads",
            "1",
            "-",
        ]
    )
    return np.array(Image.open(io.BytesIO(data)).convert("RGB"))


@pytest.mark.parametrize("effects", [[], [{"type": "brightness", "value": 0.1}]])
def test_render_canvas_position_shapes_and_transparent_logo(tmp_path, effects):
    service = Service(Store(tmp_path / "data"))
    red = tmp_path / "red.png"
    Image.new("RGB", (256, 256), "red").save(red)
    logo = tmp_path / "logo.png"
    im = Image.new("RGBA", (256, 256))
    ImageDraw.Draw(im).ellipse((80, 80, 175, 175), fill="lime")
    im.save(logo)
    a = service.import_file(red)
    b = service.import_file(logo)
    project = service.create(
        Project(
            name="Canvas",
            profile=OutputProfile(width=256, height=256, fps=12, normalize=False),
            tracks=[
                Track(
                    name="Video",
                    kind="video",
                    clips=[
                        Clip(
                            asset_id=a["id"],
                            duration_ms=500,
                            placement={"x": 0.25, "y": 0.5, "width": 0.5, "height": 1},
                        )
                    ],
                ),
                Track(
                    name="Elements",
                    kind="overlay",
                    clips=[
                        Clip(
                            asset_id=b["id"],
                            effects=effects,
                            duration_ms=500,
                            placement={"x": 0.25, "y": 0.5, "width": 0.5, "height": 0.5},
                        ),
                    ],
                ),
                Track(
                    name="Elements 2",
                    kind="overlay",
                    clips=[
                        Clip(
                            shape="rectangle",
                            color="#0000ff",
                            duration_ms=500,
                            placement={"x": 0.75, "y": 0.25, "width": 0.25, "height": 0.25},
                        ),
                    ],
                ),
            ],
        )
    )
    output = tmp_path / "result.mp4"
    asyncio.run(Renderer(service).render(project, output))
    pixels = frame(output)
    assert pixels[100, 10, 0] > 220 and pixels[100, 10, 1] < 20  # alpha exposes red background
    assert pixels[128, 64, 1] > 220 and pixels[128, 64, 0] < (60 if effects else 20)  # green logo center
    assert pixels[64, 192, 2] > 220  # blue shape
    assert pixels[220, 220].max() < 25  # empty canvas
    assert pixels[200, 100, 0] > 220  # primary video covers only left half


def test_caption_styles_and_shape_validation(tmp_path):
    service = Service(Store(tmp_path / "data"))
    outputs = []
    for style in ["editorial", "bold", "boxed", "minimal"]:
        clip = Clip(text="Zażółć gęślą jaźń", caption_style=style, font_size=80)
        output = cached_text_layer(clip, 540, 960, tmp_path)
        outputs.append(output.read_bytes())
        assert Image.open(output).getbbox()
    assert len(set(outputs)) == 4
    with pytest.raises(ValueError, match="overlay"):
        service.create(
            Project(name="Bad", tracks=[Track(name="Video", kind="video", clips=[Clip(shape="ellipse")])])
        )
    with pytest.raises(ValueError):
        Clip(placement={"width": 0})


def test_default_audio_folders_have_meaningful_contents():
    from synkinema.library import default_folder

    assert default_folder({"kind": "audio", "name": "voice-0.wav", "tags": []}) == "voiceovers"
    assert default_folder({"kind": "audio", "name": "transition.wav", "tags": []}) == "sound-effects"
    assert default_folder({"kind": "audio", "name": "music.wav", "tags": []}) == "music"
