"""Read-only view models for the dashboard. No secrets ever enter these dicts."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..accounting import performance, portfolio
from ..accounting.expenses import expense_lines, opex_accrued, setup_allocated, unallocated_setup
from ..clock import IST, to_ist
from ..context import AppContext
from ..marketdata.kite_session import current_session
from ..models import (
    AlertDraft,
    AuditLog,
    BacktestRun,
    Experiment,
    ExperimentSession,
    Fill,
    Incident,
    JobRun,
    Order,
    QuoteSnapshot,
    ResearchItem,
    ResearchSource,
    Review,
    RiskFlag,
    Signal,
)


def pick_experiment(s: Session, exp_id: int | None) -> Experiment | None:
    if exp_id:
        return s.get(Experiment, exp_id)
    for cond in (
        (Experiment.purpose == "OFFICIAL") & (Experiment.status == "RUNNING"),
        Experiment.status == "RUNNING",
    ):
        e = s.scalars(select(Experiment).where(cond).order_by(Experiment.id.desc())).first()
        if e:
            return e
    return s.scalars(select(Experiment).order_by(Experiment.id.desc())).first()


def status_banner(ctx: AppContext, s: Session) -> dict[str, Any]:
    now = ctx.clock.now()
    live = ctx.market.is_live_data
    auth_ok: bool | None = None
    auth_msg = "not applicable (mock data)"
    if live:
        ks = current_session(s, now)
        auth_ok = ks is not None
        auth_msg = (f"Kite session valid until {to_ist(ks.expires_at):%d %b %H:%M} IST" if ks
                    else "Not logged in to Kite today. Market data unavailable; no new entries.")
    d = now.astimezone(IST).date()
    try:
        if ctx.calendar.is_regular_session(d):
            mkt = "OPEN" if ctx.calendar.is_market_open(now) else "CLOSED (session day)"
        else:
            mkt = f"CLOSED ({ctx.calendar.holiday_name(d) or 'weekend'})"
        nxt = ctx.calendar.next_regular_session(d).isoformat()
    except Exception as e:  # noqa: BLE001
        mkt, nxt = f"CALENDAR UNAVAILABLE: {e}", "?"
    return {
        "execution": "PAPER", "data_mode": "LIVE DATA" if live else "MOCK DATA", "live": live,
        "auth_ok": auth_ok, "auth_msg": auth_msg, "market": mkt, "next_session": nxt,
        "now": now.astimezone(IST).strftime("%a %d %b %Y, %H:%M:%S IST"),
    }


def _latest_marks(s: Session, exp: Experiment) -> tuple[dict[str, int], dict[str, str]]:
    """Newest available mark per held symbol: a quote taken after the last close, else that close."""
    marks: dict[str, int] = {}
    src: dict[str, str] = {}
    last = s.scalars(select(ExperimentSession).where(ExperimentSession.experiment_id == exp.id,
                                                     ExperimentSession.status == "CLOSED")
                     .order_by(ExperimentSession.session_date.desc())).first()
    closes = json.loads(last.marks_json) if last else {}
    for sym in portfolio.positions(s, exp.id):
        q = s.scalars(select(QuoteSnapshot).where(QuoteSnapshot.symbol == sym).order_by(QuoteSnapshot.id.desc())).first()
        if q is not None and (last is None or last.closed_at is None or q.observed_at > last.closed_at):
            marks[sym] = q.ltp_paise
            src[sym] = f"{q.source} quote {to_ist(q.observed_at):%d %b %H:%M}{' (STALE)' if q.stale else ''}"
        elif sym in closes:
            marks[sym] = int(closes[sym])
            src[sym] = f"close of {last.session_date:%d %b}" if last else "close"
    return marks, src


def overview(ctx: AppContext, s: Session, exp: Experiment) -> dict[str, Any]:
    now = ctx.clock.now()
    today = now.astimezone(IST).date()
    sessions = list(s.scalars(select(ExperimentSession).where(ExperimentSession.experiment_id == exp.id)
                              .order_by(ExperimentSession.session_date)))
    closed = [r for r in sessions if r.status == "CLOSED" and r.session_number is not None]
    marks, mark_src = _latest_marks(s, exp)
    pos = portfolio.positions(s, exp.id)
    snap = performance.snapshot(s, exp, today, marks) if exp.started_at else None
    sm = performance.summarise(s, exp)
    start = exp.starting_capital_paise
    n_closed = len(closed)
    labels = ["start"] + [f"#{r.session_number}" for r in closed]
    curve = {
        "labels": labels,
        "trading": [start / 100] + [r.trading_equity_paise / 100 for r in closed],
        "economic": [start / 100] + [r.economic_equity_paise / 100 for r in closed],
        "allin": [start / 100] + [r.allin_equity_paise / 100 for r in closed],
        "benchmark": [start / 100] + [(r.benchmark_value_paise or 0) / 100 or None for r in closed],
        "target": performance.target_curve(start, n_closed),
        "returns": [round((r.return_economic or 0) * 100, 3) for r in closed],
    }
    holdings = []
    for sym, p in pos.items():
        mk = marks.get(sym)
        holdings.append({"symbol": sym, "qty": p.qty, "avg_cost": p.avg_cost, "cost": p.cost_paise,
                         "mark": mk, "mark_src": mark_src.get(sym, "no mark: carried at cost"),
                         "value": p.qty * mk if mk else p.cost_paise,
                         "unrealised": (p.qty * mk - p.cost_paise) if mk else None})
    reviews = list(s.scalars(select(Review).where(Review.experiment_id == exp.id).order_by(Review.checkpoint)))
    checkpoints = []
    for c in [int(x) for x in exp.review_checkpoints.split(",")]:
        rv = next((r for r in reviews if r.checkpoint == c), None)
        checkpoints.append({"n": c, "status": ("acknowledged" if rv and rv.acknowledged_at else
                                                "REVIEW DUE" if rv else "pending"),
                            "review": json.loads(rv.summary_json) if rv else None, "id": rv.id if rv else None})
    sig = s.scalars(select(Signal).where(Signal.experiment_id == exp.id).order_by(Signal.valid_for.desc())).first()
    expected_end = None
    if exp.start_session_date:
        try:
            expected_end = ctx.calendar.nth_session_from(exp.start_session_date, exp.target_sessions)
        except Exception:  # noqa: BLE001
            expected_end = None
    realised_net = sm.realised_gross - sm.total_charges
    return {
        "exp": exp, "snap": snap, "summary": sm, "curve": curve, "holdings": holdings,
        "n_closed": n_closed, "checkpoints": checkpoints, "sessions": sessions[-30:][::-1],
        "signal": json.loads(sig.payload_json) if sig else None, "signal_row": sig,
        "expected_end": expected_end, "risk": json.loads(exp.risk_json),
        "indicative_tax": performance.indicative_tax(realised_net), "realised_net": realised_net,
        "target_after_n": performance.target_curve(start, n_closed)[-1] if n_closed else start / 100,
    }


def orders_view(s: Session, exp: Experiment) -> dict[str, Any]:
    orders = list(s.scalars(select(Order).where(Order.experiment_id == exp.id).order_by(Order.created_at.desc()).limit(200)))
    fills = list(s.scalars(select(Fill).where(Fill.experiment_id == exp.id).order_by(Fill.ts.desc()).limit(200)))
    reasons = {o.id: o.reason for o in orders}
    return {"pending": [o for o in orders if o.status in ("OPEN", "PARTIALLY_FILLED")], "orders": orders,
            "fills": fills, "reasons": reasons}


def health(ctx: AppContext, s: Session) -> dict[str, Any]:
    now = ctx.clock.now()
    incidents = list(s.scalars(select(Incident).order_by(Incident.id.desc()).limit(100)))
    jobs = list(s.scalars(select(JobRun).order_by(JobRun.id.desc()).limit(60)))
    last_by_job: dict[str, JobRun] = {}
    for j in jobs:
        last_by_job.setdefault(j.job, j)
    q = s.scalars(select(QuoteSnapshot).order_by(QuoteSnapshot.id.desc())).first()
    degraded = list(s.scalars(select(ExperimentSession).where(ExperimentSession.quality != "OK")
                              .order_by(ExperimentSession.session_date.desc()).limit(50)))
    alerts = list(s.scalars(select(AlertDraft).order_by(AlertDraft.id.desc()).limit(30)))
    from ..ops.audit import verify_audit_chain

    chain_ok, bad = verify_audit_chain(s)
    return {
        "incidents": incidents, "open_incidents": [i for i in incidents if i.resolved_at is None],
        "jobs": jobs, "last_by_job": last_by_job,
        "last_quote": q, "last_quote_age": (now - q.observed_at).total_seconds() if q else None,
        "degraded": degraded, "alerts": alerts, "chain_ok": chain_ok, "chain_bad": bad,
        "audit_rows": int(s.scalar(select(func.count()).select_from(AuditLog)) or 0),
    }


def research(ctx: AppContext, s: Session) -> dict[str, Any]:
    now = ctx.clock.now()
    srcs = list(s.scalars(select(ResearchSource).order_by(ResearchSource.key)))
    items = list(s.scalars(select(ResearchItem).order_by(ResearchItem.id.desc()).limit(100)))
    names = {x.id: x.name for x in srcs}
    flags = list(s.scalars(select(RiskFlag).order_by(RiskFlag.id.desc()).limit(100)))
    rows = []
    for it in items:
        age = now - it.retrieved_at
        rows.append({"it": it, "source": names.get(it.source_id, "?"), "age_h": age.total_seconds() / 3600,
                     "facts": json.loads(it.facts_json), "inferences": json.loads(it.inferences_json),
                     "missing": json.loads(it.missing_json), "metrics": json.loads(it.metrics_json)})
    return {"sources": srcs, "rows": rows, "flags": flags, "now": now}


def costs(ctx: AppContext, s: Session, exp: Experiment | None) -> dict[str, Any]:
    today = ctx.clock.now().astimezone(IST).date()
    d: dict[str, Any] = {"lines": expense_lines(s), "unallocated_setup": unallocated_setup(s, today)}
    if exp is not None and exp.started_at:
        d["opex"] = opex_accrued(s, exp, today)
        d["setup"] = setup_allocated(s, exp, today)
        d["exp_lines"] = expense_lines(s, exp)
    return d


def experiments_list(s: Session) -> list[Experiment]:
    return list(s.scalars(select(Experiment).order_by(Experiment.id.desc())))


def backtests(s: Session) -> list[dict[str, Any]]:
    out = []
    for r in s.scalars(select(BacktestRun).order_by(BacktestRun.id.desc()).limit(50)):
        out.append({"r": r, "res": json.loads(r.results_json), "equity": json.loads(r.equity_json)})
    return out


def fmt_dt(dt: datetime | None) -> str:
    return to_ist(dt).strftime("%d %b %Y %H:%M") if dt else "n/a"


def fmt_d(d: date | None) -> str:
    return d.strftime("%a %d %b %Y") if d else "n/a"


def ago(dt: datetime | None, now: datetime) -> str:
    if dt is None:
        return "never"
    secs = (now - dt).total_seconds()
    if secs < 120:
        return f"{int(secs)}s ago"
    if secs < 7200:
        return f"{int(secs // 60)} min ago"
    if secs < 172800:
        return f"{secs / 3600:.1f} h ago"
    return f"{secs / 86400:.1f} days ago"

