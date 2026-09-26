import io
from itertools import pairwise

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app
from synkinema.media import cached_text_layer, text_layer
from synkinema.models import Clip, OutputProfile, Project, Track


@pytest.mark.parametrize("style", ["editorial", "bold", "boxed", "minimal"])
@pytest.mark.parametrize("size", [(1080, 1920), (640, 360)])
def test_auto_center_ignores_manual_anchor_and_alignment_across_layout_changes(tmp_path, style, size):
    from synkinema.media import caption_bounds

    width, height = size
    clip = Clip(
        text="SHORT\nA much longer wrapped caption for the whole screen",
        subtitle="Subtitle below",
        caption_style=style,
        font_size=44,
        text_y=0.3,
        text_auto_center=True,
    )
    for font_size in (44, 72):
        rasters = [
            cached_text_layer(
                clip.model_copy(update={"text_x": x, "text_align": align, "font_size": font_size}),
                width,
                height,
                tmp_path,
            )
            for x, align in ((0, "left"), (0.5, "right"), (0.9, "auto"))
        ]
        assert len(set(rasters)) == 3
        assert all(Image.open(p).tobytes() == Image.open(rasters[0]).tobytes() for p in rasters)
        bounds = caption_bounds(rasters[0])
        assert abs(bounds["left"] + bounds["width"] / 2 - width / 2) <= 1
        assert 0 <= bounds["left"] < bounds["left"] + bounds["width"] <= width


def test_auto_center_api_preview_persistence_conflict_and_undo(tmp_path):
    from synkinema.agent_reference import AGENT_INSTRUCTIONS, operation_reference

    app = create_app(tmp_path, start_worker=False)
    original = Clip(id="caption", text="Centered subtitle", text_x=0.7, text_align="right", text_y=0.59)
    project = app.state.service.create(
        Project(
            name="Auto-center QA",
            tracks=[Track(id="captions", name="Captions", kind="text", clips=[original])],
        )
    )
    with TestClient(app) as client:
        endpoint = f"/api/projects/{project.id}/operations"
        edit = {
            "expected_revision": 1,
            "type": "update_clip",
            "payload": {"track_id": "captions", "clip_id": "caption", "changes": {"text_auto_center": True}},
        }
        saved = client.post(endpoint, json=edit)
        assert saved.status_code == 200, saved.text
        clip = saved.json()["tracks"][0]["clips"][0]
        assert clip["text_auto_center"] is True
        assert (clip["text_x"], clip["text_align"], clip["text_y"]) == (0.7, "right", 0.59)
        preview = client.post(
            "/api/preview/caption", json={"clip": clip, "profile": saved.json()["profile"]}
        ).json()
        assert abs(preview["bounds"]["left"] + preview["bounds"]["width"] / 2 - 540) <= 1
        pinned = client.get(f"/api/projects/{project.id}/clips/caption/text-layer", params={"revision": 2})
        assert pinned.content == client.get(preview["url"]).content
        assert client.post(endpoint, json=edit).status_code == 409
        edit["expected_revision"] = 2
        edit["payload"]["changes"]["text_auto_center"] = "invalid"
        assert client.post(endpoint, json=edit).status_code == 422
        restored = client.post(
            endpoint, json={"expected_revision": 2, "type": "restore_revision", "payload": {"revision": 1}}
        )
        assert restored.json()["tracks"][0]["clips"][0]["text_auto_center"] is False
    assert "text_auto_center=true" in AGENT_INSTRUCTIONS
    reference = operation_reference("update_clip")
    assert "text_auto_center=true" in reference["description"]
    assert (
        reference["payload_schema"]["properties"]["changes"]["properties"]["text_auto_center"]["default"]
        is False
    )


@pytest.mark.parametrize("style", ["editorial", "bold", "boxed", "minimal"])
def test_explicit_alignment_preserves_defaults_and_changes_cached_raster(tmp_path, style):
    from synkinema.media import caption_bounds

    clip = Clip(text="SHORT\nA LONGER LINE", subtitle="Subtitle", caption_style=style, font_size=44)
    rasters = {
        alignment: cached_text_layer(clip.model_copy(update={"text_align": alignment}), 1080, 1920, tmp_path)
        for alignment in ("auto", "left", "center", "right")
    }
    default = "center" if style in ("bold", "boxed") else "left"
    assert Image.open(rasters["auto"]).tobytes() == Image.open(rasters[default]).tobytes()
    bounds = {alignment: caption_bounds(path) for alignment, path in rasters.items()}
    assert bounds["left"]["left"] < bounds["center"]["left"] < bounds["right"]["left"]
    center = bounds["center"]
    assert abs(center["left"] + center["width"] / 2 - 540) < 4
    assert len(set(rasters.values())) == 4


