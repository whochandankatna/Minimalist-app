from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest

from tradelab.calendar import TradingCalendar
from tradelab.clock import IST, FakeClock
from tradelab.context import AppContext, build_context
from tradelab.db import Database
from tradelab.experiment.engine import ForwardEngine
from tradelab.experiment.lifecycle import create_experiment, start_experiment
from tradelab.marketdata.base import Universe
from tradelab.marketdata.mock import MockMarketData
from tradelab.models import Experiment
from tradelab.scheduler import run_job
from tradelab.settings import Settings


@pytest.fixture
def make_ctx(tmp_path: Path) -> Callable[..., AppContext]:
    def _make(start: datetime, file_db: bool = False, **settings_kw: object) -> AppContext:
        clock = FakeClock(start)
        st = Settings(data_dir=tmp_path / "data", market_data="mock", scheduler_enabled=False, **settings_kw)  # type: ignore[arg-type]
        db = Database(st.db_path if file_db else None)
        cal = TradingCalendar.load()
        return build_context(settings=st, clock=clock, db=db, market=MockMarketData(Universe.load(), clock, cal))

    return _make


@pytest.fixture
def ctx(make_ctx: Callable[..., AppContext]) -> AppContext:
    # Tuesday 2026-10-13 18:00 IST -> first session Wed 2026-10-14
    return make_ctx(datetime(2026, 10, 13, 18, 0, tzinfo=IST))


def start_demo(ctx: AppContext) -> int:
    with ctx.db.session() as s:
        e = create_experiment(s, ctx, "test", "DEMO")
        checks = start_experiment(s, e, ctx)
        assert e.status == "RUNNING", [c for c in checks if not c.ok]
        return e.id


def run_day(ctx: AppContext, eng: ForwardEngine, d: date, monitor_every: int = 30, close: bool = True) -> None:
    clock = ctx.clock
    assert isinstance(clock, FakeClock)
    if not ctx.calendar.is_regular_session(d):
        return
    for hh, mm, job in ((8, 45, "pre_session"), (9, 20, "submit_orders")):
        clock.set(datetime.combine(d, time(hh, mm), IST))
        run_job(ctx, job, getattr(eng, job))
    t = datetime.combine(d, time(9, 21), IST)
    while t < datetime.combine(d, time(15, 25), IST):
        clock.set(t)
        run_job(ctx, "monitor", eng.monitor, record_skips=False)
        t += timedelta(minutes=monitor_every)
    if close:
        for hh, mm, job in ((15, 25, "expire_orders"), (15, 50, "post_close")):
            clock.set(datetime.combine(d, time(hh, mm), IST))
            run_job(ctx, job, getattr(eng, job))


def get_exp(ctx: AppContext, exp_id: int) -> Experiment:
    with ctx.db.session() as s:
        e = s.get(Experiment, exp_id)
        assert e is not None
        return e


@pytest.fixture
def engine(ctx: AppContext) -> Iterator[ForwardEngine]:
    yield ForwardEngine(ctx)
