"""Database engine/session setup (SQLite, WAL mode).

SQLite keeps hosting simple and cheap for a single-user app; the models use
plain SQLAlchemy types so Postgres can be swapped in later via the URL.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator[datetime]):
    """Stores aware datetimes as naive UTC; returns aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime not allowed; use an aware datetime")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


def make_engine(db_path: Path | None) -> Engine:
    """db_path None => private in-memory database (tests, backtests)."""
    if db_path is None:
        from sqlalchemy.pool import StaticPool

        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    else:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False, "timeout": 30}
        )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn: Any, _rec: Any) -> None:
        cur = dbapi_conn.cursor()
        if db_path is not None:
            cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA synchronous=FULL")
        cur.close()

    return engine


def init_db(engine: Engine) -> None:
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)


class Database:
    def __init__(self, db_path: Path | None) -> None:
        self.path = db_path
        self.engine = make_engine(db_path)
        init_db(self.engine)
        self._factory = sessionmaker(self.engine, expire_on_commit=False)

    @contextmanager
    def session(self) -> Iterator[Session]:
        """Unit of work: commits on success, rolls back on any exception."""
        s = self._factory()
        try:
            yield s
            s.commit()
        except BaseException:
            s.rollback()
            raise
        finally:
            s.close()

    def backup_to(self, target: Path) -> None:
        """Consistent online backup using SQLite's backup API."""
        import sqlite3

        if self.path is None:
            raise RuntimeError("cannot back up an in-memory database")
        target.parent.mkdir(parents=True, exist_ok=True)
        src = sqlite3.connect(self.path)
        dst = sqlite3.connect(target)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
