"""Runtime output validation, codegen contracts and optimistic canvas raster parity."""

import io

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from PIL import Image
from synkinema.agent_reference import operation_reference
from synkinema.app import create_app
from synkinema.media import cached_text_layer
from synkinema.models import Clip, OutputProfile


def test_project_creation_time_is_persisted_and_survives_edits_and_history(tmp_path, monkeypatch):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        monkeypatch.setattr("synkinema.service.now", lambda: "2026-09-10T08:00:00+00:00")
        older = client.post("/api/projects", json={"name": "Older"}).json()
        monkeypatch.setattr("synkinema.service.now", lambda: "2026-09-14T08:00:00+00:00")
        newer = client.post("/api/projects", json={"name": "Newer"}).json()
        monkeypatch.setattr("synkinema.service.now", lambda: "2026-09-15T08:00:00+00:00")
        edited = client.post(
            f"/api/projects/{older['id']}/operations",
            json={"expected_revision": 1, "type": "update_project", "payload": {"name": "Edited older"}},
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["created_at"] == older["created_at"] == "2026-09-10T08:00:00+00:00"
        assert newer["created_at"] == "2026-09-14T08:00:00+00:00"
        historical = client.get(f"/api/projects/{older['id']}?revision=1").json()
        assert historical["created_at"] == older["created_at"]
        listing = client.get("/api/projects").json()
        assert {p["id"]: p["created_at"] for p in listing} == {
            older["id"]: older["created_at"],
            newer["id"]: newer["created_at"],
        }
        # Creation metadata is derived, not a mutable composition field.
        schema = client.get("/api/openapi.json").json()
        assert "created_at" in schema["components"]["schemas"]["ProjectSnapshot"]["properties"]
        assert "created_at" not in schema["components"]["schemas"]["Project"]["properties"]


def test_track_gain_contract_and_atomic_remove_restore(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        p = client.post("/api/projects", json={"name": "Timeline basics QA"}).json()
        endpoint = f"/api/projects/{p['id']}/operations"
        assert all(t["gain_db"] == 0 for t in p["tracks"])
        changed = client.post(
            endpoint,
            json={
                "expected_revision": 1,
                "type": "update_track",
                "payload": {"track_id": "music", "changes": {"gain_db": -12}},
            },
        )
        assert changed.status_code == 200, changed.text
        assert next(t for t in changed.json()["tracks"] if t["id"] == "music")["gain_db"] == -12
        invalid = client.post(
            endpoint,
            json={
                "expected_revision": 2,
                "type": "update_track",
                "payload": {"track_id": "music", "changes": {"gain_db": 30}},
            },
        )
        assert invalid.status_code == 422
        stale = client.post(
            endpoint,
            json={
                "expected_revision": 1,
                "type": "update_track",
                "payload": {"track_id": "music", "changes": {"gain_db": 0}},
            },
        )
        assert stale.status_code == 409
        added = client.post(
            endpoint,
            json={
                "expected_revision": 2,
                "type": "add_clip",
                "payload": {
                    "track_id": "titles",
                    "clip": {"id": "caption", "text": "Keep source", "duration_ms": 1000},
                },
            },
        )
        assert added.status_code == 200, added.text
        refused = client.post(
            endpoint, json={"expected_revision": 3, "type": "remove_track", "payload": {"track_id": "titles"}}
        )
        assert refused.status_code == 422
        removed = client.post(
            endpoint + "/batch",
            json={
                "expected_revision": 3,
                "operations": [
                    {"type": "remove_clip", "payload": {"track_id": "titles", "clip_id": "caption"}},
                    {"type": "remove_track", "payload": {"track_id": "titles"}},
                ],
            },
        )
        assert removed.status_code == 200, removed.text
        assert removed.json()["project"]["revision"] == 4
        restored = client.post(
            endpoint, json={"expected_revision": 4, "type": "restore_revision", "payload": {"revision": 3}}
        )
        assert restored.status_code == 200, restored.text
        assert (
            next(t for t in restored.json()["tracks"] if t["id"] == "titles")["clips"][0]["id"] == "caption"
        )


def test_remove_populated_track_has_no_batch_limit_and_requires_explicit_consent(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        clips = [
            {"id": f"c{i}", "text": "Caption", "start_ms": i * 100, "duration_ms": 100} for i in range(150)
        ]
        created = client.post(
            "/api/projects",
            json={
                "name": "Large track QA",
                "tracks": [{"id": "titles", "name": "Captions", "kind": "text", "clips": clips}],
            },
        )
        assert created.status_code == 201, created.text
        endpoint = f"/api/projects/{created.json()['id']}/operations"
        for extra in ({}, {"remove_clips": False}, {"remove_clips": "true"}):
            refused = client.post(
                endpoint,
                json={
                    "expected_revision": 1,
                    "type": "remove_track",
                    "payload": {"track_id": "titles", **extra},
                },
            )
            assert refused.status_code == 422, refused.text
        removed = client.post(
            endpoint,
            json={
                "expected_revision": 1,
                "type": "remove_track",
                "payload": {"track_id": "titles", "remove_clips": True},
            },
        )
        assert removed.status_code == 200, removed.text
        assert removed.json()["tracks"] == []
        assert removed.json()["revision"] == 2
        restored = client.post(
            endpoint, json={"expected_revision": 2, "type": "restore_revision", "payload": {"revision": 1}}
        )
        assert restored.status_code == 200, restored.text
        assert len(restored.json()["tracks"][0]["clips"]) == 150


def test_all_endpoints_have_success_and_error_schemas_and_operation_union(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as client:
        schema = client.get("/api/openapi.json").json()
        ids = []
        for path in schema["paths"].values():
            for route in path.values():
                ids.append(route["operationId"])
                success = next(v for k, v in route["responses"].items() if k.startswith("2"))
                assert all(v.get("schema") for v in success["content"].values())
                for status in ("401", "403", "404", "409", "413", "422"):
                    assert "content" in route["responses"][status]
        assert len(ids) == len(set(ids))
        validator = Draft202012Validator(schema)
        invalid = client.post("/api/projects", json={"name": ""})
        assert invalid.status_code == 422
        validator.evolve(schema={"$ref": "#/components/schemas/ApiError"}).validate(invalid.json())
        for name, record in operation_reference()["operations"].items():
            envelope = {"type": name, "payload": record["example_payload"], "expected_revision": 1}
            validator.evolve(schema={"$ref": "#/components/schemas/Operation"}).validate(envelope)
        assert len(schema["components"]["schemas"]["Operation"]["oneOf"]) == 16
        assert (
            "new_clip_id"
            in schema["components"]["schemas"]["SplitClipStep"]["properties"]["payload"]["properties"]
        )
        assert (
            schema["paths"]["/api/preview/text-layer"]["post"]["responses"]["200"]["content"]["image/png"][
                "schema"
            ]["format"]
            == "binary"
        )


def test_typed_payloads_cover_real_upload_metadata_comments_batch_and_sync(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        project = client.post("/api/projects", json={"name": "Contract QA"}).json()
        image = io.BytesIO()
        Image.new("RGB", (128, 128), "red").save(image, "PNG")
        asset_response = client.post(
            "/api/assets",
            files={"file": ("marker.png", image.getvalue(), "image/png")},
            data={"project_id": project["id"]},
        )
        assert asset_response.status_code == 201, asset_response.text
        asset = asset_response.json()
        folder = client.post(
            "/api/asset-folders", json={"name": "Graphics", "project_id": project["id"]}
        ).json()
        assert (
            client.patch(f"/api/asset-folders/{folder['id']}", json={"name": "Logos"}).json()["name"]
            == "Logos"
        )
        assert (
            client.put(
                f"/api/assets/{asset['id']}/location",
                json={"project_id": project["id"], "folder_id": folder["id"]},
            ).json()["locations"][project["id"]]
            == folder["id"]
        )
        assert client.put(f"/api/assets/{asset['id']}/tags", json=["qa"]).json()["tags"] == ["qa"]
        response = client.post(
            f"/api/projects/{project['id']}/operations/batch",
            json={
                "expected_revision": 1,
                "operations": [
                    {
                        "type": "add_clip",
                        "payload": {
                            "track_id": "video",
                            "clip": {"id": "stable", "asset_id": asset["id"], "duration_ms": 2000},
                        },
                    }
                ],
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["project"]["duration_ms"] == 2000
        split = client.post(
            f"/api/projects/{project['id']}/operations",
            json={
                "expected_revision": 2,
                "type": "split_clip",
                "payload": {
                    "track_id": "video",
                    "clip_id": "stable",
                    "time_ms": 1000,
                    "new_clip_id": "right",
                },
            },
        )
        assert split.status_code == 200, split.text
        assert split.json()["tracks"][0]["clips"][1]["id"] == "right"
        comment = client.post(
            f"/api/projects/{project['id']}/comments",
            json={"revision": 3, "time_ms": 100, "message": "Check framing"},
        ).json()
        assert client.patch(f"/api/projects/{project['id']}/comments/{comment['id']}").json()["resolved"]
        assert client.get("/api/state").json()["projects"] == [{"id": project["id"], "revision": 3}]
        stale = client.post(
            f"/api/projects/{project['id']}/operations",
            json={
                "expected_revision": 1,
                "type": "remove_clip",
                "payload": {"track_id": "video", "clip_id": "stable"},
            },
        )
        assert stale.status_code == 409
        assert client.get(f"/api/projects/{project['id']}").json()["revision"] == 3
        assert client.get(f"/api/projects/{project['id']}/preflight").json()["valid"]


def test_unsaved_caption_png_matches_export_and_does_not_mutate_projects(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as client:
        clip = Clip(text="Unsaved caption", caption_style="bold")
        profile = OutputProfile(width=360, height=640)
        response = client.post(
            "/api/preview/text-layer", json={"clip": clip.model_dump(), "profile": profile.model_dump()}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        path = cached_text_layer(clip, 360, 640, app.state.service.store.path("cache"))
        assert response.content == path.read_bytes()
        assert client.get("/api/projects").json() == []
        assert (
            client.post(
                "/api/preview/text-layer", json={"clip": {"font_size": 10000}, "profile": {}}
            ).status_code
            == 422
        )


def test_legacy_export_metadata_does_not_break_jobs_or_live_synchronization(tmp_path):
    import json

    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as client:
        p = client.post("/api/projects", json={"name": "Legacy render"}).json()
        job = {
            "id": "legacy",
            "project_id": p["id"],
            "project_name": p["name"],
            "revision": 1,
            "status": "completed",
            "progress": 1,
            "phase": "Complete",
            "created_at": "2026-09-01",
            "request": {"quality": "preview", "from_ms": 0, "to_ms": None, "expected_revision": 1},
            "error": None,
            "output_url": "/media/renders/legacy.mp4",
            "metadata": {
                "kind": "video",
                "width": 360,
                "height": 640,
                "duration_ms": 40000,
                "has_audio": True,
                "codec": "h264",
                "size": 1000,
            },
        }
        app.state.service.store.execute(
            "INSERT INTO jobs VALUES(:id,:pid,:status,:doc,:time)",
            id=job["id"],
            pid=p["id"],
            status="completed",
            doc=json.dumps(job),
            time=job["created_at"],
        )
        for endpoint in ("/api/jobs", "/api/state", "/api/jobs/legacy"):
            response = client.get(endpoint)
            assert response.status_code == 200, response.text
        assert client.get("/api/jobs").json()[0]["metadata"]["audio_duration_ms"] is None
