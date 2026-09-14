import io
from itertools import pairwise

from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app
from synkinema.media import cached_text_layer, text_layer
from synkinema.models import Clip, OutputProfile, Project, Track


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
                    # Font side bearings may leave a few transparent pixels at the edges.
                    assert max(abs(a - b) for a, b in zip(box, alpha.getbbox(), strict=True)) <= 6
