"""Private host persistence containing conversations, never project/media data."""

import os
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import create_engine, event, text


def now():
    return datetime.now(UTC).isoformat()


class ChatStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name == "posix" and self.root.stat().st_mode & 0o077:
            raise ValueError("Chat storage must be a private directory (0700)")
        self.engine = create_engine(f"sqlite:///{self.root / 'chat.db'}", connect_args={"timeout": 30})

        @event.listens_for(self.engine, "connect")
        def pragmas(connection, _):
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=30000")

    def path(self, relative):
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Path escapes chat storage")
        return path

    def rows(self, query, **params):
        with self.engine.connect() as conn:
            return [dict(row._mapping) for row in conn.execute(text(query), params)]

    def execute(self, query, **params):
        with self.engine.begin() as conn:
            conn.execute(text(query), params)

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
