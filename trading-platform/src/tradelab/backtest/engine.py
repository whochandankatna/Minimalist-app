"""Historical backtest on daily bars. A separate mode from forward paper trading.

Timeline per trading day D (no look-ahead):
  - Orders were decided from closes up to D-1 (signal valid_for = D).
  - Limits are set from the D-1 close; price band = D-1 close +/- 20%.
  - Fills are simulated on bar D with BarFillModel (open/gap aware, volume-capped,
    no fill on a mere touch). Remainders expire at D's close.
  - Equity is marked at D's close; risk controls run; then the signal for D+1
    is computed from bars up to D only.

Uses the same strategy, fees, broker, accounting and risk-rule code as the
forward engine, in a throwaway in-memory database.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select

from ..accounting import performance, portfolio
from ..clock import IST, FakeClock
from ..context import AppContext
from ..db import Database
from ..execution.paper import PaperBroker
from ..experiment.engine import ForwardEngine, JobResult
from ..marketdata.base import Bar
from ..models import BacktestRun, CorporateAction, Expense, Experiment, Fill, LedgerEntry, Order
from ..money import Paise
from ..settings import CONFIG_DIR
from ..strategy.momentum import buy_limit, compute_signal, entry_quantity, sell_limit


def load_periods() -> dict[str, Any]:
    d: dict[str, Any] = dict(json.loads((CONFIG_DIR / "strategy" / "backtest_periods.json").read_text()))
    return d


@dataclass
class BacktestResult:
    period: str
    start: date
    end: date
    source: str
    days: int
    final_trading: Paise
    final_economic: Paise
    benchmark_final: Paise
    trading_return: float
    economic_return: float
    benchmark_return: float | None
    max_drawdown: float
    days_hit_10pct: int
    trades: int
    charges: Paise
    opex: Paise
    turnover: Paise
    avg_invested_fraction: float
    halted_on: date | None
    equity: list[dict[str, Any]] = field(default_factory=list)
    trade_log: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        d = {k: v for k, v in self.__dict__.items() if k not in ("equity", "trade_log")}
        out: dict[str, Any] = json.loads(json.dumps(d, default=str))
        return out


def run_backtest(
    ctx: AppContext,
    bars: dict[str, list[Bar]],
    start: date,
    end: date,
    period: str = "CUSTOM",
    source: str = "MOCK",
    opex_monthly: Paise = 50_000,
) -> BacktestResult:
    params = ctx.spec.params
    db = Database(None)
    clock = FakeClock(datetime.combine(start, time(8, 0), IST))
    bt_ctx = AppContext(ctx.settings, db, clock, ctx.calendar, ctx.universe, ctx.spec, ctx.fees, ctx.market,
                        PaperBroker(ctx.fees, ctx.universe, latency=timedelta(0)))
    eng = ForwardEngine(bt_ctx)
    syms = ctx.universe.symbols
    by_day: dict[str, dict[date, Bar]] = {s: {b.day: b for b in bars.get(s, [])} for s in syms}
    bench = ctx.universe.benchmark
    days = sorted(d for d in by_day[bench] if start <= d <= end)
    if not days:
        raise ValueError("no bars for benchmark in the requested period")
    notes: list[str] = []
    with db.session() as s:
        exp = Experiment(
            code=f"BT-{period}", name=f"backtest {period}", purpose="DEMO",
            data_mode="MOCK" if source == "MOCK" else "LIVE_DATA", status="RUNNING",
            strategy_id=ctx.spec.strategy_id, strategy_version=ctx.spec.version, strategy_hash=ctx.spec.fingerprint,
            strategy_spec_json=json.dumps(ctx.spec.raw_strategy), risk_json=ctx.spec.risk.to_json(),
            fee_schedule_id=ctx.fees.id, fee_schedule_sha=ctx.fees.file_sha256, calendar_sha_json="{}",
            starting_capital_paise=ctx.spec.risk.starting_capital, created_at=clock.now(), started_at=clock.now(),
            start_session_date=days[0], peak_economic_equity_paise=ctx.spec.risk.starting_capital,
            benchmark_symbol=bench,
        )
        s.add(exp)
        s.flush()
        portfolio.post(s, exp.id, clock.now(), days[0], "INITIAL_CAPITAL", exp.starting_capital_paise, "initial")
        if opex_monthly:
            s.add(Expense(scope="OPERATING", category="API", description="Kite Connect plan (assumed in backtest)",
                          amount_paise=opex_monthly, basis="MONTHLY", start_date=days[0], verified_price=True,
                          source_url="https://zerodha.com/charges/", created_at=clock.now(), experiment_id=exp.id))
        # Copy corporate actions so held positions and signal prices are adjusted.
        with ctx.db.session() as main:
            for ca in main.scalars(select(CorporateAction)):
                s.add(CorporateAction(symbol=ca.symbol, kind=ca.kind, ex_date=ca.ex_date, ratio_new=ca.ratio_new,
                                      ratio_old=ca.ratio_old, dividend_per_unit_paise=ca.dividend_per_unit_paise,
                                      source_url=ca.source_url, entered_at=ca.entered_at, notes=ca.notes))

    def hist(through: date) -> dict[str, list[Bar]]:
        lo = through - timedelta(days=int(params.min_history * 1.6) + 30)
        return {sym: [b for d, b in sorted(by_day[sym].items()) if lo <= d <= through] for sym in syms}

    equity: list[dict[str, Any]] = []
    prev_close: dict[str, Paise] = {}
    for sym in syms:
        before = [b for d, b in sorted(by_day[sym].items()) if d < days[0]]
        if before:
            prev_close[sym] = before[-1].close
    pre = [d for d in sorted(by_day[bench]) if d < days[0]]
    signal: dict[str, Any] | None = None
    if pre:
        with db.session() as s:
            h = hist(pre[-1])
            signal = compute_signal(params, h, {k: eng._adj(s, k, v) for k, v in h.items()}, pre[-1], set(),
                                    True).to_payload()
    else:
        notes.append("no warm-up history before start: first signal delayed")
    halted_on: date | None = None
    invested_frac: list[float] = []
    last_marks: dict[str, Paise] = dict(prev_close)

    for i, d in enumerate(days):
        clock.set(datetime.combine(d, time(9, 20), IST))
        with db.session() as s:
            cur = s.get(Experiment, 1)
            assert cur is not None
            exp = cur
            portfolio.apply_corporate_actions(s, exp, d, clock.now())
            if exp.liquidation_requested:
                for sym, p in portfolio.positions(s, exp.id).items():
                    if sym in prev_close:
                        tick = ctx.universe.get(sym).tick_paise
                        band = (prev_close[sym] * 8 // 10, prev_close[sym] * 12 // 10)
                        lim = sell_limit(prev_close[sym], params.liquidation_buffer_bps, tick, band[0] + tick)
                        bt_ctx.broker.submit(s, exp, clock.now(), d, sym, "SELL", p.qty, lim, "LIQUIDATE",
                                             f"{d}:LIQ:{sym}", "risk control liquidation", band)
            elif signal is not None:
                held = portfolio.positions(s, exp.id)
                for ex in signal["exits"]:
                    sym = ex["symbol"]
                    if sym in held and sym in prev_close:
                        tick = ctx.universe.get(sym).tick_paise
                        band = (prev_close[sym] * 8 // 10, prev_close[sym] * 12 // 10)
                        lim = sell_limit(prev_close[sym], params.sell_buffer_bps, tick, band[0] + tick)
                        bt_ctx.broker.submit(s, exp, clock.now(), d, sym, "SELL", held[sym].qty, lim, "EXIT",
                                             f"{d}:EXIT:{sym}", ex["reason"], band)
                if signal["entries"] and not exp.entries_paused:
                    slot = ctx.spec.risk.max_invested // params.top_k
                    for en in signal["entries"]:
                        sym = en["symbol"]
                        if sym not in prev_close:
                            continue
                        tick = ctx.universe.get(sym).tick_paise
                        lim = buy_limit(prev_close[sym], params.buy_buffer_bps, tick)
                        invested = sum(p.cost_paise for p in portfolio.positions(s, exp.id).values())
                        room = ctx.spec.risk.max_invested - invested - portfolio.reserved(s, exp.id)
                        qty = entry_quantity(min(slot, room, portfolio.available_cash(s, exp.id)), lim)
                        if qty > 0:
                            band = (prev_close[sym] * 8 // 10, prev_close[sym] * 12 // 10)
                            bt_ctx.broker.submit(s, exp, clock.now(), d, sym, "BUY", qty, lim, "ENTRY",
                                                 f"{d}:ENTRY:{sym}", en["reason"], band)
            clock.set(datetime.combine(d, time(15, 30), IST))
            todays = {sym: by_day[sym][d] for sym in syms if d in by_day[sym]}
            bt_ctx.broker.process_bars(s, exp, clock.now(), todays)
            bt_ctx.broker.expire_day_orders(s, exp, clock.now(), d)
            for sym, b in todays.items():
                last_marks[sym] = b.close
                prev_close[sym] = b.close
            if i == 0:
                eng._init_benchmark(exp, todays[bench])
            snap = performance.snapshot(s, exp, d, last_marks)
            res = JobResult()
            eng._apply_risk_rules(s, exp, snap.economic, clock.now(), res)
            bval = eng._benchmark_value(exp, last_marks)
            invested_frac.append(snap.market_value / snap.trading if snap.trading else 0)
            equity.append({"date": d.isoformat(), "trading": snap.trading, "economic": snap.economic,
                           "benchmark": bval, "invested": snap.market_value})
            if exp.liquidation_requested and not portfolio.positions(s, exp.id):
                halted_on = d
                notes.append(f"halt rule triggered; flat on {d}")
                break
            nxt_n = i + 2
            h = hist(d)
            signal = compute_signal(params, h, {k: eng._adj(s, k, v) for k, v in h.items()}, d,
                                    set(portfolio.positions(s, exp.id)),
                                    (nxt_n - 1) % params.rebalance_every == 0).to_payload()

    with db.session() as s:
        fin = s.get(Experiment, 1)
        assert fin is not None
        exp = fin
        fills = s.scalars(select(Fill).order_by(Fill.ts)).all()
        orders = {o.id: o for o in s.scalars(select(Order))}
        trade_log = [{"date": f.session_date.isoformat(), "symbol": f.symbol, "side": f.side, "qty": f.qty,
                      "price": f.price_paise / 100, "charges": f.charges_paise / 100,
                      "reason": orders[f.order_id].reason} for f in fills]
        charges = sum(f.charges_paise for f in fills) - int(s.scalar(select(func.coalesce(func.sum(
            LedgerEntry.amount_paise), 0)).where(LedgerEntry.kind == "DP_CHARGE")) or 0)
        turnover = sum(f.turnover_paise for f in fills)
        recon = portfolio.reconcile(s, exp)
        if recon:
            notes.append("RECONCILIATION PROBLEMS: " + "; ".join(recon))
    db.engine.dispose()
    start_cap = ctx.spec.risk.starting_capital
    last = equity[-1]
    econ_series = [start_cap] + [e["economic"] for e in equity]
    rets = [(b - a) / a for a, b in zip(econ_series, econ_series[1:]) if a > 0]
    return BacktestResult(
        period=period, start=days[0], end=date.fromisoformat(last["date"]), source=source,
        days=len(equity), final_trading=last["trading"], final_economic=last["economic"],
        benchmark_final=last["benchmark"], trading_return=(last["trading"] - start_cap) / start_cap,
        economic_return=(last["economic"] - start_cap) / start_cap,
        benchmark_return=(last["benchmark"] - start_cap) / start_cap if last["benchmark"] else None,
        max_drawdown=performance.max_drawdown(econ_series), days_hit_10pct=sum(1 for r in rets if r >= 0.10),
        trades=len(trade_log), charges=charges, opex=last["trading"] - last["economic"], turnover=turnover,
        avg_invested_fraction=sum(invested_frac) / len(invested_frac) if invested_frac else 0.0,
        halted_on=halted_on, equity=equity, trade_log=trade_log, notes=notes,
    )


def record_run(ctx: AppContext, r: BacktestResult) -> int:
    with ctx.db.session() as s:
        row = BacktestRun(created_at=ctx.clock.now(), period=r.period, start=r.start, end=r.end,
                          data_source=r.source, strategy_hash=ctx.spec.fingerprint, fee_schedule_id=ctx.fees.id,
                          results_json=json.dumps(r.summary()), equity_json=json.dumps(r.equity),
                          trades_json=json.dumps(r.trade_log))
        s.add(row)
        s.flush()
        from ..ops.audit import audit

        audit(s, ctx.clock.now(), "user", "backtest.run", {"id": row.id, "period": r.period, "source": r.source,
                                                          "start": r.start.isoformat(), "end": r.end.isoformat()})
        return row.id


def evaluation_runs(ctx: AppContext) -> int:
    with ctx.db.session() as s:
        return int(s.scalar(select(func.count()).select_from(BacktestRun).where(BacktestRun.period == "EVALUATION")) or 0)
