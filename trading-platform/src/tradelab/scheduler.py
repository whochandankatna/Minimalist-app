"""APScheduler wiring. All triggers use Asia/Kolkata.

Cron triggers fire on weekdays; each job then consults the NSE calendar
(holidays, special sessions) itself, so the calendar file is the single source
of truth. Every run is recorded in job_runs for the health page.
"""

from __future__ import annotations

import logging
import traceback
from collections.abc import Callable
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .clock import IST
from .context import AppContext
from .experiment.engine import ForwardEngine, JobResult
from .models import JobRun

log = logging.getLogger("tradelab.scheduler")


def run_job(ctx: AppContext, name: str, fn: Callable[[], JobResult], record_skips: bool = True) -> JobResult:
    started = ctx.clock.now()
    try:
        res = fn()
    except Exception as e:  # noqa: BLE001 - a job failure must be recorded, not crash the scheduler
        res = JobResult("FAILED", [f"{type(e).__name__}: {e}", traceback.format_exc(limit=3)])
        log.exception("job %s failed", name)
        from .ops.audit import incident

        with ctx.db.session() as s:
            incident(s, ctx.clock.now(), "ERROR", f"job:{name}", f"{type(e).__name__}: {e}")
    if res.status == "SKIPPED" and not record_skips:
        return res
    with ctx.db.session() as s:
        s.add(JobRun(job=name, session_date=started.astimezone(IST).date(), started_at=started,
                     finished_at=ctx.clock.now(), status=res.status, detail="\n".join(res.notes)[:4000]))
    return res


JOBS: list[tuple[str, dict[str, str]]] = [
    ("pre_session", {"hour": "8", "minute": "45"}),
    ("submit_orders", {"hour": "9", "minute": "20"}),
    ("expire_orders", {"hour": "15", "minute": "25"}),
    ("post_close", {"hour": "15", "minute": "50"}),
]


def build_scheduler(ctx: AppContext, engine: ForwardEngine) -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=IST, job_defaults={"coalesce": True, "max_instances": 1,
                                                             "misfire_grace_time": 600})
    for name, cron in JOBS:
        fn = getattr(engine, name)
        sched.add_job(run_job, CronTrigger(day_of_week="mon-sun", timezone=IST, **cron),
                      args=[ctx, name, fn], id=name, name=name)
    sched.add_job(run_job, IntervalTrigger(seconds=ctx.settings.monitor_interval_s, timezone=IST),
                  args=[ctx, "monitor", engine.monitor, False], id="monitor", name="monitor")
    sched.add_job(run_job, CronTrigger(hour="23", minute="30", timezone=IST),
                  args=[ctx, "housekeeping", engine.housekeeping], id="housekeeping", name="housekeeping")
    sched.add_job(run_job, CronTrigger(hour="8,17", minute="10", timezone=IST),
                  args=[ctx, "research_fetch", lambda: _research_fetch(ctx)], id="research_fetch",
                  name="research_fetch")
    return sched


def _research_fetch(ctx: AppContext) -> JobResult:
    """Fetches only sources a human enabled. Never affects trading."""
    from .research.fetch import fetch_enabled

    with ctx.db.session() as s:
        out = fetch_enabled(s, ctx.clock.now())
    if not out:
        return JobResult("SKIPPED", ["no automated research sources enabled"])
    return JobResult("OK", [f"{k}: {v}" for k, v in out])


def next_runs(sched: BackgroundScheduler) -> list[tuple[str, str]]:
    out = []
    for j in sched.get_jobs():
        nrt = j.next_run_time
        out.append((j.id, nrt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST") if nrt else "paused"))
    return out


def today_ist(ctx: AppContext) -> date:
    return ctx.clock.now().astimezone(IST).date()
