import json
import os
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import create_engine, event, text


def now():
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or os.environ.get("SYNKINEMA_DATA", ".data")).resolve()
        for part in ("library", "renders", "cache", "uploads", "channel-logos"):
            (self.root / part).mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{self.root / 'synkinema.db'}", connect_args={"timeout": 30})

        @event.listens_for(self.engine, "connect")
        def pragmas(connection, _):
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=30000")

        with self.engine.begin() as conn:
            for statement in [
                "CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY)",
                "CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS channel_records(id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id), kind TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS channel_records_channel ON channel_records(channel_id,kind,created_at)",
                "INSERT OR IGNORE INTO schema_version VALUES(1)",
                "CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS revisions(project_id TEXT REFERENCES projects(id), revision INTEGER, document TEXT NOT NULL, operation TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id, revision))",
                "CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, document TEXT NOT NULL, checksum TEXT NOT NULL, created_at TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS asset_folders(id TEXT PRIMARY KEY, scope TEXT NOT NULL, name TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS assets_checksum ON assets(checksum)",
                "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), status TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at)",
                "CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), document TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS file_cleanup(path TEXT PRIMARY KEY, error TEXT)",
                "CREATE TABLE IF NOT EXISTS production_tasks(id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS production_tasks_status ON production_tasks(status, created_at)",
            ]:
                conn.execute(text(statement))
            if not conn.execute(text("SELECT version FROM schema_version WHERE version=2")).first():
                from .library import DEFAULT_FOLDERS, default_folder

                for folder_id, name in DEFAULT_FOLDERS.items():
                    conn.execute(
                        text("INSERT OR IGNORE INTO asset_folders VALUES(:id,'library',:name)"),
                        {"id": folder_id, "name": name},
                    )
                for row in conn.execute(text("SELECT id,document FROM assets")).all():
                    doc = json.loads(row[1])
                    doc["locations"] = {"library": default_folder(doc)}
                    conn.execute(
                        text("UPDATE assets SET document=:doc WHERE id=:id"),
                        {"id": row[0], "doc": json.dumps(doc)},
                    )
                conn.execute(text("INSERT INTO schema_version VALUES(2)"))

    @contextmanager
    def transaction(self):
        with self.engine.connect() as conn:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise

    def rows(self, query, **params):
        with self.engine.connect() as conn:
            return [dict(r._mapping) for r in conn.execute(text(query), params)]

    def execute(self, query, **params):
        with self.engine.begin() as conn:
            conn.execute(text(query), params)

    def path(self, relative):
        resolved = (self.root / relative).resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("Path escapes media storage")
        return resolved

    def job(self, job_id):
        rows = self.rows("SELECT document FROM jobs WHERE id=:id", id=job_id)
        if not rows:
            raise KeyError("Render job not found")
        return json.loads(rows[0]["document"])

    def cleanup_files(self):
        """Durable outbox: metadata deletion and cleanup intent commit together.

        Unlink immediately, retry failures on the worker's maintenance ticks and
        after restart. Missing files count as clean, so crash recovery is idempotent.
        """
        files, size = 0, 0
        for row in self.rows("SELECT path FROM file_cleanup"):
            try:
                path = self.path(row["path"])
                length = path.stat().st_size if path.exists() else 0
                path.unlink(missing_ok=True)
                self.execute("DELETE FROM file_cleanup WHERE path=:path", path=row["path"])
                files += bool(length)
                size += length
            except OSError as exc:
                self.execute(
                    "UPDATE file_cleanup SET error=:error WHERE path=:path",
                    path=row["path"],
                    error=str(exc),
                )
        return {
            "deleted_files": files,
            "freed_bytes": size,
            "pending_files": len(self.rows("SELECT path FROM file_cleanup")),
        }

    def update_job(self, job_id, **changes):
        with self.transaction() as conn:
            row = conn.execute(text("SELECT document FROM jobs WHERE id=:id"), {"id": job_id}).first()
            if not row:
                raise KeyError("Render job not found")
            doc = json.loads(row[0])
            doc.update(changes)
            conn.execute(
                text("UPDATE jobs SET status=:status, document=:doc WHERE id=:id"),
                {"status": doc["status"], "doc": json.dumps(doc), "id": job_id},
            )
        return doc
