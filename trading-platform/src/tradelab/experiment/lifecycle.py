"""Experiment creation, readiness gate and start.

Official-clock rules:
- An OFFICIAL experiment must use LIVE_DATA (DB constraint + check here).
- It can only start when every readiness check passes.
- Only one OFFICIAL experiment may be RUNNING at a time.
- Strategy/risk/fees are frozen (hashed) at creation; any change => new experiment.
- DEMO experiments (mock data, development) never count towards the 20 sessions.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..accounting import portfolio
from ..calendar import CalendarCoverageError
from ..clock import IST
from ..context import AppContext
from ..models import CalendarVerification, Experiment
from ..ops.audit import audit
from ..strategy.spec import fingerprint


class ExperimentError(RuntimeError):
    pass


class FrozenSpecViolation(ExperimentError):
    pass


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    detail: str


def create_experiment(
    s: Session, ctx: AppContext, name: str, purpose: str, supersedes: int | None = None, notes: str | None = None
) -> Experiment:
    now = ctx.clock.now()
    data_mode = "LIVE_DATA" if ctx.market.is_live_data else "MOCK"
    if purpose == "OFFICIAL" and data_mode != "LIVE_DATA":
        raise ExperimentError("An OFFICIAL experiment requires live market data (Kite Connect). Use DEMO with mock data.")
    n = int(s.scalar(select(func.count()).select_from(Experiment)) or 0) + 1
    code = f"{'EXP' if purpose == 'OFFICIAL' else 'DEMO'}-{now.year}-{n:03d}"
    spec = ctx.spec
    exp = Experiment(
        code=code, name=name, purpose=purpose, data_mode=data_mode, status="DRAFT",
        strategy_id=spec.strategy_id, strategy_version=spec.version, strategy_hash=spec.fingerprint,
        strategy_spec_json=json.dumps(spec.raw_strategy), risk_json=spec.risk.to_json(),
        fee_schedule_id=ctx.fees.id, fee_schedule_sha=ctx.fees.file_sha256,
        calendar_sha_json=json.dumps({str(y): c.file_sha256 for y, c in ctx.calendar.years.items()}),
        starting_capital_paise=spec.risk.starting_capital, target_sessions=20, review_checkpoints="5,10,20",
        created_at=now, supersedes_experiment_id=supersedes, benchmark_symbol=ctx.universe.benchmark,
        peak_economic_equity_paise=spec.risk.starting_capital, notes=notes,
    )
    s.add(exp)
    s.flush()
    if supersedes:
        old = s.get(Experiment, supersedes)
        if old is None:
            raise ExperimentError("superseded experiment not found")
    audit(s, now, "user", "experiment.created", {
        "code": code, "purpose": purpose, "data_mode": data_mode, "strategy_hash": spec.fingerprint,
        "fee_schedule": ctx.fees.id, "supersedes": supersedes}, exp.id)
    return exp


def verify_frozen(exp: Experiment, ctx: AppContext) -> None:
    current = fingerprint()
    if current != exp.strategy_hash:
        raise FrozenSpecViolation(
            f"Strategy/risk/universe files changed since {exp.code} was frozen "
            f"(was {exp.strategy_hash[:12]}, now {current[:12]}). Create a new experiment."
        )
    if ctx.fees.file_sha256 != exp.fee_schedule_sha:
        raise FrozenSpecViolation(f"Fee schedule changed since {exp.code} was frozen.")


def first_session_for_start(ctx: AppContext, now: datetime) -> date:
    """Start today only if before the pre-open (09:00 IST); otherwise the next session."""
    d = now.astimezone(IST).date()
    if ctx.calendar.is_regular_session(d) and now.astimezone(IST).time() < time(9, 0):
        return d
    return ctx.calendar.next_regular_session(d)


def readiness(s: Session, exp: Experiment, ctx: AppContext) -> list[Check]:
    checks: list[Check] = []
    now = ctx.clock.now()
    official = exp.purpose == "OFFICIAL"

    try:
        verify_frozen(exp, ctx)
        checks.append(Check("strategy_frozen", True, f"fingerprint {exp.strategy_hash[:12]} unchanged"))
    except FrozenSpecViolation as e:
        checks.append(Check("strategy_frozen", False, str(e)))

    try:
        start = first_session_for_start(ctx, now)
        end = ctx.calendar.nth_session_from(start, exp.target_sessions + 5)
        checks.append(Check("calendar_coverage", True, f"sessions {start} .. ~{end} covered"))
        years = sorted({start.year, end.year})
    except CalendarCoverageError as e:
        checks.append(Check("calendar_coverage", False, str(e)))
        years = []

    if official:
        missing = []
        for y in years:
            yc = ctx.calendar.years[y]
            v = s.scalars(select(CalendarVerification).where(
                CalendarVerification.year == y, CalendarVerification.file_sha256 == yc.file_sha256)).first()
            if v is None:
                missing.append(str(y))
        checks.append(Check("calendar_verified_by_human", not missing and bool(years),
                            "verified against official NSE circular" if not missing and years
                            else f"run `tradelab calendar-verify --year` for: {', '.join(missing) or 'n/a'}"))
        checks.append(Check("live_market_data", ctx.market.is_live_data,
                            "Kite Connect market data" if ctx.market.is_live_data else "provider is MOCK"))
    else:
        checks.append(Check("demo_mode", True, "DEMO experiment: never counts towards the official 20 sessions"))

    ok, msg = ctx.market.auth_status()
    checks.append(Check("market_data_auth", ok, msg))

    syms = ctx.universe.symbols
    try:
        q = ctx.market.quotes(syms) if ok else {}
        missing_q = [x for x in syms if x not in q or q[x].ltp <= 0]
        checks.append(Check("quotes_available", ok and not missing_q,
                            "all instruments quoted" if not missing_q else f"no quote: {missing_q}"))
    except Exception as e:  # noqa: BLE001 - readiness must report, not crash
        checks.append(Check("quotes_available", False, f"{type(e).__name__}: {e}"))

    try:
        prev = ctx.calendar.previous_regular_session(first_session_for_start(ctx, now))
        gaps = []
        for sym in syms:
            bars = ctx.market.daily_bars(sym, prev - timedelta(days=260), prev)
            if len(bars) < ctx.spec.params.min_history:
                gaps.append(f"{sym}: {len(bars)} bars < {ctx.spec.params.min_history}")
            elif bars[-1].day != prev:
                gaps.append(f"{sym}: last bar {bars[-1].day}, expected {prev}")
        checks.append(Check("price_history", not gaps, "sufficient history" if not gaps else "; ".join(gaps)))
    except Exception as e:  # noqa: BLE001
        checks.append(Check("price_history", False, f"{type(e).__name__}: {e}"))

    from .selftest import execution_selftest

    st_problems = execution_selftest(ctx)
    checks.append(Check("execution_simulation_selftest", not st_problems,
                        "order/fill/charges/reconcile scenario passed" if not st_problems else "; ".join(st_problems)))

    probs = portfolio.reconcile(s, exp) if exp.status != "DRAFT" else []
    checks.append(Check("accounting_reconciliation", not probs, "consistent" if not probs else "; ".join(probs)))

    if official:
        other = s.scalars(select(Experiment).where(Experiment.purpose == "OFFICIAL", Experiment.status == "RUNNING",
                                                   Experiment.id != exp.id)).first()
        checks.append(Check("single_official_experiment", other is None,
                            "no other official experiment running" if other is None else f"{other.code} is running"))
    return checks


def start_experiment(s: Session, exp: Experiment, ctx: AppContext, actor: str = "user") -> list[Check]:
    if exp.status != "DRAFT":
        raise ExperimentError(f"{exp.code} is {exp.status}; only DRAFT experiments can start")
    checks = readiness(s, exp, ctx)
    failed = [c for c in checks if not c.ok]
    now = ctx.clock.now()
    audit(s, now, actor, "experiment.readiness", {"checks": [c.__dict__ for c in checks]}, exp.id)
    if failed:
        return checks
    start = first_session_for_start(ctx, now)
    exp.status = "RUNNING"
    exp.started_at = now
    exp.start_session_date = start
    portfolio.post(s, exp.id, now, start, "INITIAL_CAPITAL", exp.starting_capital_paise, "initial",
                   memo="Virtual starting capital")
    audit(s, now, actor, "experiment.started", {"code": exp.code, "first_session": start.isoformat(),
                                                "strategy_hash": exp.strategy_hash}, exp.id)
    return checks


def end_experiment(s: Session, exp: Experiment, now: datetime, status: str, reason: str, actor: str) -> None:
    if status not in ("COMPLETED", "HALTED", "ABANDONED"):
        raise ValueError(status)
    exp.status = status
    exp.ended_at = now
    exp.end_reason = reason
    audit(s, now, actor, f"experiment.{status.lower()}", {"reason": reason}, exp.id)
