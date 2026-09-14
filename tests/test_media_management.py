"""Media metadata, sharing and physical deletion share one guarded contract."""

import io

from fastapi.testclient import TestClient
from PIL import Image
from synkinema.app import create_app


def upload(c, color, project_id=None):
    image = io.BytesIO()
    Image.new("RGB", (128, 128), color).save(image, "PNG")
    r = c.post(
        "/api/assets",
        files={"file": (f"{color}.png", image.getvalue(), "image/png")},
        data={"project_id": project_id} if project_id else {},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_metadata_versions_bulk_tags_and_atomic_errors(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as c:
        a, b = upload(c, "red"), upload(c, "blue")
        request = {
            "expected_version": 1,
            "name": "  Logo  ",
            "tags": ["nature", " calm ", "nature"],
            "source": "Creator credit",
            "license": "CC0",
        }
        r = c.put(f"/api/assets/{a['id']}/metadata", json=request)
        assert r.status_code == 200, r.text
        a2 = r.json()
        assert a2["version"] == 2 and a2["name"] == "Logo" and a2["tags"] == ["calm", "nature"]
        assert a2["path"] == a["path"] and a2["checksum"] == a["checksum"]
        assert c.put(f"/api/assets/{a['id']}/metadata", json=request).status_code == 409
        assert (
            c.post(
                "/api/assets/batch",
                json={"asset_ids": [a["id"], "missing"], "action": "add_tags", "tags": ["not-saved"]},
            ).status_code
            == 404
        )
        assert c.get(f"/api/assets/{a['id']}").json()["tags"] == ["calm", "nature"]
        batch = {"asset_ids": [a["id"], b["id"]], "action": "add_tags", "tags": ["qa", "nature"]}
        result = c.post("/api/assets/batch", json=batch)
        assert result.status_code == 200, result.text
        assert result.json()[0]["tags"] == ["calm", "nature", "qa"]
        repeat = c.post("/api/assets/batch", json=batch).json()
        assert repeat == result.json()  # Idempotent: no artificial version bumps.
        removed = c.post("/api/assets/batch", json={**batch, "action": "remove_tags", "tags": ["qa"]}).json()
        assert removed[0]["tags"] == ["calm", "nature"]
        assert c.post("/api/assets/batch", json={**batch, "asset_ids": [a["id"], a["id"]]}).status_code == 422
        assert c.put(f"/api/assets/{a['id']}/tags", json=[" "]).status_code == 422


def test_unsharing_preserves_history_and_does_not_leave_unused_orphans(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as c:
        p = c.post("/api/projects", json={"name": "Media references"}).json()
        a = upload(c, "green")
        assert (
            c.request("DELETE", f"/api/assets/{a['id']}/location", json={"expected_version": 1}).status_code
            == 409
        )
        edited = c.post(
            f"/api/projects/{p['id']}/operations",
            json={
                "expected_revision": 1,
                "type": "add_clip",
                "payload": {"track_id": "video", "clip": {"asset_id": a["id"], "duration_ms": 1000}},
            },
        ).json()
        clip = edited["tracks"][0]["clips"][0]
        c.post(
            f"/api/projects/{p['id']}/operations",
            json={
                "expected_revision": 2,
                "type": "remove_clip",
                "payload": {"track_id": "video", "clip_id": clip["id"]},
            },
        )
        usage = c.get(f"/api/assets/{a['id']}/usage").json()
        assert (
            not usage["can_delete"]
            and not usage["projects"][0]["current"]
            and usage["projects"][0]["revisions"] == [2]
        )
        r = c.request("DELETE", f"/api/assets/{a['id']}/location", json={"expected_version": a["version"]})
        assert r.status_code == 200, r.text
        private = r.json()
        assert "library" not in private["locations"] and p["id"] in private["locations"]
        assert c.get("/api/assets").json() == []
        assert c.get("/api/media").json()[0]["id"] == a["id"]
        assert c.get(a["url"]).status_code == 200
        assert (
            c.post(
                "/api/assets/delete",
                json={"assets": [{"id": a["id"], "expected_version": private["version"]}]},
            ).status_code
            == 409
        )
        # A metadata-only project collection can be detached while history still protects bytes.
        detached = c.request(
            "DELETE",
            f"/api/assets/{a['id']}/location",
            json={"expected_version": private["version"], "project_id": p["id"]},
        )
        assert detached.status_code == 200 and detached.json()["locations"] == {}
        assert len(c.get("/api/media").json()) == 1
        deleted = c.request("DELETE", f"/api/projects/{p['id']}", json={"expected_revision": 3})
        assert deleted.status_code == 200 and deleted.json()["asset_ids"] == [a["id"]]
        assert c.get(a["url"]).status_code == 404  # Last history owner cleans detached bytes too.


def test_current_project_and_render_snapshots_block_deletion(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as c:
        p = c.post("/api/projects", json={"name": "Protected"}).json()
        a = upload(c, "orange", p["id"])
        c.post(
            f"/api/projects/{p['id']}/operations",
            json={
                "expected_revision": 1,
                "type": "add_clip",
                "payload": {"track_id": "video", "clip": {"asset_id": a["id"], "duration_ms": 1000}},
            },
        )
        j = c.post(f"/api/projects/{p['id']}/renders", json={"expected_revision": 2}).json()
        usage = c.get(f"/api/assets/{a['id']}/usage").json()
        assert usage["projects"][0]["current"] and usage["projects"][0]["job_ids"] == [j["id"]]
        assert (
            c.request(
                "DELETE",
                f"/api/assets/{a['id']}/location",
                json={"expected_version": 1, "project_id": p["id"]},
            ).status_code
            == 409
        )
        unused = upload(c, "pink")
        response = c.post(
            "/api/assets/delete",
            json={
                "assets": [
                    {"id": unused["id"], "expected_version": 1},
                    {"id": a["id"], "expected_version": 1},
                ]
            },
        )
        assert response.status_code == 409
        assert c.get(unused["url"]).status_code == 200 and c.get(a["url"]).status_code == 200


def test_folder_deletion_preserves_every_file_and_other_memberships(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as c:
        p = c.post("/api/projects", json={"name": "Private folder"}).json()
        a, b = upload(c, "purple"), upload(c, "yellow")
        folder = c.post("/api/asset-folders", json={"name": "Test folder"}).json()
        result = c.post(
            "/api/assets/batch",
            json={
                "asset_ids": [a["id"], b["id"]],
                "action": "locate",
                "destination": {"folder_id": folder["id"]},
            },
        )
        assert result.status_code == 200
        c.put(f"/api/assets/{a['id']}/location", json={"project_id": p["id"]})
        r = c.delete("/api/asset-folders/" + folder["id"])
        assert r.status_code == 200 and len(r.json()["assets"]) == 2
        a2 = c.get("/api/assets/" + a["id"]).json()
        assert a2["locations"] == {"library": "", p["id"]: ""}
        for item in [a, b]:
            assert c.get(item["url"]).status_code == 200
        assert not any(f["id"] == folder["id"] for f in c.get("/api/asset-folders").json())


def test_physical_delete_checks_versions_then_removes_originals_and_thumbnails(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as c:
        a, b = upload(c, "cyan"), upload(c, "white")
        changed = c.put("/api/assets/" + a["id"] + "/tags", json=["qa"]).json()
        request = {"assets": [{"id": a["id"], "expected_version": 1}, {"id": b["id"], "expected_version": 1}]}
        assert c.post("/api/assets/delete", json=request).status_code == 409
        assert c.get(a["url"]).status_code == 200 and c.get(b["url"]).status_code == 200
        request["assets"][0]["expected_version"] = changed["version"]
        result = c.post("/api/assets/delete", json=request)
        assert result.status_code == 200, result.text
        assert set(result.json()["asset_ids"]) == {a["id"], b["id"]}
        assert result.json()["pending_files"] == 0 and result.json()["freed_bytes"] > 0
        assert c.get("/api/media").json() == []
        for item in [a, b]:
            assert not app.state.service.store.path(item["path"]).exists()
            assert c.get(item["url"]).status_code == 404 and c.get(item["thumbnail_url"]).status_code == 404


def test_mcp_media_commands_use_the_same_versions_and_cleanup(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as c:
        asset = upload(c, "cyan")
        p = c.post("/api/projects", json={"name": "MCP media"}).json()

        def call(name, arguments=None):
            import json

            response = c.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": arguments or {}},
                },
            )
            result = response.json()["result"]
            assert not result.get("isError"), result
            data = result.get("structuredContent") or json.loads(
                next(b["text"] for b in result["content"] if b["type"] == "text")
            )
            return data.get("result", data) if isinstance(data, dict) else data

        assert call("list_stored_media")[0]["id"] == asset["id"]
        assert call("get_asset_usage", {"asset_id": asset["id"]})["can_delete"]
        updated = call(
            "update_asset_metadata",
            {
                "asset_id": asset["id"],
                "request": {
                    "expected_version": 1,
                    "name": "MCP logo",
                    "tags": ["qa"],
                    "source": "Original",
                    "license": "CC0",
                },
            },
        )
        assert updated["version"] == 2
        folder = call("create_asset_folder", {"name": "Disposable"})
        changed = call(
            "edit_media_batch",
            {
                "request": {
                    "asset_ids": [asset["id"]],
                    "action": "locate",
                    "destination": {"folder_id": folder["id"]},
                }
            },
        )
        assert changed[0]["locations"]["library"] == folder["id"]
        assert (
            call("delete_asset_folder", {"folder_id": folder["id"]})["assets"][0]["locations"]["library"]
            == ""
        )
        located = call("locate_asset", {"asset_id": asset["id"], "project_id": p["id"]})
        unshared = call(
            "remove_media_membership",
            {"asset_id": asset["id"], "request": {"expected_version": located["version"]}},
        )
        assert unshared["locations"] == {p["id"]: ""}
        deleted = call(
            "delete_media",
            {"request": {"assets": [{"id": asset["id"], "expected_version": unshared["version"]}]}},
        )
        assert deleted["asset_ids"] == [asset["id"]] and deleted["pending_files"] == 0
        assert c.get(asset["url"]).status_code == 404
