"""Explicit project/export deletion with durable, reference-aware file cleanup."""

import json
from contextlib import asynccontextmanager

from sqlalchemy import text

from .media import TEXT_CACHE_VERSION, text_cache_name
from .models import Project
from .renderer import prepare_visual, visual_cache_key
from .service import Conflict
from .storage import now


def asset_ids(document):
    return (
        set(document.get("asset_ids", []))
        | {c["asset_id"] for t in document.get("tracks", []) for c in t["clips"] if c.get("asset_id")}
        | {line["audio_asset_id"] for line in document.get("script_lines", []) if line.get("audio_asset_id")}
    )


def reusable_files(documents, assets):
    """Reconstruct existing cache keys for both output qualities; never render."""
    files = set()
    for document in documents:
        p = Project.model_validate(document)
        for quality in ("final", "preview"):
            profile = p.profile.model_copy()
            if quality == "preview":
                ratio = min(1, 640 / max(profile.width, profile.height))
                profile.width = max(128, round(profile.width * ratio / 2) * 2)
                profile.height = max(128, round(profile.height * ratio / 2) * 2)
                profile.crf = 27
            for track in p.tracks:
                for clip in track.clips:
                    if track.kind == "text" or clip.shape:
                        # Preserve/delete old and current raster caches using the same reference rules.
                        for version in ("v3", "v4", "v5", TEXT_CACHE_VERSION):
                            files.add(
                                f"cache/{text_cache_name(clip, profile.width, profile.height, version)}"
                            )
                    elif track.kind in ("video", "overlay") and clip.asset_id in assets:
                        transparent = track.kind == "overlay"
                        source, box_profile = prepare_visual(clip, profile, transparent)
                        key = visual_cache_key(
                            source, assets[clip.asset_id]["checksum"], box_profile, transparent
                        )
                        suffix = ".mkv" if transparent else ".mp4"
                        files.update((f"cache/clip-{key}{suffix}", f"cache/clip-{key}.partial{suffix}"))
    return files


