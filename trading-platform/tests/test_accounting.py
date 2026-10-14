"""Accounting reconciliation, charges and expense treatment."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from tradelab.accounting import performance, portfolio
from tradelab.accounting.expenses import opex_accrued, setup_allocated
from tradelab.clock import IST
from tradelab.context import AppContext
from tradelab.fees import FeeSchedule, estimated_round_trip_cost, fill_charges
from tradelab.marketdata.base import DepthLevel, Quote
from tradelab.models import Expense, Experiment, Fill, LedgerEntry
from tradelab.money import fmt_inr, round_to_rupee, rupees

from .conftest import start_demo


def test_money_helpers() -> None:
    assert rupees("25000") == 2_500_000
    assert rupees("0.005") == 1  # half-up
    assert fmt_inr(123456789) == "₹12,34,567.89"
    assert fmt_inr(-150) == "-₹1.50"
    assert round_to_rupee(649) == 600 and round_to_rupee(650) == 700


def test_fee_schedule_matches_verified_rates() -> None:
    f = FeeSchedule.load()
    assert f.brokerage_rate == 0
    assert f.stt_rate_buy == Decimal("0.001") == f.stt_rate_sell
    assert f.exchange_txn_rate == Decimal("0.0000307")
    assert f.stamp_rate_buy == Decimal("0.00015")
    assert f.dp_charge_per_scrip_sell_day_paise == 1534


def test_charges_hand_calculated() -> None:
    f = FeeSchedule.load()
    t = rupees("6250")
    b = fill_charges(f, "BUY", t)
    assert b.stt == 600  # 6.25 -> rounded to Rs6
    assert b.exchange_txn == 19  # 0.191875
    assert b.sebi == 1 and b.ipft == 1  # 0.625 paise -> 1
    assert b.stamp == 94  # 0.9375
    assert b.gst == 4  # 18% of 21 paise = 3.78
    assert b.total == 600 + 19 + 1 + 1 + 94 + 4 + 0
    sl = fill_charges(f, "SELL", t)
    assert sl.stamp == 0 and sl.stt == 600
    rt = estimated_round_trip_cost(f, t)
    assert rt == b.total + sl.total + 1534
    assert 2800 < rt < 2950  # ~Rs28.8, ~0.46% of Rs6,250


def _q(sym: str, t: datetime, px: int, qty: int = 5000) -> Quote:
    return Quote(sym, "TEST", t, t, t, px, px, px, 10_000, (DepthLevel(px - 1, qty),), (DepthLevel(px + 1, qty),),
                 int(px * 0.8), int(px * 1.2))


def test_round_trip_reconciles_and_dp_once_per_scrip_day(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    now = datetime(2026, 10, 14, 9, 30, tzinfo=IST)
    d = date(2026, 10, 14)
    with ctx.db.session() as s:
        e = s.get(Experiment, eid)
        assert e is not None
        o = ctx.broker.submit(s, e, now, d, "NIFTYBEES", "BUY", 20, 30_000, "ENTRY", "k1", "test")
        ctx.broker.process_quotes(s, e, now + timedelta(seconds=5), {"NIFTYBEES": _q("NIFTYBEES", now, 29_000)}, set())
        assert o.status == "FILLED"
        s1 = ctx.broker.submit(s, e, now, d, "NIFTYBEES", "SELL", 10, 28_000, "EXIT", "k2", "test")
        s2 = ctx.broker.submit(s, e, now, d, "NIFTYBEES", "SELL", 10, 28_000, "EXIT", "k3", "test")
        ctx.broker.process_quotes(s, e, now + timedelta(seconds=9), {"NIFTYBEES": _q("NIFTYBEES", now, 29_500)}, set())
        assert s1.status == s2.status == "FILLED"
        dps = s.query(LedgerEntry).filter_by(experiment_id=eid, kind="DP_CHARGE").all()
        assert len(dps) == 1, "DP charge is once per scrip per sell day"
        assert portfolio.reconcile(s, e) == []
        assert portfolio.positions(s, eid) == {}
        cash = portfolio.cash(s, eid)
        fills_net = sum(-l.amount_paise for l in s.query(LedgerEntry).filter(
            LedgerEntry.experiment_id == eid, LedgerEntry.kind.in_(("CHARGES", "DP_CHARGE"))))
        realised = sum(f.realised_gross_paise for f in s.query(Fill).all())
        assert cash == e.starting_capital_paise + realised - fills_net


def test_duplicate_ledger_posting_refused(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        with pytest.raises(portfolio.AccountingError):
            portfolio.post(s, eid, ctx.clock.now(), date(2026, 10, 14), "INITIAL_CAPITAL", 1, "initial")


def test_reconcile_detects_tampering(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        s.add(LedgerEntry(experiment_id=eid, ts=ctx.clock.now(), session_date=date(2026, 10, 14), kind="BUY",
                          amount_paise=-100, ref="rogue"))
    with ctx.db.session() as s:
        e = s.get(Experiment, eid)
        assert e is not None
        assert any("BUY" in p for p in portfolio.reconcile(s, e))


def test_opex_accrues_every_calendar_day_including_weekends(ctx: AppContext) -> None:
    eid = start_demo(ctx)  # started 2026-10-13 (IST date of start), first session 10-14
    with ctx.db.session() as s:
        s.add(Expense(scope="OPERATING", category="API", description="Kite Connect", amount_paise=50_000,
                      basis="MONTHLY", start_date=date(2026, 10, 1), verified_price=True, experiment_id=eid,
                      created_at=ctx.clock.now()))
    with ctx.db.session() as s:
        e = s.get(Experiment, eid)
        assert e is not None
        # 13 Oct .. 19 Oct inclusive = 7 days (includes Sat 17, Sun 18) of a 31-day month
        assert opex_accrued(s, e, date(2026, 10, 19)) == round(50_000 * 7 / 31)
        # Friday 16 -> Monday 19 adds 3 days, which land in Monday's session return
        assert opex_accrued(s, e, date(2026, 10, 19)) - opex_accrued(s, e, date(2026, 10, 16)) == pytest.approx(
            50_000 * 3 / 31, abs=1)


def test_setup_costs_charged_once_across_official_experiments(ctx: AppContext) -> None:
    now = ctx.clock.now()
    with ctx.db.session() as s:
        def mk(code: str, start: datetime, end: datetime | None) -> Experiment:
            e = Experiment(code=code, name=code, purpose="OFFICIAL", data_mode="LIVE_DATA", status="COMPLETED",
                           strategy_id="x", strategy_version="1", strategy_hash="0" * 64, strategy_spec_json="{}",
                           risk_json="{}", fee_schedule_id="f", fee_schedule_sha="0", calendar_sha_json="{}",
                           starting_capital_paise=2_500_000, created_at=start, started_at=start,
                           start_session_date=start.date(), ended_at=end)
            s.add(e)
            s.flush()
            return e
        a = mk("A", datetime(2026, 9, 1, 8, tzinfo=IST), datetime(2026, 9, 30, 16, tzinfo=IST))
        b = mk("B", datetime(2026, 10, 1, 8, tzinfo=IST), None)
        s.add(Expense(scope="SETUP", category="HOSTING", description="server setup", amount_paise=100_000,
                      basis="ONE_OFF", start_date=date(2026, 8, 20), created_at=now))
        s.add(Expense(scope="SETUP", category="DOMAIN", description="domain", amount_paise=80_000,
                      basis="ONE_OFF", start_date=date(2026, 10, 5), created_at=now))
        s.flush()
        assert setup_allocated(s, a, date(2026, 12, 31)) == 100_000
        assert setup_allocated(s, b, date(2026, 12, 31)) == 80_000


def test_three_layers_do_not_double_count(ctx: AppContext) -> None:
    eid = start_demo(ctx)
    with ctx.db.session() as s:
        s.add(Expense(scope="OPERATING", category="API", description="api", amount_paise=31_000, basis="MONTHLY",
                      start_date=date(2026, 10, 1), experiment_id=eid, created_at=ctx.clock.now()))
        s.add(Expense(scope="SETUP", category="OTHER", description="setup", amount_paise=20_000, basis="ONE_OFF",
                      start_date=date(2026, 10, 2), experiment_id=eid, created_at=ctx.clock.now()))
    with ctx.db.session() as s:
        e = s.get(Experiment, eid)
        assert e is not None
        snap = performance.snapshot(s, e, date(2026, 10, 14), {})
        assert snap.trading == 2_500_000  # trading account untouched by external costs
        assert snap.opex_cum == 2_000  # 13th+14th: 2 days x Rs10
        assert snap.economic == snap.trading - snap.opex_cum
        assert snap.allin == snap.economic - 20_000


def test_net_return_adjusts_for_external_flows() -> None:
    assert performance.net_return(100_000, 112_000, 10_000) == pytest.approx(0.02)
    assert performance.net_return(0, 1, 0) is None
    assert performance.max_drawdown([100, 120, 90, 130]) == pytest.approx(0.25)
    assert performance.target_curve(2_500_000, 2)[-1] == pytest.approx(25_000 * 1.21)
