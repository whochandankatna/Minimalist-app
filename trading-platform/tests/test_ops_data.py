"""Stale data, token expiry, disconnections, restart recovery, calendar and timezone."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import select

from tradelab.calendar import CalendarCoverageError, TradingCalendar
from tradelab.clock import IST, FakeClock
from tradelab.context import AppContext
from tradelab.experiment.engine import ForwardEngine
from tradelab.marketdata.kite import next_expiry
from tradelab.marketdata.kite_session import current_session, store_session
from tradelab.marketdata.mock import MockMarketData
from tradelab.models import ExperimentSession, Incident, Order, Signal

from .conftest import get_exp, run_day, start_demo


# ------------------------------------------------------------------ calendar
def test_calendar_holidays_weekends_and_special_sessions() -> None:
    cal = TradingCalendar.load()
    assert not cal.is_regular_session(date(2026, 10, 20))  # Dussehra
    assert cal.holiday_name(date(2026, 10, 20)) == "Dussehra"
    assert not cal.is_regular_session(date(2026, 10, 17))  # Saturday
    assert cal.is_regular_session(date(2026, 10, 19))
    assert cal.next_regular_session(date(2026, 10, 19)) == date(2026, 10, 21)
    assert cal.previous_regular_session(date(2026, 10, 5)) == date(2026, 10, 1)  # skips Gandhi Jayanti
    sp = cal.special_session(date(2026, 11, 8))
    assert sp is not None and not sp.counts_toward_experiment and not sp.strategy_trades
    assert not cal.is_regular_session(date(2026, 11, 8))
    with pytest.raises(CalendarCoverageError):
        cal.is_regular_session(date(2027, 1, 4))


def test_twenty_sessions_from_mid_october_skip_holidays() -> None:
    cal = TradingCalendar.load()
    s = cal.regular_sessions_between(date(2026, 10, 15), date(2026, 11, 13))
    for h in (date(2026, 10, 20), date(2026, 11, 10)):
        assert h not in s
    assert cal.nth_session_from(date(2026, 10, 15), 20) == s[19]


def test_market_hours_in_ist_regardless_of_server_timezone() -> None:
    cal = TradingCalendar.load()
    # 03:44 UTC == 09:14 IST (closed); 03:45 UTC == 09:15 IST (open); 10:00 UTC == 15:30 IST (closed)
    assert not cal.is_market_open(datetime(2026, 10, 14, 3, 44, tzinfo=timezone.utc))
    assert cal.is_market_open(datetime(2026, 10, 14, 3, 45, tzinfo=timezone.utc))
    assert not cal.is_market_open(datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc))
    # 20:00 UTC on Oct 13 is already Oct 14 01:30 IST
    assert datetime(2026, 10, 13, 20, 0, tzinfo=timezone.utc).astimezone(IST).date() == date(2026, 10, 14)


def test_kite_token_expiry_is_six_am_ist() -> None:
    assert next_expiry(datetime(2026, 10, 14, 8, 30, tzinfo=IST)) == datetime(2026, 10, 15, 6, 0, tzinfo=IST)
    assert next_expiry(datetime(2026, 10, 14, 5, 59, tzinfo=IST)) == datetime(2026, 10, 14, 6, 0, tzinfo=IST)


def test_kite_session_storage_expires(ctx: AppContext) -> None:
    with ctx.db.session() as s:
        store_session(s, datetime(2026, 10, 14, 8, 0, tzinfo=IST), "tok", "AB1234")
    with ctx.db.session() as s:
        assert current_session(s, datetime(2026, 10, 14, 15, 0, tzinfo=IST)) is not None
        assert current_session(s, datetime(2026, 10, 15, 6, 0, tzinfo=IST)) is None


# --------------------------------------------------------- stale / auth / net
def _setup_running(ctx: AppContext) -> tuple[int, ForwardEngine]:
    eid = start_demo(ctx)
    eng = ForwardEngine(ctx)
    clock = ctx.clock
    assert isinstance(clock, FakeClock)
    clock.set(datetime(2026, 10, 14, 8, 45, tzinfo=IST))
    eng.pre_session()
    return eid, eng


def _entry_orders(ctx: AppContext) -> list[Order]:
    with ctx.db.session() as s:
        return list(s.scalars(select(Order).where(Order.intent == "ENTRY")))


def test_session_one_submits_entries_when_healthy(ctx: AppContext) -> None:
    eid, eng = _setup_running(ctx)
    with ctx.db.session() as s:
        sig = s.scalars(select(Signal)).one()
        assert sig.data_through < sig.valid_for
    assert isinstance(ctx.clock, FakeClock)
    ctx.clock.set(datetime(2026, 10, 14, 9, 20, tzinfo=IST))
    eng.submit_orders()
    import json

    with ctx.db.session() as s:
        payload = json.loads(s.scalars(select(Signal)).one().payload_json)
    assert len(_entry_orders(ctx)) == len(payload["entries"])


def test_stale_data_blocks_new_entries(ctx: AppContext) -> None:
    eid, eng = _setup_running(ctx)
    assert isinstance(ctx.market, MockMarketData) and isinstance(ctx.clock, FakeClock)
    ctx.market.stale_by = timedelta(minutes=10)
    ctx.clock.set(datetime(2026, 10, 14, 9, 20, tzinfo=IST))
    res = eng.submit_orders()
    assert _entry_orders(ctx) == []
    assert any("stale" in n for n in res.notes)
    with ctx.db.session() as s:
        assert s.scalars(select(Incident).where(Incident.component == "stale_data")).first() is not None


def test_token_expiry_blocks_entries_and_records_incident(ctx: AppContext) -> None:
    eid, eng = _setup_running(ctx)
    assert isinstance(ctx.market, MockMarketData) and isinstance(ctx.clock, FakeClock)
    ctx.market.auth_expired = True
    ctx.clock.set(datetime(2026, 10, 14, 9, 20, tzinfo=IST))
    eng.submit_orders()
    assert _entry_orders(ctx) == []
    with ctx.db.session() as s:
        inc = s.scalars(select(Incident).where(Incident.component == "auth")).one()
        assert inc.severity == "ERROR"
    # after re-login the incident resolves on the next successful fetch
    ctx.market.auth_expired = False
    ctx.clock.set(datetime(2026, 10, 14, 9, 25, tzinfo=IST))
    eng.monitor()
    with ctx.db.session() as s:
        assert s.scalars(select(Incident).where(Incident.component == "auth")).one().resolved_at is not None


def test_disconnect_does_not_crash_or_fill(ctx: AppContext) -> None:
    eid, eng = _setup_running(ctx)
    assert isinstance(ctx.market, MockMarketData) and isinstance(ctx.clock, FakeClock)
    ctx.clock.set(datetime(2026, 10, 14, 9, 20, tzinfo=IST))
    eng.submit_orders()
    before = [(o.id, o.filled_qty) for o in _entry_orders(ctx)]
    ctx.market.disconnected = True
    ctx.clock.set(datetime(2026, 10, 14, 10, 0, tzinfo=IST))
    res = eng.monitor()
    assert any("data" in n for n in res.notes)
    assert [(o.id, o.filled_qty) for o in _entry_orders(ctx)] == before


# --------------------------------------------------------- restart recovery
def test_restart_recovery_reconciles_and_closes_missed_sessions(make_ctx: Callable[..., AppContext]) -> None:
    ctx1 = make_ctx(datetime(2026, 10, 13, 18, 0, tzinfo=IST), file_db=True)
    eid = start_demo(ctx1)
    eng1 = ForwardEngine(ctx1)
    run_day(ctx1, eng1, date(2026, 10, 14), close=False)  # crash mid-day: no expire, no post-close
    with ctx1.db.session() as s:
        open_before = [o.id for o in s.scalars(select(Order).where(Order.status.in_(("OPEN", "PARTIALLY_FILLED"))))]
    ctx1.db.engine.dispose()

    # "restart" two days later: new process, same database file
    ctx2 = make_ctx(datetime(2026, 10, 16, 8, 0, tzinfo=IST), file_db=True)
    eng2 = ForwardEngine(ctx2)
    res = eng2.recover()
    assert any("recovered missed session 2026-10-14" in n for n in res.notes)
    assert any("recovered missed session 2026-10-15" in n for n in res.notes)
    with ctx2.db.session() as s:
        rows = {r.session_date: r for r in s.scalars(select(ExperimentSession))}
        assert rows[date(2026, 10, 14)].status == "CLOSED" and rows[date(2026, 10, 14)].session_number == 1
        assert rows[date(2026, 10, 15)].quality != "OK"
        assert "offline" in (rows[date(2026, 10, 15)].quality_notes or "")
        for oid in open_before:
            o = s.get(Order, oid)
            assert o is not None and o.status in ("EXPIRED", "PART_EXPIRED")
        from tradelab.accounting.portfolio import reconcile

        assert reconcile(s, get_exp(ctx2, eid)) == []
    # recovery is idempotent
    assert not any("recovered" in n for n in eng2.recover().notes)
    # duplicate-safe resubmission: re-running today's submit twice creates no duplicates
    assert isinstance(ctx2.clock, FakeClock)
    ctx2.clock.set(datetime(2026, 10, 16, 8, 45, tzinfo=IST))
    eng2.pre_session()
    ctx2.clock.set(datetime(2026, 10, 16, 9, 20, tzinfo=IST))
    eng2.submit_orders()
    n1 = len(_entry_orders(ctx2)) + 0
    eng2.submit_orders()
    assert len(_entry_orders(ctx2)) == n1


def test_full_session_cycle_and_completion(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    eng = ForwardEngine(ctx)
    d = date(2026, 10, 14)
    while get_exp(ctx, eid).status == "RUNNING":
        run_day(ctx, eng, d, monitor_every=60)
        d += timedelta(days=1)
        assert d < date(2026, 12, 1)
    e = get_exp(ctx, eid)
    assert e.status in ("COMPLETED", "HALTED")
    with ctx.db.session() as s:
        rows = list(s.scalars(select(ExperimentSession).where(ExperimentSession.session_number.is_not(None))
                              .order_by(ExperimentSession.session_date)))
        if e.status == "COMPLETED":
            assert [r.session_number for r in rows] == list(range(1, 21))
            assert date(2026, 10, 20) not in [r.session_date for r in rows]
            assert date(2026, 11, 10) not in [r.session_date for r in rows]
        from tradelab.models import Review

        assert {r.checkpoint for r in s.scalars(select(Review))} >= {5, 10}
        assert all(r.status == "CLOSED" for r in rows)
    _ = time
