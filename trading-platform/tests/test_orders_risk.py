"""Order lifecycle, fill models, sizing and risk limits."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from sqlalchemy import select

from tradelab.accounting import portfolio
from tradelab.clock import IST
from tradelab.context import AppContext
from tradelab.execution.fillmodel import BarFillModel, OrderView, QuoteFillModel
from tradelab.execution.paper import order_id_for
from tradelab.experiment import controls
from tradelab.experiment.engine import ForwardEngine, JobResult
from tradelab.marketdata.base import Bar, DepthLevel, Quote
from tradelab.models import Experiment, Order
from tradelab.strategy.momentum import buy_limit, entry_quantity, sell_limit

from .conftest import start_demo

D = date(2026, 10, 14)
T = datetime(2026, 10, 14, 9, 30, tzinfo=IST)


def q(px: int, ask_qty: int = 1000, bid_qty: int = 1000, t: datetime = T) -> Quote:
    return Quote("NIFTYBEES", "TEST", t, t, t, px, px, px, 0, (DepthLevel(px - 1, bid_qty),),
                 (DepthLevel(px + 1, ask_qty),), int(px * 0.8), int(px * 1.2))


def _exp(s, eid: int) -> Experiment:  # type: ignore[no-untyped-def]
    e = s.get(Experiment, eid)
    assert e is not None
    return e


def test_duplicate_intent_returns_same_order(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        a = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 5, 30_000, "ENTRY", "2026-10-14:ENTRY:NIFTYBEES", "r")
        b = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 9, 31_000, "ENTRY", "2026-10-14:ENTRY:NIFTYBEES", "r")
        assert a.id == b.id == order_id_for(eid, "2026-10-14:ENTRY:NIFTYBEES")
        assert s.scalars(select(Order)).all() == [a]


def test_partial_fills_accumulate_and_respect_limit(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        o = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 30, 29_100, "ENTRY", "p", "r")
        ctx.broker.process_quotes(s, e, T + timedelta(seconds=3), {"NIFTYBEES": q(29_000, ask_qty=40)}, set())
        assert (o.filled_qty, o.status) == (10, "PARTIALLY_FILLED")  # 25% of 40 displayed
        assert o.reserved_paise > 0
        ctx.broker.process_quotes(s, e, T + timedelta(seconds=63), {"NIFTYBEES": q(29_500)}, set())
        assert o.filled_qty == 10, "ask above limit: no further fill"
        ctx.broker.process_quotes(s, e, T + timedelta(seconds=123), {"NIFTYBEES": q(29_000)}, set())
        assert o.status == "FILLED" and o.reserved_paise == 0
        assert o.avg_fill_price_paise <= 29_100
        assert portfolio.reconcile(s, e) == []


def test_quote_model_latency_and_stale() -> None:
    m = QuoteFillModel()
    o = OrderView("BUY", 10, 10_100, T + timedelta(seconds=2))
    assert m.decide(o, q(10_000), T, False, 1)[0] is None  # latency
    assert m.decide(o, q(10_000), T + timedelta(seconds=5), True, 1)[0] is None  # stale
    assert m.decide(o, q(10_000), T + timedelta(seconds=5), False, 1)[0] is not None


def test_bar_model_touch_is_not_a_fill_and_gaps_fill_at_open() -> None:
    m = BarFillModel(participation_of_volume=0.5)
    o = OrderView("BUY", 10, 10_000, T)
    touch = Bar("X", D, 10_200, 10_300, 10_000, 10_100, 1000, "T")
    assert m.decide(o, touch, 1)[0] is None
    through = Bar("X", D, 10_200, 10_300, 9_999, 10_100, 1000, "T")
    dec = m.decide(o, through, 1)[0]
    assert dec is not None and dec.price == 10_000
    gap_down = Bar("X", D, 9_500, 9_600, 9_400, 9_550, 1000, "T")
    dec = m.decide(o, gap_down, 1)[0]
    assert dec is not None and 9_500 <= dec.price <= 10_000
    s_o = OrderView("SELL", 10, 9_000, T)
    gap_below_stop = Bar("X", D, 8_000, 8_100, 7_900, 8_050, 1000, "T")
    assert m.decide(s_o, gap_below_stop, 1)[0] is None, "a sell limit is never filled below its limit"
    thin = Bar("X", D, 10_000, 10_000, 10_000, 10_000, 4, "T")
    dec = BarFillModel(participation_of_volume=0.5).decide(OrderView("BUY", 10, 10_100, T), thin, 1)[0]
    assert dec is not None and dec.qty == 2, "volume cap produces partial fill"


def test_price_band_and_tick_rejections(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        r = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 1, 40_000, "ENTRY", "b", "r", (20_000, 35_000))
        assert r.status == "REJECTED" and "band" in (r.reject_reason or "")


def test_no_short_selling_no_margin_and_max_invested(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        assert ctx.broker.submit(s, e, T, D, "NIFTYBEES", "SELL", 1, 29_000, "EXIT", "s", "r").status == "REJECTED"
        big = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 50, 29_000, "ENTRY", "x", "r")  # Rs14,500 > 12,500
        assert big.status == "REJECTED" and "maximum aggregate invested" in (big.reject_reason or "")
        ok1 = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 21, 29_000, "ENTRY", "y", "r")
        assert ok1.status == "OPEN"
        ok2 = ctx.broker.submit(s, e, T, D, "GOLDBEES", "BUY", 65, 10_000, "ENTRY", "z", "r")  # 6,097 + 6,507 > 12,500
        assert ok2.status == "REJECTED", "pending reservations count towards the cap"
        assert ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 1, 29_000, "EXIT", "w", "r").status == "REJECTED"


def test_sizing_whole_units() -> None:
    assert buy_limit(28_973, 50, 1) == 29_117
    assert sell_limit(29_000, 300, 1, 25_000) == 28_130
    assert sell_limit(29_000, 3000, 1, 23_200) == 23_200  # clamped to band
    qty = entry_quantity(625_000, 29_117)
    assert qty == 21 and qty * 29_117 <= 625_000
    assert entry_quantity(625_000, 700_000) == 0  # one unit costs more than the slot: no trade


def test_drawdown_pauses_entries_and_halt_liquidates(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    eng = ForwardEngine(ctx)
    res = JobResult()
    with ctx.db.session() as s:
        e = _exp(s, eid)
        e.peak_economic_equity_paise = 2_600_000
        eng._apply_risk_rules(s, e, 2_465_000, T, res)  # 5.2% below peak
        assert e.entries_paused and "AUTO" in (e.entries_paused_reason or "")
        assert not e.liquidation_requested
        o = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 1, 29_000, "ENTRY", "after-pause", "r")
        assert o.status == "REJECTED", "pause blocks new entries"
    with ctx.db.session() as s:
        e = _exp(s, eid)
        controls.resume_entries(s, ctx, e, "user:test", "reviewed")
        pending = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 5, 29_000, "ENTRY", "pending", "r")
        assert pending.status == "OPEN"
        eng._apply_risk_rules(s, e, 2_249_000, T, res)  # below Rs22,500
        assert e.liquidation_requested and e.entries_paused
        assert pending.status == "CANCELLED", "halt cancels pending buys"
        try:
            controls.resume_entries(s, ctx, e, "user:test", "nope")
            raise AssertionError("resume after halt must fail")
        except ValueError:
            pass


def test_pause_cancel_liquidate_are_distinct(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        buy = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "BUY", 10, 29_100, "ENTRY", "b1", "r")
        ctx.broker.process_quotes(s, e, T + timedelta(seconds=5), {"NIFTYBEES": q(29_000)}, set())
        assert buy.status == "FILLED"
        sell = ctx.broker.submit(s, e, T, D, "NIFTYBEES", "SELL", 5, 35_000, "EXIT", "s1", "r")
        controls.pause_entries(s, ctx, e, "user:t", "test")
        assert sell.status == "OPEN", "pause does not touch pending sells"
        assert portfolio.positions(s, eid)["NIFTYBEES"].qty == 10
        controls.cancel_pending(s, ctx, e, "user:t")
        assert sell.status == "CANCELLED"
        assert portfolio.positions(s, eid)["NIFTYBEES"].qty == 10, "cancel does not sell holdings"
        controls.request_liquidation(s, ctx, e, "user:t", "test")
        assert e.liquidation_requested
        assert portfolio.positions(s, eid)["NIFTYBEES"].qty == 10, "liquidation only queues sells"


def test_review_payload_is_json(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    eng = ForwardEngine(ctx)
    with ctx.db.session() as s:
        e = _exp(s, eid)
        eng._make_review(s, e, 5, T)
        from tradelab.models import Review

        r = s.scalars(select(Review)).one()
        assert "frozen" in json.loads(r.summary_json)["reminder"]