class Deletion:
    def __init__(self, service, worker, inspection):
        self.service, self.worker, self.inspection = service, worker, inspection
        self.store = service.store

    @asynccontextmanager
    async def guard(self):
        async with self.inspection.lifecycle:
            self.worker.paused = True
            try:
                yield
            finally:
                self.worker.paused = False

    async def jobs(self, request):
        async with self.guard():
            rows = self.store.rows("SELECT document FROM jobs")
            jobs = [json.loads(r["document"]) for r in rows]
            if request.project_id:
                self.service.get(request.project_id)
                jobs = [j for j in jobs if j["project_id"] == request.project_id]
            if request.job_ids is not None:
                wanted = set(request.job_ids)
                jobs = [j for j in jobs if j["id"] in wanted]
                if wanted != {j["id"] for j in jobs}:
                    raise KeyError("One or more render jobs do not exist in this scope")
            elif request.status == "finished":
                jobs = [j for j in jobs if j["status"] in ("completed", "failed", "cancelled")]
            for job in jobs:
                await self.worker.cancel_and_wait(job["id"])
            with self.store.transaction() as conn:
                files = self.job_files(jobs)
                for job in jobs:
                    conn.execute(text("DELETE FROM jobs WHERE id=:id"), {"id": job["id"]})
                self.schedule(conn, files)
            return {
                "job_ids": [j["id"] for j in jobs],
                "project_ids": [],
                "asset_ids": [],
                **self.store.cleanup_files(),
            }

    async def assets(self, request):
        if len({a.id for a in request.assets}) != len(request.assets):
            raise ValueError("Select each asset only once")
        async with self.guard():
            with self.store.transaction() as conn:
                docs = [
                    self.service.read_asset(conn, item.id, item.expected_version) for item in request.assets
                ]
                for doc in docs:
                    uses = self.service.usage_in(conn, doc["id"])
                    if uses:
                        names = ", ".join(u["name"] for u in uses[:3])
                        raise Conflict(
                            f"Media '{doc['name']}' is used by projects or their history/render snapshots: {names}. Remove sharing instead; no selected file was deleted."
                        )
                for doc in docs:
                    sidecars = {
                        str(p.relative_to(self.store.root))
                        for p in self.store.path("cache").glob(f"{doc['id']}-*")
                    }
                    self.schedule(conn, {doc["path"], f"cache/{doc['id']}.jpg"} | sidecars)
                    conn.execute(text("DELETE FROM assets WHERE id=:id"), {"id": doc["id"]})
            return {
                "asset_ids": [d["id"] for d in docs],
                "job_ids": [],
                "project_ids": [],
                **self.store.cleanup_files(),
            }

    async def script_audio(self, project_id, line_id, request):
        """Explicit source removal; scrub only this take's script/inventory history."""
        aid = request.audio_asset_id

        def clear_take(document):
            if any(c.get("asset_id") == aid for t in document["tracks"] for c in t["clips"]):
                raise Conflict(
                    "This audio is used on this project's timeline or its history. Remove audio cannot delete a timeline source."
                )
            for line in document.get("script_lines", []):
                if line.get("audio_asset_id") != aid:
                    continue
                if line["id"] != line_id:
                    raise Conflict(
                        "This audio is also used by another script line or its history. Its source was kept; nothing was removed."
                    )
                line.update(audio_asset_id=None, audio_text=None, audio_source=None)
            document["asset_ids"] = [value for value in document.get("asset_ids", []) if value != aid]

        async with self.guard():
            with self.store.transaction() as conn:
                row = conn.execute(
                    text("SELECT document,revision FROM projects WHERE id=:id"), {"id": project_id}
                ).first()
                if not row:
                    raise KeyError("Project not found")
                if row[1] != request.expected_revision:
                    raise Conflict(
                        f"Expected revision {request.expected_revision}; current revision is {row[1]}. Reload before removing audio."
                    )
                document = json.loads(row[0])
                line = next(
                    (line for line in document.get("script_lines", []) if line["id"] == line_id), None
                )
                if line is None:
                    raise KeyError("Script line not found")
                if line.get("audio_asset_id") != aid:
                    raise Conflict("This line's audio changed. Reload before removing it.")
                asset = self.service.read_asset(conn, aid, request.expected_version)
                clear_take(document)
                # Validate every historical dependency before writing. Timeline
                # undo remains intact; only explicit Script take removal is irreversible.
                revisions = [
                    (r[0], json.loads(r[1]))
                    for r in conn.execute(
                        text("SELECT revision,document FROM revisions WHERE project_id=:id"),
                        {"id": project_id},
                    )
                ]
                jobs = [
                    (r[0], json.loads(r[1]))
                    for r in conn.execute(
                        text("SELECT id,document FROM jobs WHERE project_id=:id"), {"id": project_id}
                    )
                ]
                for _, historical in revisions:
                    clear_take(historical)
                for _, job in jobs:
                    clear_take(job["snapshot"])
                for rev, historical in revisions:
                    conn.execute(
                        text("UPDATE revisions SET document=:doc WHERE project_id=:id AND revision=:rev"),
                        {"id": project_id, "rev": rev, "doc": json.dumps(historical)},
                    )
                for jid, job in jobs:
                    conn.execute(
                        text("UPDATE jobs SET document=:doc WHERE id=:id"),
                        {"id": jid, "doc": json.dumps(job)},
                    )
                document["revision"] = row[1] + 1
                project = Project.model_validate(document)
                params = {
                    "id": project_id,
                    "rev": project.revision,
                    "doc": project.model_dump_json(),
                    "time": now(),
                }
                conn.execute(
                    text("UPDATE projects SET revision=:rev,document=:doc,updated_at=:time WHERE id=:id"),
                    params,
                )
                conn.execute(
                    text("INSERT INTO revisions VALUES(:id,:rev,:doc,'remove_script_audio',:time)"), params
                )
                asset.setdefault("locations", {}).pop(project_id, None)
                uses = self.service.usage_in(conn, aid)
                retained = bool(asset["locations"] or uses)
                if retained:
                    for use in uses:
                        asset["locations"].setdefault(use["project_id"], "")
                    self.service.save_asset(conn, asset)
                else:
                    files = {asset["path"], f"cache/{aid}.jpg"} | {
                        str(p.relative_to(self.store.root)) for p in self.store.path("cache").glob(f"{aid}-*")
                    }
                    self.schedule(conn, files)
                    conn.execute(text("DELETE FROM assets WHERE id=:id"), {"id": aid})
            return {
                "project": self.service.summary(project),
                "asset_ids": [] if retained else [aid],
                "retained_asset_id": aid if retained else None,
                "project_ids": [],
                "job_ids": [],
                **self.store.cleanup_files(),
            }

    def job_files(self, jobs):
        files = set()
        for job in jobs:
            # Also catches interrupted .mix/.partial outputs. IDs come from DB.
            files.update(
                str(p.relative_to(self.store.root)) for p in self.store.path("renders").glob(f"{job['id']}.*")
            )
            # Older frame/sheet hashes don't encode job IDs. Invalidate the whole
            # project's inspection cache, safely regenerable for retained jobs.
            for prefix in ("preview", "frame", "sheet", "audio"):
                files.update(
                    str(p.relative_to(self.store.root))
                    for p in self.store.path("cache").glob(f"{prefix}-{job['project_id']}-*")
                )
            files.update(
                str(p.relative_to(self.store.root))
                for p in self.store.path("cache").glob(f"delivery-{job['project_id']}-r*-{job['id']}*.*")
            )
        return files

    def schedule(self, conn, files):
        for path in files:
            self.store.path(path)  # Reject traversal before committing anything.
            conn.execute(text("INSERT OR IGNORE INTO file_cleanup(path) VALUES(:path)"), {"path": path})

    async def project(self, project_id, expected_revision):
        async with self.guard():
            p = self.service.get(project_id)
            if p.revision != expected_revision:
                raise Conflict(f"Expected revision {expected_revision}, current revision is {p.revision}")
            jobs = [
                json.loads(r["document"])
                for r in self.store.rows("SELECT document FROM jobs WHERE project_id=:id", id=project_id)
            ]
            for job in jobs:
                await self.worker.cancel_and_wait(job["id"])
            with self.store.transaction() as conn:
                row = conn.execute(
                    text("SELECT revision FROM projects WHERE id=:id"), {"id": project_id}
                ).first()
                if not row:
                    raise KeyError("Project not found")
                if row[0] != expected_revision:
                    raise Conflict(
                        "Project changed while stopping renders. Review the latest revision before deleting."
                    )
                # Include all jobs, even ones enqueued while cancellation awaited.
                jobs = [
                    json.loads(r[0])
                    for r in conn.execute(
                        text("SELECT document FROM jobs WHERE project_id=:id"), {"id": project_id}
                    )
                ]
                revisions = [
                    (r[0], json.loads(r[1]))
                    for r in conn.execute(text("SELECT project_id,document FROM revisions"))
                ]
                owned = [d for pid, d in revisions if pid == project_id]
                owned += [job["snapshot"] for job in jobs]
                others = [d for pid, d in revisions if pid != project_id]
                others += [
                    json.loads(r[0])["snapshot"]
                    for r in conn.execute(
                        text("SELECT document FROM jobs WHERE project_id!=:id"), {"id": project_id}
                    )
                ]
                assets = {
                    r[0]: json.loads(r[1]) for r in conn.execute(text("SELECT id,document FROM assets"))
                }
                used = set().union(*(asset_ids(d) for d in others))
                owned_ids = set().union(*(asset_ids(d) for d in owned))
                files = self.job_files(jobs)
                # Empty projects may have inspection artifacts without any job.
                files |= self.job_files([{"id": "__none__", "project_id": project_id}])
                files |= reusable_files(owned, assets) - reusable_files(others, assets)
                deleted_assets = []
                for aid, asset in assets.items():
                    locations = asset.get("locations", {})
                    if project_id not in locations and aid not in owned_ids:
                        continue
                    locations.pop(project_id, None)
                    if not locations and aid not in used:
                        files.add(asset["path"])
                        files.add(f"cache/{aid}.jpg")
                        files.update(
                            str(p.relative_to(self.store.root))
                            for p in self.store.path("cache").glob(f"{aid}-*")
                        )
                        conn.execute(text("DELETE FROM assets WHERE id=:id"), {"id": aid})
                        deleted_assets.append(aid)
                    else:
                        # A clone/history may use a private source without an
                        # explicit membership. Retain and expose it in that project.
                        for pid, d in revisions:
                            if pid != project_id and aid in asset_ids(d):
                                locations.setdefault(pid, "")
                        self.service.save_asset(conn, asset)
                for table in ("jobs", "comments", "revisions"):
                    conn.execute(text(f"DELETE FROM {table} WHERE project_id=:id"), {"id": project_id})
                conn.execute(text("DELETE FROM asset_folders WHERE scope=:id"), {"id": project_id})
                conn.execute(text("DELETE FROM projects WHERE id=:id"), {"id": project_id})
                self.schedule(conn, files)
            return {
                "job_ids": [j["id"] for j in jobs],
                "project_ids": [project_id],
                "asset_ids": deleted_assets,
                **self.store.cleanup_files(),
            }
