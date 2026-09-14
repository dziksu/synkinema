"""Project collections and named folders; memberships share the original media bytes."""

import json

from sqlalchemy import text

from .models import uid

DEFAULT_FOLDERS = {
    "sound-effects": "Sound effects",
    "music": "Music",
    "videos": "Videos",
    "images": "Images",
    "voiceovers": "Voiceovers",
}


def default_folder(asset):
    tags = {t.casefold() for t in asset.get("tags", [])}
    name = asset.get("name", "").casefold()
    if {"sfx", "sound-effect", "transition", "whoosh"} & tags or (
        asset["kind"] == "audio" and name.startswith(("sfx", "transition", "whoosh"))
    ):
        return "sound-effects"
    if asset["kind"] == "image":
        return "images"
    if asset["kind"] == "video":
        return "videos"
    return (
        "voiceovers"
        if {"voice", "voiceover", "narration"} & tags or name.startswith(("voice", "narration", "lektor"))
        else "music"
    )


class Library:
    def media_scope(self, project_id=None):
        if project_id:
            self.get(project_id)
        return project_id or "library"

    def folders(self, project_id=None):
        scope = self.media_scope(project_id)
        return self.store.rows(
            "SELECT id,name FROM asset_folders WHERE scope=:scope ORDER BY name COLLATE NOCASE", scope=scope
        )

    def validate_folder(self, project_id=None, folder_id=None):
        scope = self.media_scope(project_id)
        if folder_id and not self.store.rows(
            "SELECT id FROM asset_folders WHERE id=:id AND scope=:scope", id=folder_id, scope=scope
        ):
            raise ValueError("Folder does not belong to this media collection")
        return scope

    def create_folder(self, name, project_id=None):
        scope = self.media_scope(project_id)
        name = self.folder_name(name)
        folder = {"id": uid(), "name": name}
        with self.store.transaction() as conn:
            self.media_scope(project_id)
            if conn.execute(
                text("SELECT id FROM asset_folders WHERE scope=:scope AND lower(name)=lower(:name)"),
                {"scope": scope, "name": name},
            ).first():
                raise ValueError("A folder with this name already exists")
            conn.execute(
                text("INSERT INTO asset_folders VALUES(:id,:scope,:name)"), {**folder, "scope": scope}
            )
        return folder

    @staticmethod
    def folder_name(name):
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise ValueError("Folder name must contain 1 to 100 characters")
        return name.strip()

    def rename_folder(self, folder_id, name):
        name = self.folder_name(name)
        with self.store.transaction() as conn:
            row = conn.execute(
                text("SELECT scope FROM asset_folders WHERE id=:id"), {"id": folder_id}
            ).first()
            if not row:
                raise KeyError("Folder not found")
            if conn.execute(
                text(
                    "SELECT id FROM asset_folders WHERE scope=:scope AND lower(name)=lower(:name) AND id!=:id"
                ),
                {"scope": row[0], "name": name, "id": folder_id},
            ).first():
                raise ValueError("A folder with this name already exists")
            conn.execute(
                text("UPDATE asset_folders SET name=:name WHERE id=:id"), {"id": folder_id, "name": name}
            )
        return {"id": folder_id, "name": name}

    def locate_asset(self, asset_id, project_id=None, folder_id=None):
        with self.store.transaction() as conn:
            scope = self.validate_folder(project_id, folder_id)
            row = conn.execute(text("SELECT document FROM assets WHERE id=:id"), {"id": asset_id}).first()
            if not row:
                raise KeyError("Asset not found")
            doc = json.loads(row[0])
            doc.setdefault("locations", {})[scope] = folder_id or ""
            self.save_asset(conn, doc)
        return doc

    def asset_inventory(self):
        """Local owner's complete inventory; does not share private memberships."""
        return [
            {"version": 1, **json.loads(r["document"])}
            for r in self.store.rows("SELECT document FROM assets ORDER BY created_at DESC")
        ]

    @staticmethod
    def clean_tags(tags):
        if len(tags) > 50 or any(
            not isinstance(t, str) or not t.strip() or len(t.strip()) > 100 for t in tags
        ):
            raise ValueError("Use at most 50 nonblank tags of up to 100 characters")
        return sorted({t.strip() for t in tags})

    @staticmethod
    def read_asset(conn, asset_id, expected_version=None):
        from .service import Conflict

        row = conn.execute(text("SELECT document FROM assets WHERE id=:id"), {"id": asset_id}).first()
        if not row:
            raise KeyError("Asset not found")
        doc = {"version": 1, **json.loads(row[0])}
        if expected_version is not None and doc["version"] != expected_version:
            raise Conflict(
                "Media changed in another edit. Reload its details and review before saving or deleting."
            )
        return doc

    @staticmethod
    def save_asset(conn, doc):
        original = json.loads(
            conn.execute(text("SELECT document FROM assets WHERE id=:id"), {"id": doc["id"]}).scalar_one()
        )
        doc["version"] = original.get("version", 1)
        if {k: v for k, v in doc.items() if k != "version"} == {
            k: v for k, v in original.items() if k != "version"
        }:
            return doc
        doc["version"] += 1
        conn.execute(
            text("UPDATE assets SET document=:doc WHERE id=:id"), {"doc": json.dumps(doc), "id": doc["id"]}
        )
        return doc

    def update_asset(self, asset_id, request):
        name = request.name.strip()
        if not name:
            raise ValueError("Media name cannot be blank")
        tags = self.clean_tags(request.tags)
        with self.store.transaction() as conn:
            doc = self.read_asset(conn, asset_id, request.expected_version)
            doc.update(name=name, tags=tags, source=request.source.strip(), license=request.license.strip())
            return self.save_asset(conn, doc)

    def usage_in(self, conn, asset_id):
        from .deletion import asset_ids

        projects = {}
        for row in conn.execute(text("SELECT id,document FROM projects")):
            p = json.loads(row[1])
            projects[row[0]] = {
                "project_id": row[0],
                "name": p["name"],
                "current": asset_id in asset_ids(p),
                "revisions": [],
                "job_ids": [],
            }
        for pid, revision, document in conn.execute(
            text("SELECT project_id,revision,document FROM revisions ORDER BY revision DESC")
        ):
            if asset_id in asset_ids(json.loads(document)):
                projects[pid]["revisions"].append(revision)
        for jid, pid, document in conn.execute(text("SELECT id,project_id,document FROM jobs")):
            if asset_id in asset_ids(json.loads(document)["snapshot"]):
                projects[pid]["job_ids"].append(jid)
        return [p for p in projects.values() if p["current"] or p["revisions"] or p["job_ids"]]

    def asset_usage(self, asset_id):
        with self.store.engine.connect() as conn:
            doc = self.read_asset(conn, asset_id)
            projects = self.usage_in(conn, asset_id)
            return {
                "asset_id": asset_id,
                "version": doc["version"],
                "can_delete": not projects,
                "projects": projects,
            }

    def remove_asset_location(self, asset_id, request):
        from .service import Conflict

        with self.store.transaction() as conn:
            scope = self.media_scope(request.project_id)
            doc = self.read_asset(conn, asset_id, request.expected_version)
            uses = self.usage_in(conn, asset_id)
            if any(u["project_id"] == scope and u["current"] for u in uses):
                raise Conflict(
                    "This media is used in the current project. Remove its timeline clips and project asset references first."
                )
            locations = doc.setdefault("locations", {})
            if scope not in locations:
                return doc
            if len(locations) == 1 and not uses:
                raise Conflict(
                    "This is the file's last collection and it has no project references. Use Delete from disk to avoid leaving unassigned files."
                )
            locations.pop(scope)
            if scope == "library":
                # Projects that previously relied on the shared membership keep
                # access through private collections, including undo history.
                for use in uses:
                    locations.setdefault(use["project_id"], "")
            return self.save_asset(conn, doc)

    def batch_assets(self, request):
        if len(set(request.asset_ids)) != len(request.asset_ids):
            raise ValueError("Select each asset only once")
        tags = self.clean_tags(request.tags)
        if request.action == "locate" and request.destination is None:
            raise ValueError("A destination is required for locate")
        if request.action != "locate" and request.destination is not None:
            raise ValueError("Destination is only valid for locate")
        if request.action == "locate" and tags:
            raise ValueError("Tags are only valid for tag operations")
        with self.store.transaction() as conn:
            docs = [self.read_asset(conn, aid) for aid in request.asset_ids]
            if request.action == "locate":
                dest = request.destination
                scope = self.validate_folder(dest.project_id, dest.folder_id)
                for doc in docs:
                    doc.setdefault("locations", {})[scope] = dest.folder_id or ""
            else:
                for doc in docs:
                    existing = set(doc["tags"])
                    doc["tags"] = self.clean_tags(
                        list(existing | set(tags) if request.action == "add_tags" else existing - set(tags))
                    )
            return [self.save_asset(conn, doc) for doc in docs]

    def delete_folder(self, folder_id):
        with self.store.transaction() as conn:
            row = conn.execute(
                text("SELECT scope FROM asset_folders WHERE id=:id"), {"id": folder_id}
            ).first()
            if not row:
                raise KeyError("Folder not found")
            scope, changed = row[0], []
            for aid, document in conn.execute(text("SELECT id,document FROM assets")):
                doc = json.loads(document)
                if doc.get("locations", {}).get(scope) == folder_id:
                    doc["locations"][scope] = ""
                    changed.append(self.save_asset(conn, doc))
            conn.execute(text("DELETE FROM asset_folders WHERE id=:id"), {"id": folder_id})
        return {
            "folder_id": folder_id,
            "project_id": None if scope == "library" else scope,
            "assets": changed,
        }
