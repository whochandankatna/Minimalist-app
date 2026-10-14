"""Command-line interface: `tradelab <command>`. Run `tradelab -h` for the list."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import select

from .clock import IST, FakeClock
from .context import AppContext, build_context
from .money import fmt_inr, fmt_pct, rupees


def _ctx(**kw: Any) -> AppContext:
    return build_context(**kw)


def _pick(s: Any, exp_id: int | None) -> Any:
    from .models import Experiment

    if exp_id:
        e = s.get(Experiment, exp_id)
    else:
        e = s.scalars(select(Experiment).order_by(Experiment.id.desc())).first()
    if e is None:
        sys.exit("No experiment found. Create one with `tradelab experiment-create`.")
    return e


def cmd_init(a: argparse.Namespace) -> None:
    from .research.store import seed_sources

    ctx = _ctx()
    with ctx.db.session() as s:
        n = seed_sources(s)
    print(f"Database ready at {ctx.settings.db_path}. Research sources added: {n}.")
    print(f"Market data mode: {ctx.market.source} ({'LIVE' if ctx.market.is_live_data else 'MOCK, synthetic'})")


def cmd_serve(a: argparse.Namespace) -> None:
    import uvicorn

    from .settings import get_settings
    from .web.app import create_app

    st = get_settings()
    if a.host not in ("127.0.0.1", "localhost", "::1") and st.dashboard_password is None:
        sys.exit("Refusing to listen on a public interface without TRADELAB_DASHBOARD_PASSWORD set.")
    uvicorn.run(create_app(), host=a.host, port=a.port, log_level="info")


def cmd_calendar_show(a: argparse.Namespace) -> None:
    from .calendar import TradingCalendar

    cal = TradingCalendar.load()
    for y, yc in sorted(cal.years.items()):
        print(f"{y}: status={yc.verification_status} sha256={yc.file_sha256[:16]} file={yc.path.name}")
        for src in yc.sources:
            print(f"   source {src['id']} ({src['issued']}): {src['url']}")
        for d, n in sorted(yc.holidays.items()):
            print(f"   {d} {d.strftime('%a')}  {n}")
        for sp in yc.special.values():
            print(f"   SPECIAL {sp.day} {sp.name} [{sp.status}] trades={sp.strategy_trades}")
    today = datetime.now(IST).date()
    try:
        print("Next 25 sessions:", ", ".join(str(cal.nth_session_from(today, i)) for i in range(1, 26)))
    except Exception as e:  # noqa: BLE001
        print("cannot list sessions:", e)


def cmd_calendar_verify(a: argparse.Namespace) -> None:
    from .models import CalendarVerification
    from .ops.audit import audit

    ctx = _ctx()
    yc = ctx.calendar.years.get(a.year)
    if yc is None:
        sys.exit(f"no calendar file for {a.year}")
    print(f"You are confirming that config/calendar/{yc.path.name} matches the official NSE circular(s):")
    for src in yc.sources:
        print(f"  {src['id']}: {src['url']}")
    if not a.yes and input("Type VERIFIED to confirm: ").strip() != "VERIFIED":
        sys.exit("not confirmed")
    with ctx.db.session() as s:
        now = ctx.clock.now()
        s.add(CalendarVerification(year=a.year, file_sha256=yc.file_sha256, verified_by=a.by, verified_at=now,
                                   note=a.note or ""))
        audit(s, now, f"user:{a.by}", "calendar.verified", {"year": a.year, "sha256": yc.file_sha256})
    print("Recorded. Editing the file later invalidates this verification automatically.")


def cmd_experiment_create(a: argparse.Namespace) -> None:
    from .experiment.lifecycle import create_experiment

    ctx = _ctx()
    with ctx.db.session() as s:
        e = create_experiment(s, ctx, a.name, a.purpose, a.supersedes, a.notes)
        print(f"Created {e.code} (id {e.id}) as DRAFT. Data mode {e.data_mode}. Strategy fingerprint {e.strategy_hash[:12]}.")
        print("Next: `tradelab experiment-readiness` then `tradelab experiment-start`.")


def _print_checks(checks: list[Any]) -> bool:
    for c in checks:
        print(f"  [{'PASS' if c.ok else 'FAIL'}] {c.name}: {c.detail}")
    return all(c.ok for c in checks)


def cmd_experiment_readiness(a: argparse.Namespace) -> None:
    from .experiment.lifecycle import readiness

    ctx = _ctx()
    with ctx.db.session() as s:
        e = _pick(s, a.id)
        print(f"Readiness for {e.code}:")
        ok = _print_checks(readiness(s, e, ctx))
    print("READY" if ok else "NOT READY: the official clock cannot start yet.")


def cmd_experiment_start(a: argparse.Namespace) -> None:
    from .experiment.lifecycle import start_experiment

    ctx = _ctx()
    if ctx.db.path is not None:
        ctx.db.backup_to(ctx.settings.backup_dir / f"pre-start-{datetime.now(IST):%Y%m%d-%H%M%S}.db")
    with ctx.db.session() as s:
        e = _pick(s, a.id)
        checks = start_experiment(s, e, ctx)
        ok = _print_checks(checks)
        if ok:
            print(f"{e.code} RUNNING. First session: {e.start_session_date}.")
        else:
            print("Not started.")


def cmd_experiment_abandon(a: argparse.Namespace) -> None:
    from .experiment.controls import abandon

    ctx = _ctx()
    with ctx.db.session() as s:
        e = _pick(s, a.id)
        abandon(s, ctx, e, "user:cli", a.reason)
        print(f"{e.code} ABANDONED. All records preserved.")


def cmd_run_job(a: argparse.Namespace) -> None:
    from .experiment.engine import ForwardEngine
    from .scheduler import run_job

    ctx = _ctx()
    eng = ForwardEngine(ctx)
    res = run_job(ctx, a.job, getattr(eng, a.job))
    print(res.status)
    for n in res.notes:
        print(" ", n)


def cmd_backtest(a: argparse.Namespace) -> None:
    from .backtest.engine import evaluation_runs, load_periods, record_run, run_backtest
    from .models import DailyBar

    ctx = _ctx()
    periods = load_periods()
    p = periods["periods"][a.period]
    start, end = date.fromisoformat(p["start"]), date.fromisoformat(p["end"])
    if a.period == "EVALUATION" and not a.confirm_holdout:
        sys.exit(f"EVALUATION is the untouched hold-out ({evaluation_runs(ctx)} previous runs). "
                 "Re-run with --confirm-holdout if you really mean to use it.")
    warm = start - timedelta(days=int(periods["warmup_calendar_days"]))
    bars: dict[str, list[Any]] = {}
    if a.source == "csv":
        from .marketdata.base import Bar

        with ctx.db.session() as s:
            for sym in ctx.universe.symbols:
                rows = s.scalars(select(DailyBar).where(DailyBar.symbol == sym, DailyBar.source == "CSV",
                                                        DailyBar.day >= warm, DailyBar.day <= end)
                                 .order_by(DailyBar.day)).all()
                bars[sym] = [Bar(r.symbol, r.day, r.open_paise, r.high_paise, r.low_paise, r.close_paise, r.volume,
                                 "CSV") for r in rows]
        source = "CSV"
    else:
        bars = {sym: ctx.market.daily_bars(sym, warm, end) for sym in ctx.universe.symbols}
        source = ctx.market.source
    for label, opex in (("strategy view (no running costs)", 0), ("economic view", rupees(a.opex_monthly_rupees))):
        r = run_backtest(ctx, bars, start, end, a.period, source, opex_monthly=opex)
        rid = record_run(ctx, r)
        print(f"\n== {a.period} {label} [run #{rid}] data={source} {r.start}..{r.end} ({r.days} sessions)")
        if source == "MOCK":
            print("   MOCK DATA: synthetic prices. These numbers say nothing about real markets.")
        print(f"   trading return {fmt_pct(r.trading_return)}  economic {fmt_pct(r.economic_return)}  "
              f"benchmark {fmt_pct(r.benchmark_return)}  max DD {fmt_pct(r.max_drawdown, 1, False)}")
        print(f"   trades {r.trades}, charges {fmt_inr(r.charges)}, running costs {fmt_inr(r.opex)}, "
              f"avg invested {r.avg_invested_fraction:.0%}, sessions >= +10%: {r.days_hit_10pct}")
        for n in r.notes:
            print("  ", n)


def cmd_import_bars(a: argparse.Namespace) -> None:
    from .marketdata.csvdata import read_bars_csv
    from .models import DailyBar

    ctx = _ctx()
    bars = read_bars_csv(a.path)
    n = 0
    with ctx.db.session() as s:
        for b in bars:
            if s.scalars(select(DailyBar).where(DailyBar.symbol == b.symbol, DailyBar.day == b.day,
                                                DailyBar.source == "CSV")).first():
                continue
            s.add(DailyBar(symbol=b.symbol, day=b.day, open_paise=b.open, high_paise=b.high, low_paise=b.low,
                           close_paise=b.close, volume=b.volume, source="CSV", retrieved_at=ctx.clock.now()))
            n += 1
    print(f"imported {n} new bars ({len(bars) - n} duplicates skipped)")


def cmd_expense_add(a: argparse.Namespace) -> None:
    from .models import Expense
    from .ops.audit import audit

    ctx = _ctx()
    with ctx.db.session() as s:
        e = Expense(scope=a.scope, category=a.category, description=a.description,
                    amount_paise=rupees(a.amount_rupees), basis=a.basis, start_date=date.fromisoformat(a.start),
                    verified_price=a.verified, source_url=a.source_url, experiment_id=a.experiment,
                    created_at=ctx.clock.now())
        s.add(e)
        s.flush()
        audit(s, ctx.clock.now(), "user:cli", "expense.added", {
            "id": e.id, "scope": e.scope, "category": e.category, "amount_paise": e.amount_paise, "basis": e.basis,
            "start": a.start, "verified": a.verified})
        print(f"expense #{e.id} recorded")


def cmd_expense_end(a: argparse.Namespace) -> None:
    from .models import Expense
    from .ops.audit import audit

    ctx = _ctx()
    with ctx.db.session() as s:
        e = s.get(Expense, a.id)
        if e is None:
            sys.exit("not found")
        e.end_date = date.fromisoformat(a.end)
        audit(s, ctx.clock.now(), "user:cli", "expense.ended", {"id": e.id, "end": a.end})
        print("updated")


def cmd_ca_add(a: argparse.Namespace) -> None:
    from .models import CorporateAction
    from .ops.audit import audit

    ctx = _ctx()
    with ctx.db.session() as s:
        ca = CorporateAction(symbol=a.symbol.upper(), kind=a.kind, ex_date=date.fromisoformat(a.ex_date),
                             ratio_new=a.ratio_new, ratio_old=a.ratio_old,
                             dividend_per_unit_paise=rupees(a.dividend_rupees), source_url=a.source_url,
                             entered_at=ctx.clock.now(), notes=a.notes)
        s.add(ca)
        s.flush()
        audit(s, ctx.clock.now(), "user:cli", "corporate_action.added", {
            "id": ca.id, "symbol": ca.symbol, "kind": ca.kind, "ex_date": a.ex_date, "source": a.source_url})
        print(f"corporate action #{ca.id} recorded")


def cmd_research_enable(a: argparse.Namespace) -> None:
    from .models import ResearchSource
    from .ops.audit import audit

    ctx = _ctx()
    with ctx.db.session() as s:
        src = s.scalars(select(ResearchSource).where(ResearchSource.key == a.key)).first()
        if src is None:
            sys.exit("unknown source")
        if "BLOCKED" in src.terms_status:
            sys.exit("This source blocks automated access. It stays manual-only.")
        if src.access_method == "MANUAL":
            sys.exit("This source has no automated method.")
        src.automated_enabled = not a.disable
        if not a.disable:
            src.terms_status = "HUMAN_REVIEWED_PERMITTED"
            src.terms_note = f"{src.terms_note} | Enabled by {a.by}: {a.note}"
        audit(s, ctx.clock.now(), f"user:{a.by}", "research.source_toggled",
              {"key": a.key, "enabled": not a.disable, "note": a.note})
        print(f"{a.key}: automated {'enabled' if not a.disable else 'disabled'}")


def cmd_research_fetch(a: argparse.Namespace) -> None:
    from .research.fetch import fetch_enabled

    ctx = _ctx()
    with ctx.db.session() as s:
        for k, st in fetch_enabled(s, ctx.clock.now()) or [("(none)", "no sources enabled")]:
            print(f"{k}: {st}")


def cmd_backup(a: argparse.Namespace) -> None:
    ctx = _ctx()
    t = ctx.settings.backup_dir / f"manual-{datetime.now(IST):%Y%m%d-%H%M%S}.db"
    ctx.db.backup_to(t)
    print(f"backup written to {t}")


def cmd_audit_verify(a: argparse.Namespace) -> None:
    from .ops.audit import verify_audit_chain

    ctx = _ctx()
    with ctx.db.session() as s:
        ok, bad = verify_audit_chain(s)
    print("audit chain intact" if ok else f"AUDIT CHAIN BROKEN at row {bad}")
    sys.exit(0 if ok else 1)


def cmd_reconcile(a: argparse.Namespace) -> None:
    from .accounting.portfolio import reconcile
    from .models import Experiment

    ctx = _ctx()
    bad = False
    with ctx.db.session() as s:
        for e in s.scalars(select(Experiment).where(Experiment.started_at.is_not(None))):
            p = reconcile(s, e)
            print(f"{e.code}: {'consistent' if not p else 'PROBLEMS: ' + '; '.join(p)}")
            bad |= bool(p)
    sys.exit(1 if bad else 0)


def cmd_demo_simulate(a: argparse.Namespace) -> None:
    """Fast-forward a DEMO experiment through past sessions on MOCK data (for demos/tests)."""
    from .db import Database
    from .experiment.engine import ForwardEngine
    from .experiment.lifecycle import create_experiment, start_experiment
    from .marketdata.mock import MockMarketData
    from .scheduler import run_job
    from .settings import get_settings

    st = get_settings()
    if st.market_data != "mock":
        sys.exit("demo-simulate only runs with TRADELAB_MARKET_DATA=mock")
    from .calendar import TradingCalendar

    cal = TradingCalendar.load()
    today = datetime.now(IST).date()
    first = today
    for _ in range(a.sessions):
        first = cal.previous_regular_session(first)
    clock = FakeClock(datetime.combine(cal.previous_regular_session(first), time(18, 0), IST))
    db = Database(st.db_path)
    from .marketdata.base import Universe

    ctx = build_context(clock=clock, db=db, market=MockMarketData(Universe.load(), clock, cal))
    with ctx.db.session() as s:
        e = create_experiment(s, ctx, a.name, "DEMO", notes="fast-forward simulation on MOCK data")
        checks = start_experiment(s, e, ctx, actor="demo-simulate")
        if e.status != "RUNNING":
            _print_checks(checks)
            sys.exit("demo could not start")
        print(f"{e.code} started; first session {e.start_session_date}")
    eng = ForwardEngine(ctx)
    d = first
    while d < today:
        if cal.is_regular_session(d):
            for hh, mm, job in ((8, 45, "pre_session"), (9, 20, "submit_orders")):
                clock.set(datetime.combine(d, time(hh, mm), IST))
                run_job(ctx, job, getattr(eng, job))
            t = datetime.combine(d, time(9, 21), IST)
            while t < datetime.combine(d, time(15, 25), IST):
                clock.set(t)
                run_job(ctx, "monitor", eng.monitor, record_skips=False)
                t += timedelta(minutes=a.monitor_minutes)
            for hh, mm, job in ((15, 25, "expire_orders"), (15, 50, "post_close")):
                clock.set(datetime.combine(d, time(hh, mm), IST))
                r = run_job(ctx, job, getattr(eng, job))
            print(f"  {d}: {r.notes[-1] if r.notes else r.status}")
        d += timedelta(days=1)


def cmd_healthcheck(a: argparse.Namespace) -> None:
    """Independent probe for cron / uptime monitors. Exit code 0 = healthy."""
    import httpx

    try:
        r = httpx.get(a.url.rstrip("/") + "/healthz", timeout=10)
        data = r.json()
    except Exception as e:  # noqa: BLE001
        print(f"UNHEALTHY: {type(e).__name__}: {e}")
        sys.exit(2)
    ok = r.status_code == 200 and data.get("ok") and (data.get("scheduler") or not a.require_scheduler)
    print(("HEALTHY " if ok else "UNHEALTHY ") + json.dumps(data))
    sys.exit(0 if ok else 1)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="tradelab", description="Indian ETF research & PAPER-trading lab (no live orders)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name: str, fn: Any, help_: str) -> argparse.ArgumentParser:
        sp = sub.add_parser(name, help=help_)
        sp.set_defaults(fn=fn)
        return sp

    add("init", cmd_init, "create database and seed research sources")
    sp = add("serve", cmd_serve, "run dashboard + scheduler")
    sp.add_argument("--host", default="127.0.0.1")
    sp.add_argument("--port", type=int, default=8000)
    add("calendar-show", cmd_calendar_show, "show NSE calendar files and upcoming sessions")
    sp = add("calendar-verify", cmd_calendar_verify, "record that a human checked the calendar against NSE")
    sp.add_argument("--year", type=int, required=True)
    sp.add_argument("--by", required=True)
    sp.add_argument("--note", default="")
    sp.add_argument("--yes", action="store_true")
    sp = add("experiment-create", cmd_experiment_create, "create a DRAFT experiment (frozen strategy)")
    sp.add_argument("--purpose", choices=["DEMO", "OFFICIAL"], required=True)
    sp.add_argument("--name", default="ETF trend momentum v1, 20 sessions")
    sp.add_argument("--supersedes", type=int)
    sp.add_argument("--notes")
    for name, fn, h in (("experiment-readiness", cmd_experiment_readiness, "run readiness checks"),
                        ("experiment-start", cmd_experiment_start, "start the clock if every check passes")):
        sp = add(name, fn, h)
        sp.add_argument("--id", type=int)
    sp = add("experiment-abandon", cmd_experiment_abandon, "end an experiment early (records kept)")
    sp.add_argument("--id", type=int, required=True)
    sp.add_argument("--reason", required=True)
    sp = add("run-job", cmd_run_job, "run one scheduler job now")
    sp.add_argument("job", choices=["pre_session", "submit_orders", "monitor", "expire_orders", "post_close",
                                    "housekeeping", "recover"])
    sp = add("backtest", cmd_backtest, "historical backtest (separate from forward test)")
    sp.add_argument("--period", choices=["TRAIN", "VALIDATION", "EVALUATION"], required=True)
    sp.add_argument("--source", choices=["provider", "csv"], default="provider")
    sp.add_argument("--confirm-holdout", action="store_true")
    sp.add_argument("--opex-monthly-rupees", default="500")
    sp = add("import-bars", cmd_import_bars, "import daily bars from CSV")
    sp.add_argument("path", type=lambda x: __import__("pathlib").Path(x))
    sp = add("expense-add", cmd_expense_add, "record a cost paid outside the virtual account")
    sp.add_argument("--scope", choices=["OPERATING", "SETUP"], required=True)
    sp.add_argument("--category", choices=["API", "HOSTING", "AI", "DATA", "DOMAIN", "OTHER"], required=True)
    sp.add_argument("--description", required=True)
    sp.add_argument("--amount-rupees", required=True)
    sp.add_argument("--basis", choices=["MONTHLY", "ONE_OFF"], required=True)
    sp.add_argument("--start", required=True)
    sp.add_argument("--verified", action="store_true", help="price confirmed from an invoice or official page")
    sp.add_argument("--source-url")
    sp.add_argument("--experiment", type=int)
    sp = add("expense-end", cmd_expense_end, "set an end date on a recurring expense")
    sp.add_argument("--id", type=int, required=True)
    sp.add_argument("--end", required=True)
    sp = add("corporate-action-add", cmd_ca_add, "record a split/bonus/dividend from an official source")
    sp.add_argument("--symbol", required=True)
    sp.add_argument("--kind", choices=["SPLIT", "BONUS", "DIVIDEND"], required=True)
    sp.add_argument("--ex-date", required=True)
    sp.add_argument("--ratio-new", type=int, default=1)
    sp.add_argument("--ratio-old", type=int, default=1)
    sp.add_argument("--dividend-rupees", default="0")
    sp.add_argument("--source-url", required=True)
    sp.add_argument("--notes")
    sp = add("research-enable", cmd_research_enable, "enable/disable automated fetching for a source")
    sp.add_argument("key")
    sp.add_argument("--by", required=True)
    sp.add_argument("--note", required=True)
    sp.add_argument("--disable", action="store_true")
    add("research-fetch", cmd_research_fetch, "fetch enabled research sources now")
    add("backup", cmd_backup, "write a database backup now")
    add("audit-verify", cmd_audit_verify, "verify the hash-chained audit log")
    add("reconcile", cmd_reconcile, "re-derive cash and holdings for every experiment")
    sp = add("demo-simulate", cmd_demo_simulate, "fast-forward a DEMO experiment on mock data")
    sp.add_argument("--sessions", type=int, default=12)
    sp.add_argument("--monitor-minutes", type=int, default=15)
    sp.add_argument("--name", default="Demo on synthetic data (does not count)")
    sp = add("healthcheck", cmd_healthcheck, "independent health probe")
    sp.add_argument("--url", default="http://127.0.0.1:8000")
    sp.add_argument("--require-scheduler", action="store_true")
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