def test_alignment_edit_validation_revision_and_undo(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    project = app.state.service.create(
        Project(
            name="Alignment",
            tracks=[
                Track(id="captions", name="Captions", kind="text", clips=[Clip(id="caption", text="Hello")])
            ],
        )
    )
    with TestClient(app) as client:
        endpoint = f"/api/projects/{project.id}/operations"
        operation = {
            "expected_revision": 1,
            "type": "update_clip",
            "payload": {"track_id": "captions", "clip_id": "caption", "changes": {"text_align": "center"}},
        }
        response = client.post(endpoint, json=operation)
        assert response.status_code == 200, response.text
        assert response.json()["tracks"][0]["clips"][0]["text_align"] == "center"
        assert client.post(endpoint, json=operation).status_code == 409
        operation["expected_revision"] = 2
        operation["payload"]["changes"]["text_align"] = "invalid"
        assert client.post(endpoint, json=operation).status_code == 422
        restored = client.post(
            endpoint, json={"expected_revision": 2, "type": "restore_revision", "payload": {"revision": 1}}
        )
        assert restored.status_code == 200, restored.text
        assert restored.json()["tracks"][0]["clips"][0]["text_align"] == "auto"


def test_caption_png_matches_export_layout_and_pins_revisions(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    clip = Clip(id="title", text="Wodniczka", subtitle="GATUNEK NARAŻONY", text_y=0.18, font_size=102)
    project = app.state.service.create(
        Project(
            name="Caption parity",
            profile=OutputProfile(width=360, height=640),
            tracks=[Track(id="titles", name="Captions", kind="text", clips=[clip])],
        )
    )
    path = f"/api/projects/{project.id}/clips/title/text-layer"
    with TestClient(app) as client:
        response = client.get(path, params={"revision": 1})
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.headers["x-project-revision"] == "1"
        assert "immutable" in response.headers["cache-control"]
        image = Image.open(io.BytesIO(response.content))
        expected = tmp_path / "export-caption.png"
        text_layer(clip, 360, 640, expected)
        assert image.mode == "RGBA" and image.size == (360, 640)
        assert image.tobytes() == Image.open(expected).tobytes()
        # The upper caption's contrast band fades back to transparent, with no hard edge.
        alpha = [image.getpixel((0, y))[3] for y in range(image.height)]
        assert max(alpha) > 100
        assert alpha[-1] == 0
        assert max(abs(a - b) for a, b in pairwise(alpha)) <= 4
        assert (
            client.post(
                f"/api/projects/{project.id}/operations",
                json={
                    "expected_revision": 1,
                    "type": "update_clip",
                    "payload": {"track_id": "titles", "clip_id": "title", "changes": {"text": "Nowy tekst"}},
                },
            ).status_code
            == 200
        )
        assert client.get(path, params={"revision": 1}).content == response.content
        current = client.get(path)
        assert current.content != response.content
        assert current.headers["x-project-revision"] == "2"
        assert current.headers["cache-control"] == "no-cache"
        assert client.get(path, params={"revision": 999}).status_code == 404
        assert client.get(path.replace("/title/", "/missing/")).status_code == 404


def test_caption_cache_reuses_published_file_and_accounts_for_aspect_ratio(tmp_path):
    clip = Clip(text="A caption", subtitle="Second line", text_y=0.85)
    path = cached_text_layer(clip, 640, 360, tmp_path)
    stat = path.stat()
    assert cached_text_layer(clip, 640, 360, tmp_path).stat().st_mtime_ns == stat.st_mtime_ns
    assert Image.open(path).size == (640, 360)
    portrait = cached_text_layer(clip, 360, 640, tmp_path)
    assert portrait != path
    assert Image.open(portrait).size == (360, 640)
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted([path.name, portrait.name])


def test_caption_layout_tracks_style_size_wrapping_and_subtitle(tmp_path):
    from synkinema.media import caption_bounds

    profile = OutputProfile(width=1080, height=1920)
    clip = Clip(text="Twój kadr.\nTwoje zasady.", text_y=0.85, font_size=100)
    with TestClient(create_app(tmp_path, start_worker=False)) as client:

        def preview(candidate, output=profile):
            response = client.post(
                "/api/preview/caption", json={"clip": candidate.model_dump(), "profile": output.model_dump()}
            )
            assert response.status_code == 200, response.text
            data = response.json()
            image = client.get(data["url"])
            assert image.status_code == 200
            expected = cached_text_layer(candidate, output.width, output.height, tmp_path / "cache")
            assert image.content == expected.read_bytes()
            assert data["bounds"] == caption_bounds(expected)
            assert (data["width"], data["height"]) == (output.width, output.height)
            return data

        styles = {
            style: preview(clip.model_copy(update={"caption_style": style}))
            for style in ("editorial", "bold", "boxed", "minimal")
        }
        assert len({tuple(data["bounds"].values()) for data in styles.values()}) == 4
        minimal = styles["minimal"]["bounds"]
        assert minimal["width"] < profile.width * 0.82
        assert styles["bold"]["bounds"]["left"] > minimal["left"]
        assert styles["boxed"]["bounds"]["height"] > minimal["height"]
        assert styles["editorial"]["bounds"]["top"] < minimal["top"]
        # The renderer clamps a two-line caption upward at the bottom of the frame.
        assert minimal["top"] < profile.height * clip.text_y
        small = preview(
            clip.model_copy(update={"caption_style": "minimal", "text": "Żółw", "font_size": 40})
        )["bounds"]
        large = preview(
            clip.model_copy(update={"caption_style": "minimal", "text": "Żółw", "font_size": 150})
        )["bounds"]
        assert large["width"] > small["width"] * 3
        assert large["height"] > small["height"] * 3
        wrapped = preview(clip.model_copy(update={"text": "Chroń zagrożone gatunki w Polsce. " * 3}))[
            "bounds"
        ]
        subtitle = preview(clip.model_copy(update={"subtitle": "Każdy gatunek ma znaczenie."}))["bounds"]
        assert wrapped["height"] > styles["editorial"]["bounds"]["height"] * 2
        assert subtitle["height"] > styles["editorial"]["bounds"]["height"]
        landscape = preview(clip, OutputProfile(width=640, height=360))
        assert landscape["url"] != styles["editorial"]["url"]
        assert landscape["bounds"]["top"] + landscape["bounds"]["height"] <= 360
        assert preview(clip.model_copy(update={"text": "", "caption_style": "minimal"}))["bounds"] is None
        assert client.get("/api/projects").json() == []
        assert client.get("/api/jobs").json() == []


def test_measured_caption_bounds_cover_visible_pixels_without_contrast_gradient(tmp_path):
    from synkinema.media import caption_bounds

    for width, height in ((1080, 1920), (640, 360)):
        for style in ("editorial", "bold", "boxed", "minimal"):
            clip = Clip(
                text="Żółw.\nTwoje zasady.", subtitle="Chroń naturę", caption_style=style, text_y=0.18
            )
            path = cached_text_layer(clip, width, height, tmp_path)
            bounds = caption_bounds(path)
            with Image.open(path) as image:
                alpha = image.getchannel("A")
                # Editorial contrast never exceeds alpha=190. Foreground is independent of it.
                ink = alpha.point(lambda value: 255 if value > 200 else 0).getbbox()
                box = (
                    bounds["left"],
                    bounds["top"],
                    bounds["left"] + bounds["width"],
                    bounds["top"] + bounds["height"],
                )
                assert box[0] <= ink[0] and box[1] <= ink[1]
                assert box[2] >= ink[2] and box[3] >= ink[3]
                assert box[2] - box[0] < width * 0.82
                if style == "editorial":
                    assert alpha.getbbox()[0] == 0 and box[0] > 0
                else:
                    # DejaVu's side bearing can leave 8 transparent pixels at this size.
                    assert max(abs(a - b) for a, b in zip(box, alpha.getbbox(), strict=True)) <= 10


def test_boxed_headline_and_subtitle_share_the_same_center(tmp_path):
    def ink_bounds(image, top, bottom, white):
        columns = []
        for y in range(top, bottom):
            for x in range(image.width):
                red, green, blue = image.getpixel((x, y))
                is_ink = (
                    red > 240 and green > 240 and blue > 240
                    if white
                    else red > 190 and green > 230 and blue < 160
                )
                if is_ink:
                    columns.append(x)
        assert columns
        return min(columns), max(columns)

    for style in ("boxed", "bold"):
        for text_x in (0.05, 0.35):
            clip = Clip(
                text="WORK TOGETHER",
                subtitle="Same project",
                caption_style=style,
                text_x=text_x,
                text_y=0.3,
                font_size=70,
            )
            path = text_layer(clip, 1000, 560, tmp_path / f"{style}-{text_x}.png")
            with Image.open(path) as image:
                pixels = image.convert("RGB")
                title_left, title_right = ink_bounds(pixels, 165, 260, style == "boxed")
                subtitle_left, subtitle_right = ink_bounds(pixels, 260, 350, False)
                title_center = (title_left + title_right) / 2
                subtitle_center = (subtitle_left + subtitle_right) / 2
                assert abs(title_center - subtitle_center) <= 8
