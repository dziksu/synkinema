import copy
import hashlib
import json
import shutil
from pathlib import Path

from sqlalchemy import text

from .channels import Channels
from .library import Library, default_folder
from .media import make_thumbnail, probe
from .models import BatchRequest, Clip, Operation, Project, RenderRequest, Track, Transition, uid
from .storage import Store, now


class Conflict(Exception):
    pass


class Service(Library, Channels):
    def __init__(self, store: Store):
        self.store = store

    def projects(self):
        return [
            self.summary(Project.model_validate_json(r["document"]))
            for r in self.store.rows("SELECT document FROM projects ORDER BY updated_at DESC")
        ]

    def summary(self, project):
        created = self.store.rows(
            "SELECT created_at FROM revisions WHERE project_id=:id ORDER BY revision LIMIT 1",
            id=project.id,
        )
        return {
            **project.model_dump(),
            "duration_ms": project.duration_ms,
            "created_at": created[0]["created_at"] if created else "",
            "channel_context": self.channel_context(project.channel_id),
        }

    def get(self, project_id, revision=None):
        if revision is None:
            rows = self.store.rows("SELECT document FROM projects WHERE id=:id", id=project_id)
        else:
            rows = self.store.rows(
                "SELECT document FROM revisions WHERE project_id=:id AND revision=:rev",
                id=project_id,
                rev=revision,
            )
        if not rows:
            raise KeyError("Project or revision not found")
        return Project.model_validate_json(rows[0]["document"])

    def create(self, project: Project, legacy_source=None):
        from .renderer import validate_timeline
        from .timeline import validate_lane_edits

        validate_timeline(project)
        validate_lane_edits(project, legacy_source)
        project = project.model_copy(update={"id": uid(), "revision": 1})
        with self.store.transaction() as conn:
            self.validate_channel(project.channel_id, conn)
            self.validate_assets(project)
            params = {"id": project.id, "rev": 1, "doc": project.model_dump_json(), "time": now()}
            conn.execute(text("INSERT INTO projects VALUES(:id,:rev,:doc,:time)"), params)
            conn.execute(text("INSERT INTO revisions VALUES(:id,:rev,:doc,'create',:time)"), params)
        return project

    def clone(self, project_id, name, revision):
        source = self.get(project_id, revision)
        doc = source.model_dump()
        doc["name"] = name
        return self.create(Project.model_validate(doc), legacy_source=source)

    def preflight(self, project_id, revision=None, *, require_script_audio=False):
        from .preflight import preflight

        return preflight(self, self.get(project_id, revision), require_script_audio=require_script_audio)

    def history(self, project_id):
        self.get(project_id)
        return self.store.rows(
            "SELECT revision, operation, created_at FROM revisions WHERE project_id=:id ORDER BY revision DESC",
            id=project_id,
        )

    def validate_assets(self, project):
        for track in project.tracks:
            for clip in track.clips:
                allowed = (
                    {"scale", "x", "y", "opacity"}
                    if track.kind in ("video", "overlay")
                    else {"opacity"}
                    if track.kind == "text"
                    else {"gain_db"}
                )
                if any(a.property not in allowed for a in clip.animations):
                    raise ValueError(
                        f"Unsupported animation on {track.kind} track; allowed: {sorted(allowed)}"
                    )
                if clip.shape:
                    if track.kind != "overlay" or clip.asset_id:
                        raise ValueError("Shapes require an overlay track and no asset_id")
                    if clip.effects or any(a.property != "opacity" for a in clip.animations):
                        raise ValueError(
                            "Shapes support opacity animation, rotation and fades; media effects are unsupported"
                        )
                    continue
                if track.kind == "text":
                    if not clip.text:
                        raise ValueError("Text clips require text")
                    continue
                if not clip.asset_id:
                    raise ValueError("Media clips require an asset")
                asset = self.asset(clip.asset_id)
                if track.kind in ("video", "overlay") and asset["kind"] not in ("video", "image"):
                    raise ValueError("Visual tracks require image or video assets")
                if track.kind not in ("video", "overlay") and not asset.get("has_audio"):
                    raise ValueError("Audio tracks require assets with audio")
                duration = asset.get("duration_ms")
                if duration and clip.source_in_ms + clip.duration_ms * clip.speed > duration + 100:
                    raise ValueError(f"Clip '{clip.name}' extends beyond source duration")
        for aid in project.asset_ids:
            self.asset(aid)
        for line in project.script_lines:
            if line.audio_asset_id:
                asset = self.asset(line.audio_asset_id)
                if asset["kind"] != "audio" or not asset.get("has_audio") or not asset.get("duration_ms"):
                    raise ValueError("Script lines require a probed audio asset with a duration")

    def apply(self, project_id, operation: Operation):
        return self._apply_edits(project_id, operation.expected_revision, [operation])

    def batch(self, project_id, request: BatchRequest):
        project = self._apply_edits(
            project_id,
            request.expected_revision,
            request.operations,
            dry_run=request.dry_run,
            validate_final=True,
        )
        return {
            "committed": not request.dry_run,
            "base_revision": request.expected_revision,
            "applied_operations": len(request.operations),
            "project": self.summary(project),
        }

    def _apply_edits(self, project_id, expected_revision, steps, dry_run=False, validate_final=False):
        from .renderer import validate_timeline

        with self.store.transaction() as conn:
            row = conn.execute(
                text("SELECT document,revision FROM projects WHERE id=:id"), {"id": project_id}
            ).first()
            if not row:
                raise KeyError("Project not found")
            if row[1] != expected_revision:
                raise Conflict(
                    f"Expected revision {expected_revision}; current revision is {row[1]}. Reload before editing."
                )
            doc = json.loads(row[0])
            previous = Project.model_validate(doc)
            for index, step in enumerate(steps):
                try:
                    doc = self._edit(doc, step, conn, project_id)
                except (KeyError, ValueError, TypeError) as exc:
                    if not validate_final and isinstance(exc, KeyError):
                        raise
                    raise ValueError(f"Step {index + 1} ({step.type}): {exc}") from exc
            doc["revision"] = row[1] + 1
            project = Project.model_validate(doc)
            self.validate_channel(project.channel_id, conn)
            self.validate_assets(project)
            kind = steps[0].type if not validate_final else "batch"
            validate_timeline(project)
            from .timeline import validate_lane_edits

            # Restore is an exact historical snapshot, including legacy lane layout.
            restored = next((s for s in reversed(steps) if s.type == "restore_revision"), None)
            baseline = self.get(project_id, restored.payload["revision"]) if restored else previous
            validate_lane_edits(project, baseline)
            if not dry_run:
                params = {
                    "id": project_id,
                    "rev": project.revision,
                    "doc": project.model_dump_json(),
                    "time": now(),
                    "op": kind,
                }
                conn.execute(
                    text("UPDATE projects SET revision=:rev,document=:doc,updated_at=:time WHERE id=:id"),
                    params,
                )
                conn.execute(text("INSERT INTO revisions VALUES(:id,:rev,:doc,:op,:time)"), params)
        return project

    def _edit(self, doc, step, conn, project_id):
        p = copy.deepcopy(step.payload)
        kind = step.type
        helper_fields = {
            "append_clip": {"track_id", "clip"},
            "duplicate_clip": {"track_id", "clip_id", "target_track_id", "new_clip_id", "start_ms"},
            "extract_audio": {"track_id", "clip_id", "target_track_id", "new_clip_id"},
        }
        if kind in helper_fields and set(p) - helper_fields[kind]:
            raise ValueError(f"Unsupported {kind} payload fields: {sorted(set(p) - helper_fields[kind])}")
        if kind == "extract_audio" and "target_track_id" not in p:
            raise ValueError("extract_audio requires target_track_id")
        if kind == "update_project":
            previous_lines = doc.get("script_lines", [])
            if set(p) - {
                "name",
                "brief",
                "script",
                "script_lines",
                "profile",
                "scenes",
                "asset_ids",
                "channel_id",
            }:
                raise ValueError("Unsupported project fields")
            if "script_lines" in p:
                from .models import ScriptLine

                lines = [ScriptLine.model_validate(line) for line in p["script_lines"]]
                p["script"] = "\n".join(line.text for line in lines)
            elif "script" in p and p["script"] != doc.get("script", ""):
                p["script_lines"] = []
            doc.update(p)
            if "script_lines" in p:
                from .script_audio import replace_script_audio

                replace_script_audio(self, doc, previous_lines)
        elif kind == "add_track":
            doc["tracks"].append(Track.model_validate(p).model_dump())
        elif kind == "reorder_tracks":
            ids = p["track_ids"]
            if len(ids) != len(doc["tracks"]) or set(ids) != {t["id"] for t in doc["tracks"]}:
                raise ValueError("Include every track exactly once")
            doc["tracks"] = sorted(doc["tracks"], key=lambda t: ids.index(t["id"]))
        elif kind == "restore_revision":
            restored = conn.execute(
                text("SELECT document FROM revisions WHERE project_id=:id AND revision=:rev"),
                {"id": project_id, "rev": p["revision"]},
            ).first()
            if not restored:
                raise KeyError("Revision not found")
            doc = json.loads(restored[0])
        else:
            track = next((t for t in doc["tracks"] if t["id"] == p.get("track_id")), None)
            if track is None:
                raise KeyError("Track not found")
            if kind == "remove_track":
                if set(p) - {"track_id", "remove_clips"} or type(p.get("remove_clips", False)) is not bool:
                    raise ValueError("remove_track accepts track_id and optional boolean remove_clips")
                if track["clips"] and not p.get("remove_clips", False):
                    raise ValueError("Remove or move the clips from this track first")
                doc["tracks"].remove(track)
            elif kind == "update_track":
                changes = p.get("changes", {})
                if set(changes) - {"name", "muted", "ducking", "gain_db"}:
                    raise ValueError("Unsupported track fields")
                track.update(changes)
            elif kind in ("add_clip", "append_clip"):
                data = p["clip"]
                if not isinstance(data, dict):
                    raise ValueError("clip must be an object")
                if kind == "append_clip":
                    if "start_ms" in data:
                        raise ValueError("append_clip computes start_ms; omit it")
                    data["start_ms"] = max(
                        (c["start_ms"] + c["duration_ms"] for c in track["clips"]), default=0
                    )
                    if "duration_ms" not in data and data.get("asset_id"):
                        asset = self.asset(data["asset_id"])
                        if asset.get("duration_ms"):
                            speed = data.get("speed", 1)
                            if not isinstance(speed, (int, float)) or not 0.25 <= speed <= 4:
                                raise ValueError("speed must be between 0.25 and 4")
                            data["duration_ms"] = int(
                                (asset["duration_ms"] - data.get("source_in_ms", 0)) / speed
                            )
                    if Transition.model_validate(data.get("transition", {})).type != "cut":
                        raise ValueError("Append with cut, then use set_transition")
                track["clips"].append(Clip.model_validate(data).model_dump())
            else:
                clip = next((c for c in track["clips"] if c["id"] == p.get("clip_id")), None)
                if clip is None:
                    raise KeyError("Clip not found")
                if kind in ("duplicate_clip", "extract_audio"):
                    target_id = p.get("target_track_id", track["id"])
                    target = next((t for t in doc["tracks"] if t["id"] == target_id), None)
                    if target is None:
                        raise KeyError("Target track not found")
                    new_id = p.get("new_clip_id", uid())
                    if kind == "duplicate_clip":
                        copied = copy.deepcopy(clip)
                        copied.update(
                            id=new_id,
                            start_ms=p.get(
                                "start_ms",
                                max((c["start_ms"] + c["duration_ms"] for c in target["clips"]), default=0),
                            ),
                            transition={"type": "cut", "duration_ms": 0},
                        )
                    else:
                        if track["kind"] not in ("video", "overlay"):
                            raise ValueError("extract_audio source must be a visual clip")
                        if target["kind"] not in ("voiceover", "music", "sound", "ambient"):
                            raise ValueError("extract_audio requires an audio target track")
                        if not self.asset(clip["asset_id"]).get("has_audio"):
                            raise ValueError("Source asset has no audio stream")
                        copied = {
                            k: clip[k]
                            for k in (
                                "name",
                                "asset_id",
                                "start_ms",
                                "duration_ms",
                                "source_in_ms",
                                "speed",
                                "gain_db",
                                "fade_in_ms",
                                "fade_out_ms",
                            )
                        }
                        copied.update(id=new_id, name=clip["name"][:292] + " • audio")
                    target["clips"].append(Clip.model_validate(copied).model_dump())
                    return doc
                if kind in ("move_clip", "remove_clip", "trim_clip"):
                    ordered = sorted(track["clips"], key=lambda c: c["start_ms"])
                    index = ordered.index(clip)
                    if index + 1 < len(ordered):
                        ordered[index + 1]["transition"] = {"type": "cut", "duration_ms": 0}
                    if (
                        kind != "trim_clip"
                        or p["changes"].get("start_ms", clip["start_ms"]) != clip["start_ms"]
                    ):
                        clip["transition"] = {"type": "cut", "duration_ms": 0}
                if kind == "remove_clip":
                    track["clips"].remove(clip)
                elif kind == "split_clip":
                    at = p["time_ms"] - clip["start_ms"]
                    if at < 100 or at > clip["duration_ms"] - 100:
                        raise ValueError("Split point must leave at least 100ms on both sides")
                    if clip["animations"]:
                        raise ValueError("Bake or remove animations before splitting this clip")
                    right = copy.deepcopy(clip)
                    right.update(
                        id=p.get("new_clip_id", uid()),
                        start_ms=clip["start_ms"] + at,
                        source_in_ms=clip["source_in_ms"] + round(at * clip["speed"]),
                        duration_ms=clip["duration_ms"] - at,
                        transition={"type": "cut", "duration_ms": 0},
                        fade_in_ms=0,
                    )
                    clip.update(duration_ms=at, fade_out_ms=0)
                    clip["fade_in_ms"] = min(clip["fade_in_ms"], at)
                    right["fade_out_ms"] = min(right["fade_out_ms"], right["duration_ms"])
                    track["clips"].append(right)
                elif kind == "set_transition":
                    if track["kind"] != "video":
                        raise ValueError("Transitions are available on the main video track")
                    ordered = sorted(track["clips"], key=lambda c: c["start_ms"])
                    index = ordered.index(clip)
                    transition = Transition.model_validate(p["transition"])
                    if index == 0 and transition.type != "cut":
                        raise ValueError("A transition requires a previous clip")
                    if index:
                        previous = ordered[index - 1]
                        overlap = transition.duration_ms if transition.type != "cut" else 0
                        if overlap >= min(previous["duration_ms"], clip["duration_ms"]):
                            raise ValueError("A transition must be shorter than both clips")
                        old_start = clip["start_ms"]
                        new_start = previous["start_ms"] + previous["duration_ms"] - overlap
                        delta = new_start - old_start
                        # Ripple subsequent material together to preserve aligned titles/audio.
                        for lane in doc["tracks"]:
                            for item in lane["clips"]:
                                if item["start_ms"] >= old_start:
                                    item["start_ms"] += delta
                        for scene in doc["scenes"]:
                            if scene["start_ms"] >= old_start:
                                scene["start_ms"] += delta
                    clip["transition"] = transition.model_dump()
                elif kind == "move_clip":
                    clip["start_ms"] = p["start_ms"]
                    if p.get("target_track_id"):
                        target = next((t for t in doc["tracks"] if t["id"] == p["target_track_id"]), None)
                        if not target:
                            raise KeyError("Target track not found")
                        track["clips"].remove(clip)
                        target["clips"].append(clip)
                else:
                    changes = p["changes"]
                    if "id" in changes:
                        raise ValueError("Clip identity is immutable")
                    clip.update(changes)
        return doc

    def asset(self, asset_id):
        rows = self.store.rows("SELECT document FROM assets WHERE id=:id", id=asset_id)
        if not rows:
            raise KeyError("Asset not found")
        return {"version": 1, **json.loads(rows[0]["document"])}

    def assets(self, query="", kind=None, project_id=None, folder_id=None):
        scope = self.validate_folder(project_id, folder_id)
        used = set()
        if project_id:
            project = self.get(project_id)
            used = (
                set(project.asset_ids)
                | {c.asset_id for t in project.tracks for c in t.clips if c.asset_id}
                | {line.audio_asset_id for line in project.script_lines if line.audio_asset_id}
            )
        result = [
            {"version": 1, **json.loads(r["document"])}
            for r in self.store.rows("SELECT document FROM assets ORDER BY created_at DESC")
        ]
        return [
            a
            for a in result
            if (scope in a.get("locations", {}) or a["id"] in used)
            and (folder_id is None or a.get("locations", {}).get(scope, "") == folder_id)
            and (not kind or a["kind"] == kind)
            and (not query or query.casefold() in (a["name"] + " " + " ".join(a["tags"])).casefold())
        ]

    def import_file(
        self, path: Path, name=None, tags=None, source="", license="", project_id=None, folder_id=None
    ):
        scope = self.validate_folder(project_id, folder_id)
        if tags is not None and (
            not isinstance(tags, list)
            or len(tags) > 50
            or any(not isinstance(t, str) or len(t) > 100 for t in tags)
        ):
            raise ValueError("Tags must be an array of at most 50 strings of 100 characters")
        metadata = probe(path)
        if not metadata["kind"]:
            raise ValueError("Unsupported media. Import an image, video or audio file.")
        with path.open("rb") as source_file:
            digest = hashlib.file_digest(source_file, "sha256").hexdigest()
        existing = self.store.rows("SELECT document FROM assets WHERE checksum=:hash", hash=digest)
        if existing:
            doc = json.loads(existing[0]["document"])
            return self.locate_asset(
                doc["id"],
                project_id,
                folder_id if folder_id is not None else doc.get("locations", {}).get(scope, ""),
            )
        asset_id = uid()
        suffix = path.suffix.lower()
        if suffix not in {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
            ".mp4",
            ".mov",
            ".mkv",
            ".webm",
            ".mp3",
            ".wav",
            ".flac",
            ".m4a",
            ".ogg",
            ".aiff",
        }:
            raise ValueError("Unsupported file extension")
        relative = f"library/{asset_id}{suffix}"
        shutil.copyfile(path, self.store.path(relative))
        doc = {
            "id": asset_id,
            "name": name or path.name,
            "path": relative,
            "url": f"/media/{relative}",
            "version": 1,
            "checksum": digest,
            "tags": tags or [],
            "source": source,
            "license": license,
            "created_at": now(),
            **metadata,
        }
        doc["locations"] = {
            scope: folder_id if folder_id is not None else ("" if project_id else default_folder(doc))
        }
        if metadata["kind"] in ("image", "video"):
            thumb = f"cache/{asset_id}.jpg"
            make_thumbnail(self.store.path(relative), self.store.path(thumb))
            doc["thumbnail_url"] = f"/media/{thumb}"
        try:
            with self.store.transaction() as conn:
                self.validate_folder(project_id, folder_id)
                conn.execute(
                    text("INSERT INTO assets VALUES(:id,:doc,:hash,:time)"),
                    {"id": asset_id, "doc": json.dumps(doc), "hash": digest, "time": now()},
                )
        except BaseException:
            self.store.path(relative).unlink(missing_ok=True)
            self.store.path(f"cache/{asset_id}.jpg").unlink(missing_ok=True)
            raise
        return doc

    def tag_asset(self, asset_id, tags):
        tags = self.clean_tags(tags)
        with self.store.transaction() as conn:
            doc = self.read_asset(conn, asset_id)
            doc["tags"] = tags
            return self.save_asset(conn, doc)

    def plan_export(self, project_id, request: RenderRequest):
        from .exporting import export_plan

        project = self.get(project_id)
        if request.expected_revision and request.expected_revision != project.revision:
            raise Conflict("Project changed before export planning")
        return export_plan(self, project, request.output, request.quality)

    def enqueue(self, project_id, request: RenderRequest, *, require_script_audio=False):
        project = self.get(project_id)
        if request.expected_revision and request.expected_revision != project.revision:
            raise Conflict("Project changed before rendering")
        if not project.duration_ms:
            raise ValueError("Add clips before rendering")
        if request.from_ms >= project.duration_ms or (
            request.to_ms and (request.to_ms <= request.from_ms or request.to_ms > project.duration_ms)
        ):
            raise ValueError("Preview range must be inside timeline")
        self.validate_assets(project)
        if require_script_audio:
            from .preflight import narration_link_issues

            issues = narration_link_issues(project)
            if issues:
                raise ValueError(
                    issues[0]["message"]
                    + " Unlinked assets: "
                    + ", ".join(sorted({issue["asset_id"] for issue in issues}))
                )
        from .renderer import validate_timeline

        validate_timeline(project)
        from .exporting import export_plan

        plan = export_plan(self, project, request.output, request.quality)
        job = {
            "id": uid(),
            "project_id": project_id,
            "project_name": project.name,
            "revision": project.revision,
            "status": "queued",
            "progress": 0,
            "phase": "Queued",
            "created_at": now(),
            "request": request.model_dump(),
            "snapshot": project.model_dump(),
            "error": None,
            "output_url": None,
            "output": plan.output.model_dump(),
            "warnings": [warning.model_dump() for warning in plan.warnings],
        }
        with self.store.transaction() as conn:
            current = self.get(project_id)
            if current.revision != project.revision:
                raise Conflict("Project changed before rendering")
            conn.execute(
                text("INSERT INTO jobs VALUES(:id,:pid,:status,:doc,:time)"),
                {
                    "id": job["id"],
                    "pid": project_id,
                    "status": "queued",
                    "doc": json.dumps(job),
                    "time": job["created_at"],
                },
            )
        return self.public_job(job)

    @staticmethod
    def public_job(job):
        return {k: v for k, v in job.items() if k != "snapshot"}

    def jobs(self, project_id=None):
        where = " WHERE project_id=:pid" if project_id else ""
        rows = self.store.rows(
            "SELECT document FROM jobs" + where + " ORDER BY created_at DESC LIMIT 100",
            **({"pid": project_id} if project_id else {}),
        )
        return [self.public_job(json.loads(r["document"])) for r in rows]

    def resolve_comment(self, project_id, comment_id):
        self.get(project_id)
        comment = next((c for c in self.comments(project_id) if c["id"] == comment_id), None)
        if comment is None:
            raise KeyError("Comment not found")
        comment["resolved"] = True
        self.store.execute(
            "UPDATE comments SET document=:doc WHERE id=:id", id=comment_id, doc=json.dumps(comment)
        )
        return comment

    def captions(self, project_id, revision=None, include_muted=False):
        project = self.get(project_id, revision)
        clips = sorted(
            [
                c
                for t in project.tracks
                if t.kind == "text" and (include_muted or not t.muted)
                for c in t.clips
            ],
            key=lambda c: c.start_ms,
        )

        def timestamp(ms):
            return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

        body = "\n\n".join(
            f"{i + 1}\n{timestamp(c.start_ms)} --> {timestamp(c.start_ms + c.duration_ms)}\n{c.text}"
            + (f"\n{c.subtitle}" if c.subtitle else "")
            for i, c in enumerate(clips)
        )
        return {
            "project_id": project.id,
            "revision": project.revision,
            "format": "srt",
            "text": body,
            "cue_count": len(clips),
        }

    def comment(self, project_id, revision, time_ms, message):
        project = self.get(project_id, revision)
        if not 0 <= time_ms <= project.duration_ms or not message.strip() or len(message) > 5000:
            raise ValueError("Invalid review comment")
        comment = {
            "id": uid(),
            "project_id": project_id,
            "revision": revision,
            "time_ms": time_ms,
            "message": message,
            "resolved": False,
            "created_at": now(),
        }
        self.store.execute(
            "INSERT INTO comments VALUES(:id,:pid,:doc)",
            id=comment["id"],
            pid=project_id,
            doc=json.dumps(comment),
        )
        return comment

    def comments(self, project_id):
        return [
            json.loads(r["document"])
            for r in self.store.rows("SELECT document FROM comments WHERE project_id=:id", id=project_id)
        ]
