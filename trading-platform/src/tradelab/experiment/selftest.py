"""Execution-simulation self-test, run in a throwaway in-memory database.

Part of the readiness gate: the official clock cannot start unless the order
lifecycle, charges and reconciliation behave as specified.
"""

from __future__ import annotations

from datetime import timedelta

from ..accounting import portfolio
from ..context import AppContext
from ..db import Database
from ..execution.paper import PaperBroker
from ..marketdata.base import DepthLevel, Quote
from ..models import Experiment


def execution_selftest(ctx: AppContext) -> list[str]:
    problems: list[str] = []
    db = Database(None)
    broker = PaperBroker(ctx.fees, ctx.universe, latency=timedelta(seconds=1))
    now = ctx.clock.now()
    sym = ctx.universe.symbols[0]
    day = now.date()
    try:
        with db.session() as s:
            exp = Experiment(
                code="SELFTEST", name="selftest", purpose="DEMO", data_mode="MOCK", status="RUNNING",
                strategy_id="selftest", strategy_version="0", strategy_hash="0" * 64, strategy_spec_json="{}",
                risk_json=ctx.spec.risk.to_json(), fee_schedule_id=ctx.fees.id, fee_schedule_sha=ctx.fees.file_sha256,
                calendar_sha_json="{}", starting_capital_paise=ctx.spec.risk.starting_capital, created_at=now,
                started_at=now, start_session_date=day, peak_economic_equity_paise=ctx.spec.risk.starting_capital,
            )
            s.add(exp)
            s.flush()
            portfolio.post(s, exp.id, now, day, "INITIAL_CAPITAL", exp.starting_capital_paise, "initial")

            def q(t_off: int, ask_qty: int, bid_qty: int) -> Quote:
                t = now + timedelta(seconds=t_off)
                return Quote(sym, "SELFTEST", t, t, t, 10_000, 10_000, 10_000, 1000,
                             (DepthLevel(9_999, bid_qty),), (DepthLevel(10_001, ask_qty),), 8_000, 12_000)

            o = broker.submit(s, exp, now, day, sym, "BUY", 40, 10_050, "ENTRY", "st-buy", "selftest")
            dup = broker.submit(s, exp, now, day, sym, "BUY", 40, 10_050, "ENTRY", "st-buy", "selftest")
            if dup.id != o.id:
                problems.append("duplicate intent created a second order")
            if o.status != "OPEN":
                problems.append(f"buy not accepted: {o.reject_reason}")
            # latency: nothing fills before eligible_at
            if broker.process_quotes(s, exp, now, {sym: q(0, 1000, 1000)}, set()):
                problems.append("filled before latency elapsed")
            # stale: no fill
            if broker.process_quotes(s, exp, now + timedelta(seconds=5), {sym: q(5, 1000, 1000)}, {sym}):
                problems.append("filled on stale data")
            # partial: 25% of 100 displayed = 25 units
            broker.process_quotes(s, exp, now + timedelta(seconds=6), {sym: q(6, 100, 100)}, set())
            if o.filled_qty != 25 or o.status != "PARTIALLY_FILLED":
                problems.append(f"expected partial fill 25, got {o.filled_qty}/{o.status}")
            broker.process_quotes(s, exp, now + timedelta(seconds=7), {sym: q(7, 1000, 1000)}, set())
            if o.status != "FILLED":
                problems.append(f"expected FILLED, got {o.status}")
            short = broker.submit(s, exp, now, day, sym, "SELL", 41, 9_000, "EXIT", "st-short", "selftest")
            if short.status != "REJECTED":
                problems.append("short sale was not rejected")
            big = broker.submit(s, exp, now, day, sym, "BUY", 2_000, 10_050, "ENTRY", "st-big", "selftest")
            if big.status != "REJECTED":
                problems.append("order above max invested / cash was not rejected")
            sell = broker.submit(s, exp, now, day, sym, "SELL", 40, 9_900, "EXIT", "st-sell", "selftest")
            broker.process_quotes(s, exp, now + timedelta(seconds=10), {sym: q(10, 1000, 1000)}, set())
            if sell.status != "FILLED":
                problems.append(f"sell not filled: {sell.status}")
            if portfolio.positions(s, exp.id):
                problems.append("position not flat after round trip")
            c = portfolio.cash(s, exp.id)
            if not (c < exp.starting_capital_paise):
                problems.append("round trip did not incur charges")
            problems.extend(portfolio.reconcile(s, exp))
    except Exception as e:  # noqa: BLE001
        problems.append(f"selftest crashed: {type(e).__name__}: {e}")
    finally:
        db.engine.dispose()
    return problems
