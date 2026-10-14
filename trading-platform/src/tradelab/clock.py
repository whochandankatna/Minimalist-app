"""Time source. Everything market-related uses Asia/Kolkata (IST, UTC+05:30, no DST).

A Clock object is injected so tests can control time precisely.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Protocol
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc).astimezone(IST)


class FakeClock:
    """Manually advanced clock for tests and backtests."""

    def __init__(self, start: datetime) -> None:
        if start.tzinfo is None:
            raise ValueError("FakeClock needs an aware datetime")
        self._now = start.astimezone(IST)

    def now(self) -> datetime:
        return self._now

    def set(self, when: datetime) -> None:
        if when.tzinfo is None:
            raise ValueError("aware datetime required")
        self._now = when.astimezone(IST)

    def advance(self, **kwargs: float) -> None:
        self._now = self._now + timedelta(**kwargs)


def ist(y: int, m: int, d: int, hh: int = 0, mm: int = 0, ss: int = 0) -> datetime:
    return datetime(y, m, d, hh, mm, ss, tzinfo=IST)


def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        # Naive datetimes from SQLite are stored as UTC by this app.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def ist_date(dt: datetime) -> date:
    return to_ist(dt).date()
