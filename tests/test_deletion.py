"""Deletion must remove bytes, preserve references, and survive interruption."""

import asyncio
import io
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from synkinema.api_contract import DeleteJobsRequest
from synkinema.app import create_app
from synkinema.deletion import Deletion, reusable_files
from synkinema.inspection import Inspection
from synkinema.models import Clip, Project, RenderRequest
from synkinema.renderer import Renderer
from synkinema.service import Service
from synkinema.storage import Store
from synkinema.worker import Worker


def project(service, name="Delete QA"):
    p = Project(name=name)
    p.tracks[1].clips = [Clip(text="Disposable test", duration_ms=1000)]
    return service.create(p)


def job(service, p, status="completed"):
    j = service.enqueue(p.id, RenderRequest())
    service.store.update_job(
        j["id"], status=status, output_url=f"/media/renders/{j['id']}.mp4" if status == "completed" else None
    )
    files = [service.store.path(f"renders/{j['id']}{suffix}") for suffix in (".mp4", ".mix.mp4")]
    for path in files:
        path.write_bytes(b"disposable bytes")
    return j, files


def test_delete_export_and_clear_all_beyond_display_limit(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    p, other = project(service), project(service, "Retained")
    first, files = job(service, p)
    retained, retained_files = job(service, other)
    cache = service.store.path(f"cache/sheet-{p.id}-r1-test.jpg")
    cache.write_bytes(b"sheet")
    with TestClient(app) as c:
        invalid = c.post("/api/jobs/clear", json={"job_ids": [first["id"], "missing"]})
        assert invalid.status_code == 404 and all(f.exists() for f in files)
        result = c.delete(f"/api/jobs/{first['id']}")
        assert result.status_code == 200, result.text
        assert result.json()["freed_bytes"] == len(b"disposable bytes") * 2 + 5
        assert result.json()["pending_files"] == 0
        assert not cache.exists() and not any(f.exists() for f in files)
        assert c.get(first["output_url"] or f"/media/renders/{first['id']}.mp4").status_code == 404
        assert c.get(f"/api/jobs/{first['id']}").status_code == 404
        assert c.get(f"/api/projects/{p.id}").status_code == 200
        for _ in range(103):
            job(service, p, "failed")
        queued, queued_files = job(service, p, "queued")
        result = c.post("/api/jobs/clear", json={"project_id": p.id}).json()
        assert len(result["job_ids"]) == 103
        assert all(f.exists() for f in queued_files)
        result = c.post("/api/jobs/clear", json={"project_id": p.id, "status": "all"}).json()
        assert result["job_ids"] == [queued["id"]]
        assert all(f.exists() for f in retained_files)
        assert c.get(f"/api/jobs/{retained['id']}").status_code == 200
        assert not service.store.rows("SELECT path FROM file_cleanup")


def upload(c, project_id, color):
    data = io.BytesIO()
    Image.new("RGB", (128, 128), color).save(data, "PNG")
    r = c.post(
        "/api/assets",
        files={"file": (f"{color}.png", data.getvalue(), "image/png")},
        data={"project_id": project_id},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_project_delete_preserves_shared_and_historical_sources(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    with TestClient(app) as c:
        p = project(service)
        private = upload(c, p.id, "red")
        shared = upload(c, p.id, "green")
        history_asset = upload(c, p.id, "blue")
        c.put(f"/api/assets/{shared['id']}/location", json={})
        r = c.post(
            f"/api/projects/{p.id}/operations",
            json={
                "expected_revision": 1,
                "type": "add_clip",
                "payload": {
                    "track_id": "video",
                    "clip": {"asset_id": history_asset["id"], "duration_ms": 1000},
                },
            },
        )
        assert r.status_code == 200, r.text
        clone = c.post(f"/api/projects/{p.id}/clone", json={"name": "Retained clone", "revision": 2}).json()
        c.post(
            f"/api/projects/{clone['id']}/operations",
            json={
                "expected_revision": 1,
                "type": "remove_clip",
                "payload": {"track_id": "video", "clip_id": clone["tracks"][0]["clips"][0]["id"]},
            },
        )
        folder = c.post("/api/asset-folders", json={"project_id": p.id, "name": "Private"}).json()
        c.post(
            f"/api/projects/{p.id}/comments",
            json={"revision": 2, "time_ms": 0, "message": "Delete with project"},
        )
        j, files = job(service, service.get(p.id))
        stale = c.request("DELETE", f"/api/projects/{p.id}", json={"expected_revision": 1})
        assert stale.status_code == 409 and all(f.exists() for f in files)
        result = c.request("DELETE", f"/api/projects/{p.id}", json={"expected_revision": 2})
        assert result.status_code == 200, result.text
        deleted = result.json()
        assert deleted["asset_ids"] == [private["id"]] and deleted["job_ids"] == [j["id"]]
        assert deleted["pending_files"] == 0
        assert c.get(private["url"]).status_code == 404
        assert c.get(private["thumbnail_url"]).status_code == 404
        assert c.get(shared["url"]).status_code == 200
        assert c.get(history_asset["url"]).status_code == 200
        assert p.id not in c.get(f"/api/assets/{history_asset['id']}").json()["locations"]
        assert clone["id"] in c.get(f"/api/assets/{history_asset['id']}").json()["locations"]
        for table in ("jobs", "revisions", "comments"):
            assert not service.store.rows(f"SELECT * FROM {table} WHERE project_id=:id", id=p.id)
        assert not service.store.rows("SELECT id FROM asset_folders WHERE id=:id", id=folder["id"])
        assert c.get(f"/api/projects/{clone['id']}?revision=1").status_code == 200


def test_disk_failure_is_durable_visible_and_retryable(tmp_path, monkeypatch):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    j, files = job(service, project(service))
    unlink = Path.unlink

    def failing(path, *args, **kwargs):
        if path == files[0]:
            raise PermissionError("Simulated locked file")
        return unlink(path, *args, **kwargs)

    with TestClient(app) as c:
        monkeypatch.setattr(Path, "unlink", failing)
        result = c.delete(f"/api/jobs/{j['id']}").json()
        assert result["pending_files"] == 1 and files[0].exists()
        assert c.get("/api/storage/cleanup").json()["pending_files"] == 1
        assert c.get(f"/api/jobs/{j['id']}").status_code == 404
        monkeypatch.setattr(Path, "unlink", unlink)
    # Fresh application, same data directory: no in-memory cleanup dependency.
    with TestClient(create_app(tmp_path, start_worker=False)) as c:
        result = c.post("/api/storage/cleanup").json()
        assert result["pending_files"] == 0 and result["freed_bytes"] > 0
        assert not any(f.exists() for f in files)
        assert c.post("/api/storage/cleanup").json()["freed_bytes"] == 0


def test_running_render_stops_before_deletion_and_worker_continues(tmp_path, monkeypatch):
    async def run():
        service = Service(Store(tmp_path))
        worker = Worker(service)
        inspection = Inspection(service)
        worker.cleanup_lock = inspection.lifecycle
        deletion = Deletion(service, worker, inspection)
        p = project(service)
        j = service.enqueue(p.id, RenderRequest())
        started, stopped = asyncio.Event(), asyncio.Event()

        async def rendering(self, _project, output, **kwargs):
            output.write_bytes(b"partial")
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                # A late final write simulates subprocess shutdown flushing bytes.
                await asyncio.sleep(0.02)
                output.write_bytes(b"late bytes")
                stopped.set()

        monkeypatch.setattr(Renderer, "render", rendering)
        await worker.start()
        await asyncio.wait_for(started.wait(), 2)
        result = await asyncio.wait_for(deletion.jobs(DeleteJobsRequest(job_ids=[j["id"]])), 2)
        assert stopped.is_set() and worker.active_id is None
        assert result["job_ids"] == [j["id"]]
        assert not service.store.path(f"renders/{j['id']}.mp4").exists()
        assert not worker.task.done()
        await worker.stop()
        service.store.engine.dispose()

    asyncio.run(run())


def test_project_deletes_actual_renderer_cache_without_touching_shared_keys(tmp_path):
    async def run():
        service = Service(Store(tmp_path))
        p = project(service)
        output = service.store.path("renders/qa.mp4")
        await Renderer(service).render(p, output, quality="preview")
        caches = reusable_files([p.model_dump()], {})
        existing = {path for path in caches if service.store.path(path).exists()}
        assert existing
        # A clone shares caption keys, which must remain available.
        other = service.clone(p.id, "Shared caption", 1)
        worker, inspection = Worker(service), Inspection(service)
        deletion = Deletion(service, worker, inspection)
        await deletion.project(p.id, 1)
        assert all(service.store.path(path).exists() for path in existing)
        await deletion.project(other.id, 1)
        assert not any(service.store.path(path).exists() for path in existing)
        service.store.engine.dispose()

    asyncio.run(run())


def test_database_failure_rolls_back_cleanup_intent_and_keeps_files(tmp_path, monkeypatch):
    async def run():
        service = Service(Store(tmp_path))
        worker, inspection = Worker(service), Inspection(service)
        deletion = Deletion(service, worker, inspection)
        p = project(service)
        j, files = job(service, p)
        schedule = deletion.schedule

        def failing(conn, paths):
            schedule(conn, paths)
            raise RuntimeError("Simulated transaction failure")

        monkeypatch.setattr(deletion, "schedule", failing)
        import pytest

        with pytest.raises(RuntimeError, match="transaction failure"):
            await deletion.project(p.id, p.revision)
        assert service.get(p.id).revision == 1
        assert service.store.job(j["id"])["status"] == "completed"
        assert all(f.exists() for f in files)
        assert not service.store.rows("SELECT * FROM file_cleanup")
        assert worker.paused is False
        service.store.engine.dispose()

    asyncio.run(run())


def test_deletion_waits_for_in_flight_inspection(tmp_path, monkeypatch):
    async def run():
        service = Service(Store(tmp_path))
        worker, inspection = Worker(service), Inspection(service)
        deletion = Deletion(service, worker, inspection)
        p = project(service)
        j, _ = job(service, p)
        started, finish = asyncio.Event(), asyncio.Event()
        path = service.store.path(f"cache/sheet-{p.id}-r1-inflight.jpg")

        async def inspecting(*_):
            started.set()
            await finish.wait()
            path.write_bytes(b"late inspection")

        monkeypatch.setattr(inspection, "_sheet", inspecting)
        inspecting_task = asyncio.create_task(inspection.sheet(p.id))
        await started.wait()
        deleting = asyncio.create_task(deletion.jobs(DeleteJobsRequest(job_ids=[j["id"]])))
        await asyncio.sleep(0)
        assert not deleting.done()
        finish.set()
        await inspecting_task
        result = await deleting
        assert result["pending_files"] == 0 and not path.exists()
        service.store.engine.dispose()

    asyncio.run(run())


def test_delete_job_removes_own_delivery_preserves_other_export_bundles(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    p = project(service)
    first, _ = job(service, p)
    second, _ = job(service, p)
    removed = service.store.path(f"cache/delivery-{p.id}-r1-{first['id']}-bundle.zip")
    retained = service.store.path(f"cache/delivery-{p.id}-r1-{second['id']}-bundle.zip")
    removed.write_bytes(b"first")
    retained.write_bytes(b"second")
    with TestClient(app) as c:
        assert c.delete(f"/api/jobs/{first['id']}").status_code == 200
        assert not removed.exists() and retained.read_bytes() == b"second"


def test_delete_unused_media_removes_provenance_and_source_sheets(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    with TestClient(app) as c:
        p = project(service)
        asset = upload(c, p.id, "red")
        sidecars = [
            service.store.path(f"cache/{asset['id']}-{suffix}")
            for suffix in ("provenance.json", "source-test.jpg")
        ]
        for f in sidecars:
            f.write_bytes(b"cache")
        result = c.post(
            "/api/assets/delete", json={"assets": [{"id": asset["id"], "expected_version": asset["version"]}]}
        )
        assert result.status_code == 200, result.text
        assert not any(f.exists() for f in sidecars)
