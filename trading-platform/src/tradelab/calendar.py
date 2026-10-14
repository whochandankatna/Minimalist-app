"""NSE trading calendar for the Capital Market segment.

Source of truth is a versioned JSON file per year under config/calendar/, citing
the official NSE circulars. Dates outside the covered years raise
CalendarCoverageError: we never guess whether an uncovered date is a session.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from .clock import IST
from .settings import CONFIG_DIR


class CalendarCoverageError(RuntimeError):
    """Raised when asked about a date the calendar files do not cover."""


@dataclass(frozen=True)
class SpecialSession:
    day: date
    name: str
    open: time | None
    close: time | None
    status: str
    strategy_trades: bool
    counts_toward_experiment: bool


@dataclass
class YearCalendar:
    year: int
    holidays: dict[date, str]
    special: dict[date, SpecialSession]
    open_time: time
    close_time: time
    pre_open_start: time
    verification_status: str
    verified_at: str | None
    sources: list[dict[str, Any]]
    file_sha256: str
    path: Path


@dataclass
class TradingCalendar:
    years: dict[int, YearCalendar] = field(default_factory=dict)

    @classmethod
    def load(cls, directory: Path | None = None) -> "TradingCalendar":
        directory = directory or (CONFIG_DIR / "calendar")
        cal = cls()
        for p in sorted(directory.glob("nse_cm_*.json")):
            raw = p.read_bytes()
            data = json.loads(raw)
            hours = data["regular_hours"]
            special = {}
            for s in data.get("special_sessions", []):
                d = date.fromisoformat(s["date"])
                special[d] = SpecialSession(
                    day=d,
                    name=s["name"],
                    open=time.fromisoformat(s["open"]) if s.get("open") else None,
                    close=time.fromisoformat(s["close"]) if s.get("close") else None,
                    status=s.get("status", ""),
                    strategy_trades=bool(s.get("strategy_trades", False)),
                    counts_toward_experiment=bool(s.get("counts_toward_experiment", False)),
                )
            yc = YearCalendar(
                year=int(data["year"]),
                holidays={date.fromisoformat(h["date"]): h["name"] for h in data["holidays"]},
                special=special,
                open_time=time.fromisoformat(hours["open"]),
                close_time=time.fromisoformat(hours["close"]),
                pre_open_start=time.fromisoformat(hours["pre_open_start"]),
                verification_status=data["verification"]["status"],
                verified_at=data["verification"].get("verified_at"),
                sources=data["sources"],
                file_sha256=hashlib.sha256(raw).hexdigest(),
                path=p,
            )
            for h in yc.holidays:
                if h.year != yc.year:
                    raise ValueError(f"{p}: holiday {h} outside year {yc.year}")
            cal.years[yc.year] = yc
        return cal

    # ---- coverage -------------------------------------------------------
    def _year(self, d: date) -> YearCalendar:
        yc = self.years.get(d.year)
        if yc is None:
            raise CalendarCoverageError(
                f"No NSE calendar file for {d.year}. Add config/calendar/nse_cm_{d.year}.json from the official circular."
            )
        return yc

    def covers(self, d: date) -> bool:
        return d.year in self.years

    def coverage_end(self) -> date | None:
        return date(max(self.years), 12, 31) if self.years else None

    def is_verified(self, d: date) -> bool:
        return self._year(d).verification_status == "VERIFIED"

    # ---- sessions --------------------------------------------------------
    def is_regular_session(self, d: date) -> bool:
        """A normal full trading session (weekday, not a holiday)."""
        yc = self._year(d)
        return d.weekday() < 5 and d not in yc.holidays

    def special_session(self, d: date) -> SpecialSession | None:
        return self._year(d).special.get(d)

    def holiday_name(self, d: date) -> str | None:
        return self._year(d).holidays.get(d)

    def session_hours(self, d: date) -> tuple[datetime, datetime] | None:
        yc = self._year(d)
        if self.is_regular_session(d):
            return (datetime.combine(d, yc.open_time, IST), datetime.combine(d, yc.close_time, IST))
        sp = yc.special.get(d)
        if sp and sp.open and sp.close:
            return (datetime.combine(d, sp.open, IST), datetime.combine(d, sp.close, IST))
        return None

    def is_market_open(self, at: datetime) -> bool:
        at = at.astimezone(IST)
        hours = self.session_hours(at.date())
        return bool(hours and hours[0] <= at < hours[1])

    def next_regular_session(self, after: date) -> date:
        d = after + timedelta(days=1)
        for _ in range(400):
            if self.is_regular_session(d):
                return d
            d += timedelta(days=1)
        raise CalendarCoverageError("no session found within 400 days")

    def previous_regular_session(self, before: date) -> date:
        d = before - timedelta(days=1)
        for _ in range(400):
            if self.is_regular_session(d):
                return d
            d -= timedelta(days=1)
        raise CalendarCoverageError("no session found within 400 days")

    def regular_sessions_between(self, start: date, end: date) -> list[date]:
        """Inclusive list of regular sessions."""
        out = []
        d = start
        while d <= end:
            if self.is_regular_session(d):
                out.append(d)
            d += timedelta(days=1)
        return out

    def nth_session_from(self, start: date, n: int) -> date:
        """The n-th regular session counting `start` as 1 if it is a session."""
        d = start if self.is_regular_session(start) else self.next_regular_session(start)
        for _ in range(n - 1):
            d = self.next_regular_session(d)
        return d
