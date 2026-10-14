"""Forward paper-trading engine. Each public method is one scheduled job.

Daily cycle (Asia/Kolkata), regular NSE sessions only:
  08:45 pre_session   corporate actions, session row, ensure today's signal exists
  09:20 submit_orders exits/liquidation, then entries (only if data+auth healthy)
  every N s monitor   quotes -> staleness -> simulated fills -> intraday halt check
  15:25 expire        unfilled DAY orders expire
  15:50 post_close    official marks, equity snapshot, returns, risk controls,
                      next-session signal (data through today), reviews
  23:30 housekeeping  backup, reconcile, audit-chain check, pruning
On startup `recover` reconciles and closes any sessions missed while offline.

Monitoring frequency never forces trading: orders only originate from the
stored daily signal, risk controls, or explicit human controls.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..accounting import performance, portfolio
from ..accounting.expenses import setup_allocated
from ..calendar import CalendarCoverageError
from ..clock import IST
from ..context import AppContext
from ..fees import fill_charges
from ..marketdata.base import AuthError, Bar, MarketDataError, Quote
from ..models import (
    CorporateAction,
    Experiment,
    ExperimentSession,
    ExternalFlow,
    Fill,
    LedgerEntry,
    Order,
    QuoteSnapshot,
    Review,
    Signal,
)
from ..money import Paise
from ..ops.audit import audit, incident, resolve_incidents
from ..strategy.momentum import (
    AdjEvent,
    adjustment_events,
    buy_limit,
    compute_signal,
    entry_quantity,
    sell_limit,
)
from .lifecycle import FrozenSpecViolation, end_experiment, verify_frozen


@dataclass
class JobResult:
    status: str = "OK"  # OK | SKIPPED | FAILED
    notes: list[str] = field(default_factory=list)

    def add(self, msg: str) -> None:
        self.notes.append(msg)


class ForwardEngine:
    def __init__(self, ctx: AppContext) -> None:
        self.ctx = ctx
        self._last_quotes: dict[str, Quote] = {}

    # ------------------------------------------------------------ helpers
    @property
    def cal(self):  # type: ignore[no-untyped-def]
        return self.ctx.calendar

    def running(self, s: Session) -> list[Experiment]:
        return list(s.scalars(select(Experiment).where(Experiment.status == "RUNNING")))

    def _is_rebalance(self, n: int) -> bool:
        return (n - 1) % self.ctx.spec.params.rebalance_every == 0

    def _session_row(self, s: Session, exp: Experiment, d: date) -> ExperimentSession | None:
        if exp.start_session_date is None or d < exp.start_session_date:
            return None
        row = s.scalars(select(ExperimentSession).where(
            ExperimentSession.experiment_id == exp.id, ExperimentSession.session_date == d)).first()
        if row:
            return row
        regular = self.cal.is_regular_session(d)
        if not regular and not self.cal.special_session(d):
            return None
        n = None
        if regular:
            prior = s.scalars(select(ExperimentSession).where(
                ExperimentSession.experiment_id == exp.id, ExperimentSession.session_number.is_not(None),
                ExperimentSession.session_date < d)).all()
            n = len(prior) + 1
        row = ExperimentSession(experiment_id=exp.id, session_date=d, session_number=n,
                                kind="REGULAR" if regular else "SPECIAL", status="SCHEDULED")
        s.add(row)
        s.flush()
        return row

    def _adj(self, s: Session, sym: str, bars: list[Bar]) -> list[AdjEvent]:
        acts = s.scalars(select(CorporateAction).where(CorporateAction.symbol == sym)).all()
        closes_before: dict[date, int] = {}
        for a in acts:
            prior = [b for b in bars if b.day < a.ex_date]
            if prior:
                closes_before[a.ex_date] = prior[-1].close
        return adjustment_events(
            [(a.kind, a.ex_date, a.ratio_new, a.ratio_old, a.dividend_per_unit_paise) for a in acts], closes_before)

    def _history(self, through: date) -> dict[str, list[Bar]]:
        start = through - timedelta(days=int(self.ctx.spec.params.min_history * 1.6) + 30)
        return {sym: self.ctx.market.daily_bars(sym, start, through) for sym in self.ctx.universe.symbols}

    def ensure_signal(self, s: Session, exp: Experiment, valid_for: date, session_number: int) -> Signal:
        sig = s.scalars(select(Signal).where(Signal.experiment_id == exp.id, Signal.valid_for == valid_for)).first()
        if sig:
            return sig
        data_through = self.cal.previous_regular_session(valid_for)
        bars = self._history(data_through)
        bars = {k: [b for b in v if b.day <= data_through] for k, v in bars.items()}
        held = set(portfolio.positions(s, exp.id))
        adj = {sym: self._adj(s, sym, b) for sym, b in bars.items()}
        res = compute_signal(self.ctx.spec.params, bars, adj, data_through, held, self._is_rebalance(session_number))
        payload = res.to_payload()
        payload["valid_for_session_number"] = session_number
        payload["data_source"] = self.ctx.market.source
        sig = Signal(experiment_id=exp.id, strategy_hash=exp.strategy_hash, computed_at=self.ctx.clock.now(),
                     data_through=data_through, valid_for=valid_for, payload_json=json.dumps(payload))
        s.add(sig)
        s.flush()
        audit(s, self.ctx.clock.now(), "engine", "signal.computed", {
            "valid_for": valid_for.isoformat(), "data_through": data_through.isoformat(),
            "selected": res.selected, "exits": res.exits, "entries": res.entries}, exp.id)
        return sig

    def _stale(self, q: Quote, now: datetime) -> bool:
        st = self.ctx.settings
        if q.quote_ts is None or (now - q.quote_ts).total_seconds() > st.max_quote_age_s:
            return True
        if self.cal.is_market_open(now) and q.last_trade_ts is not None:
            open_dt = datetime.combine(now.astimezone(IST).date(), time(9, 15), IST)
            if now - open_dt > timedelta(minutes=15) and (now - q.last_trade_ts).total_seconds() > st.max_last_trade_age_s:
                return True
        return False

    def _fetch_quotes(self, s: Session, exp_ids: list[int], now: datetime) -> tuple[dict[str, Quote], set[str], str | None]:
        """Returns (quotes, stale_symbols, error). Records incidents for failures."""
        try:
            qs = self.ctx.market.quotes(self.ctx.universe.symbols)
        except AuthError as e:
            for eid in exp_ids:
                incident(s, now, "ERROR", "auth", f"Broker session invalid: {e}. New entries blocked.", eid, now.date())
            return {}, set(self.ctx.universe.symbols), f"auth: {e}"
        except MarketDataError as e:
            for eid in exp_ids:
                incident(s, now, "WARN", "market_data", f"Quote fetch failed: {e}", eid, now.date())
            return {}, set(self.ctx.universe.symbols), f"data: {e}"
        resolve_incidents(s, now, "auth", "quotes fetched successfully")
        stale = {sym for sym, q in qs.items() if self._stale(q, now)}
        stale |= {sym for sym in self.ctx.universe.symbols if sym not in qs}
        for sym, q in qs.items():
            s.add(QuoteSnapshot(symbol=sym, observed_at=now, quote_ts=q.quote_ts, last_trade_ts=q.last_trade_ts,
                                ltp_paise=q.ltp, bid_paise=q.best_bid, ask_paise=q.best_ask, volume=q.volume,
                                source=q.source, stale=sym in stale))
        if stale and self.cal.is_market_open(now):
            for eid in exp_ids:
                incident(s, now, "WARN", "stale_data", f"Stale/missing quotes: {sorted(stale)}", eid, now.date(),
                         draft_alert=False)
        self._last_quotes.update(qs)
        return qs, stale, None

    def _guard_frozen(self, s: Session, exp: Experiment, now: datetime, res: JobResult) -> bool:
        try:
            verify_frozen(exp, self.ctx)
            return True
        except FrozenSpecViolation as e:
            incident(s, now, "CRITICAL", "frozen_spec", str(e), exp.id, now.date())
            res.add(f"{exp.code}: BLOCKED {e}")
            res.status = "FAILED"
            return False

    # ---------------------------------------------------------- pre-session
    def pre_session(self) -> JobResult:
        res = JobResult()
        now = self.ctx.clock.now()
        d = now.astimezone(IST).date()
        try:
            if not self.cal.is_regular_session(d) and not self.cal.special_session(d):
                res.status = "SKIPPED"
                res.add(f"{d} is not a trading session ({self.cal.holiday_name(d) or 'weekend'})")
                return res
        except CalendarCoverageError as e:
            res.status = "FAILED"
            res.add(str(e))
            return res
        with self.ctx.db.session() as s:
            for exp in self.running(s):
                if not self._guard_frozen(s, exp, now, res):
                    continue
                row = self._session_row(s, exp, d)
                if row is None:
                    res.add(f"{exp.code}: starts {exp.start_session_date}")
                    continue
                for note in portfolio.apply_corporate_actions(s, exp, d, now):
                    res.add(f"{exp.code}: {note}")
                if row.session_number is not None:
                    try:
                        self.ensure_signal(s, exp, d, row.session_number)
                    except (MarketDataError, CalendarCoverageError) as e:
                        incident(s, now, "ERROR", "signal", f"Could not compute signal for {d}: {e}", exp.id, d)
                        row.quality = "DEGRADED"
                        row.quality_notes = f"signal unavailable: {e}"
                row.status = "PREPARED"
                res.add(f"{exp.code}: session #{row.session_number} prepared")
        return res

    # ------------------------------------------------------------- submit
    def submit_orders(self) -> JobResult:
        res = JobResult()
        now = self.ctx.clock.now()
        d = now.astimezone(IST).date()
        if not self.cal.is_market_open(now):
            res.status = "SKIPPED"
            res.add("market not open")
            return res
        sp = self.cal.special_session(d)
        if sp and not self.ctx.spec.params.trade_on_special_sessions:
            res.status = "SKIPPED"
            res.add(f"special session ({sp.name}): strategy does not trade")
            return res
        with self.ctx.db.session() as s:
            exps = self.running(s)
            if not exps:
                res.status = "SKIPPED"
                return res
            quotes, stale, err = self._fetch_quotes(s, [e.id for e in exps], now)
            for exp in exps:
                if not self._guard_frozen(s, exp, now, res):
                    continue
                row = self._session_row(s, exp, d)
                if row is None or row.session_number is None:
                    continue
                if exp.liquidation_requested:
                    self._submit_liquidation(s, exp, now, d, quotes, stale, res)
                    continue
                sig = s.scalars(select(Signal).where(Signal.experiment_id == exp.id, Signal.valid_for == d)).first()
                if sig is None:
                    res.add(f"{exp.code}: no signal for {d}; no orders")
                    incident(s, now, "ERROR", "signal", f"No signal for {d}; no orders submitted", exp.id, d)
                    continue
                if sig.data_through >= d:
                    raise RuntimeError("look-ahead guard: signal data_through >= session date")
                payload = json.loads(sig.payload_json)
                held = portfolio.positions(s, exp.id)
                for ex in payload["exits"]:
                    sym = ex["symbol"]
                    if sym not in held:
                        continue
                    q = quotes.get(sym)
                    if q is None or sym in stale:
                        res.add(f"{exp.code}: exit {sym} deferred, no fresh quote")
                        incident(s, now, "WARN", "exit_deferred", f"Exit of {sym} deferred: no fresh quote", exp.id, d)
                        continue
                    tick = self.ctx.universe.get(sym).tick_paise
                    lim = sell_limit(q.ltp, self.ctx.spec.params.sell_buffer_bps, tick, q.lower_band)
                    o = self.ctx.broker.submit(s, exp, now, d, sym, "SELL", held[sym].qty, lim, "EXIT",
                                               f"{d}:EXIT:{sym}", ex["reason"], (q.lower_band, q.upper_band), sig.id)
                    res.add(f"{exp.code}: EXIT {sym} {o.status}")
                if not payload["entries"]:
                    continue
                block = self._entry_block_reason(exp, err, stale, payload)
                if block:
                    res.add(f"{exp.code}: entries blocked: {block}")
                    audit(s, now, "engine", "entries.blocked", {"reason": block, "session": d.isoformat()}, exp.id)
                    continue
                self._submit_entries(s, exp, now, d, payload, quotes, sig.id, res)
        return res

    def _entry_block_reason(self, exp: Experiment, err: str | None, stale: set[str], payload: dict[str, object]) -> str | None:
        if exp.entries_paused:
            return f"entries paused ({exp.entries_paused_reason})"
        if err:
            return err
        if stale:
            return f"stale data for {sorted(stale)}"
        return None

    def _submit_entries(self, s: Session, exp: Experiment, now: datetime, d: date, payload: dict[str, object],
                        quotes: dict[str, Quote], signal_id: int, res: JobResult) -> None:
        risk = json.loads(exp.risk_json)
        max_inv = int(risk["max_invested_paise"])
        k = self.ctx.spec.params.top_k
        slot = max_inv // k
        entries = payload["entries"]
        assert isinstance(entries, list)
        for en in entries:
            sym = en["symbol"]
            q = quotes[sym]
            tick = self.ctx.universe.get(sym).tick_paise
            lim = buy_limit(q.best_ask or q.ltp, self.ctx.spec.params.buy_buffer_bps, tick)
            invested = sum(p.cost_paise for p in portfolio.positions(s, exp.id).values())
            room = max_inv - invested - portfolio.reserved(s, exp.id)
            budget = min(slot, room, portfolio.available_cash(s, exp.id))
            qty = entry_quantity(budget, lim)
            if qty <= 0:
                res.add(f"{exp.code}: {sym} skipped, budget {budget / 100:.2f} below one unit at {lim / 100:.2f}")
                audit(s, now, "engine", "entry.skipped", {"symbol": sym, "budget_paise": budget, "limit_paise": lim}, exp.id)
                continue
            o = self.ctx.broker.submit(s, exp, now, d, sym, "BUY", qty, lim, "ENTRY", f"{d}:ENTRY:{sym}",
                                       en["reason"], (q.lower_band, q.upper_band), signal_id)
            res.add(f"{exp.code}: ENTRY {sym} x{qty} @<= {lim / 100:.2f} {o.status}")

    def _submit_liquidation(self, s: Session, exp: Experiment, now: datetime, d: date, quotes: dict[str, Quote],
                            stale: set[str], res: JobResult) -> None:
        self.ctx.broker.cancel_open(s, exp, now, "liquidation: cancel pending buys", side="BUY")
        for sym, p in portfolio.positions(s, exp.id).items():
            free = p.qty - portfolio.pending_sell_qty(s, exp.id, sym)
            if free <= 0:
                continue
            q = quotes.get(sym)
            if q is None or sym in stale:
                res.add(f"{exp.code}: cannot liquidate {sym} yet (no fresh quote)")
                continue
            tick = self.ctx.universe.get(sym).tick_paise
            lim = sell_limit(q.ltp, self.ctx.spec.params.liquidation_buffer_bps, tick, q.lower_band)
            n = len(s.scalars(select(Order).where(Order.experiment_id == exp.id, Order.intent == "LIQUIDATE",
                                                  Order.symbol == sym)).all())
            o = self.ctx.broker.submit(s, exp, now, d, sym, "SELL", free, lim, "LIQUIDATE", f"{d}:LIQ:{sym}:{n}",
                                       "risk control liquidation", (q.lower_band, q.upper_band))
            res.add(f"{exp.code}: LIQUIDATE {sym} x{free} {o.status}")

    # ------------------------------------------------------------- monitor
    def monitor(self) -> JobResult:
        res = JobResult()
        now = self.ctx.clock.now()
        if not self.cal.is_market_open(now):
            res.status = "SKIPPED"
            return res
        with self.ctx.db.session() as s:
            exps = self.running(s)
            if not exps:
                res.status = "SKIPPED"
                return res
            quotes, stale, err = self._fetch_quotes(s, [e.id for e in exps], now)
            if err:
                res.add(err)
            for exp in exps:
                fills = self.ctx.broker.process_quotes(s, exp, now, quotes, stale)
                if fills:
                    res.add(f"{exp.code}: {len(fills)} fill(s)")
                if quotes and not stale:
                    self._intraday_risk(s, exp, now, quotes, res)
                if exp.liquidation_requested and not portfolio.positions(s, exp.id):
                    self.ctx.broker.cancel_open(s, exp, now, "experiment halted")
                    end_experiment(s, exp, now, "HALTED", exp.entries_paused_reason or "halt", "engine")
        return res

    def _intraday_risk(self, s: Session, exp: Experiment, now: datetime, quotes: dict[str, Quote], res: JobResult) -> None:
        if exp.liquidation_requested:
            self._submit_liquidation(s, exp, now, now.astimezone(IST).date(), quotes, set(), res)
            return
        snap = performance.snapshot(s, exp, now.astimezone(IST).date(), {k: q.ltp for k, q in quotes.items()})
        self._apply_risk_rules(s, exp, snap.economic, now, res, intraday=True)
        if exp.liquidation_requested:
            self._submit_liquidation(s, exp, now, now.astimezone(IST).date(), quotes, set(), res)

    def _apply_risk_rules(self, s: Session, exp: Experiment, economic: Paise, now: datetime, res: JobResult,
                          intraday: bool = False) -> None:
        risk = json.loads(exp.risk_json)
        start = exp.starting_capital_paise
        halt_level = start - int(start * float(risk["halt_loss_from_start"]))
        if not intraday:
            exp.peak_economic_equity_paise = max(exp.peak_economic_equity_paise, economic)
        peak = max(exp.peak_economic_equity_paise, economic)
        if economic <= halt_level and not exp.liquidation_requested:
            exp.entries_paused = True
            exp.entries_paused_reason = f"HALT: economic equity {economic / 100:.2f} <= {halt_level / 100:.2f} (10% loss)"
            exp.liquidation_requested = True
            self.ctx.broker.cancel_open(s, exp, now, "halt: cancel pending buys", side="BUY")
            incident(s, now, "CRITICAL", "risk_halt", exp.entries_paused_reason, exp.id, now.date())
            audit(s, now, "risk", "experiment.halt_triggered", {"economic_paise": economic, "halt_level": halt_level,
                                                                 "intraday": intraday}, exp.id)
            res.add(f"{exp.code}: HALT triggered")
        elif not exp.entries_paused and peak > 0 and (peak - economic) / peak >= float(risk["pause_entries_drawdown_from_peak"]):
            exp.entries_paused = True
            exp.entries_paused_reason = (f"AUTO: drawdown {(peak - economic) / peak:.2%} from peak "
                                         f"{peak / 100:.2f}; human must resume")
            incident(s, now, "ERROR", "risk_pause", exp.entries_paused_reason, exp.id, now.date())
            audit(s, now, "risk", "entries.paused", {"reason": exp.entries_paused_reason}, exp.id)
            res.add(f"{exp.code}: entries paused (drawdown)")

    # -------------------------------------------------------------- expire
    def expire_orders(self) -> JobResult:
        res = JobResult()
        now = self.ctx.clock.now()
        d = now.astimezone(IST).date()
        with self.ctx.db.session() as s:
            for exp in self.running(s):
                n = self.ctx.broker.expire_day_orders(s, exp, now, d)
                if n:
                    res.add(f"{exp.code}: {n} order(s) expired")
        return res

    # ---------------------------------------------------------- post-close
    def post_close(self, day: date | None = None, offline: bool = False) -> JobResult:
        res = JobResult()
        now = self.ctx.clock.now()
        d = day or now.astimezone(IST).date()
        if not self.cal.is_regular_session(d) and not self.cal.special_session(d):
            res.status = "SKIPPED"
            res.add(f"{d} not a session")
            return res
        with self.ctx.db.session() as s:
            for exp in self.running(s):
                self._close_session(s, exp, d, now, res, offline)
        return res

    def _marks_for(self, d: date, res: JobResult) -> tuple[dict[str, Paise], dict[str, Bar], list[str]]:
        marks: dict[str, Paise] = {}
        bars: dict[str, Bar] = {}
        gaps = []
        for sym in self.ctx.universe.symbols:
            try:
                b = [x for x in self.ctx.market.daily_bars(sym, d, d) if x.day == d]
            except MarketDataError as e:
                b = []
                res.add(f"bar fetch {sym}: {e}")
            if b:
                bars[sym] = b[0]
                marks[sym] = b[0].close
            elif sym in self._last_quotes and self._last_quotes[sym].observed_at.astimezone(IST).date() == d:
                marks[sym] = self._last_quotes[sym].ltp
                gaps.append(f"{sym}: no official close; marked at last observed LTP")
            else:
                gaps.append(f"{sym}: no price for {d}")
        return marks, bars, gaps

    def _close_session(self, s: Session, exp: Experiment, d: date, now: datetime, res: JobResult, offline: bool) -> None:
        row = self._session_row(s, exp, d)
        if row is None or row.status == "CLOSED":
            return
        self.ctx.broker.expire_day_orders(s, exp, now, d)
        marks, bars, gaps = self._marks_for(d, res)
        snap = performance.snapshot(s, exp, d, marks)
        prev = s.scalars(select(ExperimentSession).where(
            ExperimentSession.experiment_id == exp.id, ExperimentSession.status == "CLOSED",
            ExperimentSession.session_date < d).order_by(ExperimentSession.session_date.desc())).first()
        p_tr = prev.trading_equity_paise if prev else exp.starting_capital_paise
        p_ec = prev.economic_equity_paise if prev else exp.starting_capital_paise
        # All-in baseline excludes setup costs incurred before the first session, so the
        # first daily return is not distorted; the cumulative all-in figure still includes them.
        p_al = prev.allin_equity_paise if prev else exp.starting_capital_paise - setup_allocated(s, exp, d - timedelta(days=1))
        flow = sum(f.amount_paise for f in s.scalars(select(ExternalFlow).where(
            ExternalFlow.experiment_id == exp.id, ExternalFlow.session_date == d)))
        if row.session_number == 1 and exp.benchmark_qty == 0 and exp.benchmark_symbol in bars:
            self._init_benchmark(exp, bars[exp.benchmark_symbol])
        bench_val = self._benchmark_value(exp, marks)
        fills = s.scalars(select(Fill).where(Fill.experiment_id == exp.id, Fill.session_date <= d)).all()
        dp = sum(-e.amount_paise for e in s.scalars(select(LedgerEntry).where(
            LedgerEntry.experiment_id == exp.id, LedgerEntry.kind == "DP_CHARGE", LedgerEntry.session_date <= d)))
        row.cash_paise, row.reserved_paise, row.market_value_paise = snap.cash, snap.reserved, snap.market_value
        row.trading_equity_paise, row.opex_cum_paise, row.setup_cum_paise = snap.trading, snap.opex_cum, snap.setup_cum
        row.economic_equity_paise, row.allin_equity_paise = snap.economic, snap.allin
        row.external_flow_paise = flow
        row.charges_cum_paise = sum(f.charges_paise for f in fills) + dp
        row.turnover_cum_paise = sum(f.turnover_paise for f in fills)
        row.realised_cum_paise = sum(f.realised_gross_paise for f in fills)
        row.benchmark_value_paise = bench_val
        row.marks_json = json.dumps(marks)
        row.return_trading = performance.net_return(p_tr, snap.trading, flow)
        row.return_economic = performance.net_return(p_ec, snap.economic, flow)
        row.return_allin = performance.net_return(p_al, snap.allin, flow)
        notes = list(gaps)
        if offline:
            notes.append("application was offline during this session: no intraday monitoring, no fills simulated")
        if snap.unpriced:
            notes.append(f"unpriced holdings carried at cost: {list(snap.unpriced)}")
        row.quality = "OK" if not notes else ("NO_DATA" if not marks else "DEGRADED")
        if row.quality_notes:
            notes.insert(0, row.quality_notes)
        row.quality_notes = "; ".join(notes) or None
        row.status = "CLOSED"
        row.closed_at = now
        if notes:
            incident(s, now, "WARN", "data_coverage", f"{d}: " + "; ".join(notes), exp.id, d, draft_alert=False)
        probs = portfolio.reconcile(s, exp)
        if probs:
            exp.entries_paused = True
            exp.entries_paused_reason = "reconciliation failure: " + "; ".join(probs)[:300]
            incident(s, now, "CRITICAL", "reconciliation", "; ".join(probs), exp.id, d)
        if row.session_number is not None:
            self._apply_risk_rules(s, exp, snap.economic, now, res)
        audit(s, now, "engine", "session.closed", {
            "date": d.isoformat(), "n": row.session_number, "trading": snap.trading, "economic": snap.economic,
            "allin": snap.allin, "quality": row.quality}, exp.id)
        res.add(f"{exp.code}: session #{row.session_number} closed, economic {snap.economic / 100:.2f}")

        n = row.session_number
        if n is not None:
            checkpoints = [int(x) for x in exp.review_checkpoints.split(",")]
            if n in checkpoints:
                self._make_review(s, exp, n, now)
            if n >= exp.target_sessions:
                end_experiment(s, exp, now, "COMPLETED", f"{n} sessions elapsed", "engine")
                return
            if exp.liquidation_requested and not portfolio.positions(s, exp.id):
                end_experiment(s, exp, now, "HALTED", exp.entries_paused_reason or "halt", "engine")
                return
            try:
                nxt = self.cal.next_regular_session(d)
                self.ensure_signal(s, exp, nxt, n + 1)
            except (MarketDataError, CalendarCoverageError) as e:
                incident(s, now, "ERROR", "signal", f"Next-session signal not computed: {e}", exp.id, d)

    def _init_benchmark(self, exp: Experiment, bar: Bar) -> None:
        risk = json.loads(exp.risk_json)
        tick = self.ctx.universe.get(bar.symbol).tick_paise
        px = buy_limit(bar.open, 10, tick)  # open + 10 bps slippage, same as backtest model
        qty = entry_quantity(int(risk["max_invested_paise"]), px)
        cost = qty * px + fill_charges(self.ctx.fees, "BUY", qty * px).total
        exp.benchmark_qty = qty
        exp.benchmark_cash_paise = exp.starting_capital_paise - cost

    def _benchmark_value(self, exp: Experiment, marks: dict[str, Paise]) -> Paise:
        sym = exp.benchmark_symbol
        if not sym or not exp.benchmark_qty or sym not in marks:
            return 0
        gross = exp.benchmark_qty * marks[sym]
        exit_cost = fill_charges(self.ctx.fees, "SELL", gross).total + self.ctx.fees.dp_charge_per_scrip_sell_day_paise
        return exp.benchmark_cash_paise + gross - exit_cost

    def _make_review(self, s: Session, exp: Experiment, n: int, now: datetime) -> None:
        if s.scalars(select(Review).where(Review.experiment_id == exp.id, Review.checkpoint == n)).first():
            return
        sm = performance.summarise(s, exp)
        degraded = s.scalars(select(ExperimentSession).where(
            ExperimentSession.experiment_id == exp.id, ExperimentSession.quality != "OK")).all()
        summary = {
            "checkpoint": n, "sessions_closed": sm.sessions_closed,
            "trading_return": sm.trading_return, "economic_return": sm.economic_return,
            "allin_return": sm.allin_return, "benchmark_return": sm.benchmark_return,
            "max_drawdown_economic": sm.max_dd_economic, "sessions_hit_10pct": sm.sessions_hit_target,
            "total_charges_paise": sm.total_charges, "degraded_sessions": len(degraded),
            "reminder": ("Review only. Strategy parameters are frozen; any change requires a new experiment. "
                         "A small number of sessions cannot establish that returns are sustainable."),
        }
        s.add(Review(experiment_id=exp.id, checkpoint=n, generated_at=now, summary_json=json.dumps(summary)))
        incident(s, now, "INFO", "review", f"{exp.code}: review due after session {n}", exp.id, now.date(), draft_alert=False)
        audit(s, now, "engine", "review.generated", summary, exp.id)

    # -------------------------------------------------------- housekeeping
    def housekeeping(self) -> JobResult:
        from ..ops.audit import verify_audit_chain

        res = JobResult()
        now = self.ctx.clock.now()
        with self.ctx.db.session() as s:
            ok, bad = verify_audit_chain(s)
            if not ok:
                incident(s, now, "CRITICAL", "audit_chain", f"Audit chain broken at row {bad}")
                res.add(f"audit chain broken at {bad}")
            for exp in self.running(s):
                probs = portfolio.reconcile(s, exp)
                if probs:
                    incident(s, now, "CRITICAL", "reconciliation", "; ".join(probs), exp.id)
            s.execute(delete(QuoteSnapshot).where(QuoteSnapshot.observed_at < now - timedelta(days=30)))
        if self.ctx.db.path is not None:
            stamp = now.astimezone(IST).strftime("%Y%m%d-%H%M")
            target = self.ctx.settings.backup_dir / f"tradelab-{stamp}.db"
            self.ctx.db.backup_to(target)
            backups = sorted(self.ctx.settings.backup_dir.glob("tradelab-*.db"))
            for old in backups[:-30]:
                old.unlink()
            res.add(f"backup written: {target.name}")
        return res

    # ------------------------------------------------------------- recovery
    def recover(self) -> JobResult:
        """Run at startup: reconcile, then close any sessions missed while offline."""
        res = JobResult()
        now = self.ctx.clock.now()
        today = now.astimezone(IST).date()
        after_close = now.astimezone(IST).time() >= time(15, 50)
        with self.ctx.db.session() as s:
            for exp in self.running(s):
                probs = portfolio.reconcile(s, exp)
                if probs:
                    exp.entries_paused = True
                    exp.entries_paused_reason = "reconciliation failure on restart"
                    incident(s, now, "CRITICAL", "reconciliation", "; ".join(probs), exp.id)
                    res.add(f"{exp.code}: RECONCILIATION FAILED")
                    continue
                if exp.start_session_date is None:
                    continue
                d = exp.start_session_date
                last = today if after_close else today - timedelta(days=1)
                while d <= last and exp.status == "RUNNING":
                    if self.cal.is_regular_session(d):
                        row = self._session_row(s, exp, d)
                        if row is not None and row.status != "CLOSED":
                            # Orders from an unmonitored session get no retroactive fills.
                            for o in self.ctx.broker.open_orders(s, exp):
                                if o.session_date <= d:
                                    o.status = "EXPIRED" if o.filled_qty == 0 else "PART_EXPIRED"
                                    o.cancel_reason = "session missed while offline: no fills simulated"
                                    o.closed_at, o.reserved_paise = now, 0
                            if row.session_number is not None:
                                try:
                                    self.ensure_signal(s, exp, d, row.session_number)
                                except (MarketDataError, CalendarCoverageError):
                                    pass
                            self._close_session(s, exp, d, now, res, offline=True)
                            res.add(f"{exp.code}: recovered missed session {d}")
                    d += timedelta(days=1)
                audit(s, now, "engine", "recovery.completed", {"notes": res.notes}, exp.id)
        return res
