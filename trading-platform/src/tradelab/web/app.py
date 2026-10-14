"""FastAPI dashboard.

Security:
- HTTP Basic auth on everything except /healthz. Without a configured password
  the app only answers requests from localhost.
- POST controls need a CSRF token tied to this server process.
- No route ever returns the Kite API secret, access token or dashboard password.
- There is no route that can place, modify or cancel a real order.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import logging
import secrets
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import money
from ..clock import IST, to_ist
from ..context import AppContext, build_context
from ..experiment import controls
from ..experiment.engine import ForwardEngine
from ..experiment.lifecycle import readiness
from ..models import (
    AlertDraft,
    AuditLog,
    Experiment,
    ExperimentSession,
    Fill,
    LedgerEntry,
    Order,
    ResearchItem,
    Review,
)
from ..ops.audit import audit
from . import views

log = logging.getLogger("tradelab.web")
HERE = Path(__file__).parent
_basic = HTTPBasic(auto_error=False)
_CSRF_SECRET = secrets.token_bytes(32)


def csrf_token(user: str) -> str:
    return hmac.new(_CSRF_SECRET, f"csrf:{user}".encode(), hashlib.sha256).hexdigest()


def create_app(ctx: AppContext | None = None, start_scheduler: bool | None = None) -> FastAPI:
    holder: dict[str, Any] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        c = ctx or build_context()
        holder["ctx"] = c
        engine = ForwardEngine(c)
        holder["engine"] = engine
        from ..research.store import seed_sources

        with c.db.session() as s:
            seed_sources(s)
        run_sched = c.settings.scheduler_enabled if start_scheduler is None else start_scheduler
        if run_sched:
            from ..scheduler import build_scheduler, run_job

            run_job(c, "recover", engine.recover)
            sched = build_scheduler(c, engine)
            sched.start()
            holder["sched"] = sched
        yield
        if "sched" in holder:
            holder["sched"].shutdown(wait=False)

    app = FastAPI(title="tradelab (PAPER TRADING ONLY)", lifespan=lifespan, docs_url=None, redoc_url=None,
                  openapi_url=None)
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    tpl = Jinja2Templates(directory=HERE / "templates")
    tpl.env.globals.update(inr=money.fmt_inr, pct=money.fmt_pct, fmt_dt=views.fmt_dt, fmt_d=views.fmt_d,
                           ago=views.ago, json=json)

    def get_ctx() -> AppContext:
        c: AppContext = holder["ctx"]
        return c

    def db(c: AppContext = Depends(get_ctx)) -> Iterator[Session]:
        with c.db.session() as s:
            yield s

    def user(request: Request, creds: HTTPBasicCredentials | None = Depends(_basic),
             c: AppContext = Depends(get_ctx)) -> str:
        pw = c.settings.dashboard_password
        if pw is None:
            host = request.client.host if request.client else ""
            if host not in ("127.0.0.1", "::1", "localhost", "testclient"):
                raise HTTPException(403, "Dashboard password not configured; only localhost access allowed.")
            return "local"
        ok = creds is not None and secrets.compare_digest(creds.username.encode(), c.settings.dashboard_user.encode()) \
            and secrets.compare_digest(creds.password.encode(), pw.get_secret_value().encode())
        if not ok:
            raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Basic"})
        assert creds is not None
        return creds.username

    def page(request: Request, name: str, s: Session, c: AppContext, u: str, **kw: Any) -> HTMLResponse:
        base = {"request": request, "banner": views.status_banner(c, s), "csrf": csrf_token(u), "user": u,
                "experiments": views.experiments_list(s), "money": money}
        base.update(kw)
        return tpl.TemplateResponse(request, name, base)

    def check_csrf(token: str, u: str) -> None:
        if not hmac.compare_digest(token, csrf_token(u)):
            raise HTTPException(400, "invalid CSRF token (reload the page)")

    # -------------------------------------------------------------- pages
    @app.get("/", response_class=HTMLResponse)
    def home(request: Request, exp: int | None = None, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
             u: str = Depends(user)) -> HTMLResponse:
        e = views.pick_experiment(s, exp)
        data = views.overview(c, s, e) if e else None
        return page(request, "overview.html", s, c, u, e=e, d=data, active="overview")

    @app.get("/trades", response_class=HTMLResponse)
    def trades(request: Request, exp: int | None = None, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
               u: str = Depends(user)) -> HTMLResponse:
        e = views.pick_experiment(s, exp)
        return page(request, "trades.html", s, c, u, e=e, d=views.orders_view(s, e) if e else None,
                    ov=views.overview(c, s, e) if e else None, active="trades")

    @app.get("/experiment", response_class=HTMLResponse)
    def experiment(request: Request, exp: int | None = None, check: int = 0, s: Session = Depends(db),
                   c: AppContext = Depends(get_ctx), u: str = Depends(user)) -> HTMLResponse:
        e = views.pick_experiment(s, exp)
        checks = readiness(s, e, c) if (e and check) else None
        return page(request, "experiment.html", s, c, u, e=e, d=views.overview(c, s, e) if e else None,
                    checks=checks, spec=c.spec, active="experiment")

    @app.get("/research", response_class=HTMLResponse)
    def research(request: Request, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
                 u: str = Depends(user)) -> HTMLResponse:
        return page(request, "research.html", s, c, u, d=views.research(c, s), symbols=c.universe.symbols,
                    active="research")

    @app.get("/costs", response_class=HTMLResponse)
    def costs(request: Request, exp: int | None = None, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
              u: str = Depends(user)) -> HTMLResponse:
        e = views.pick_experiment(s, exp)
        return page(request, "costs.html", s, c, u, e=e, d=views.costs(c, s, e), fees=c.fees, active="costs")

    @app.get("/backtests", response_class=HTMLResponse)
    def backtests(request: Request, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
                  u: str = Depends(user)) -> HTMLResponse:
        return page(request, "backtests.html", s, c, u, runs=views.backtests(s), active="backtests")

    @app.get("/health", response_class=HTMLResponse)
    def health_page(request: Request, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
                    u: str = Depends(user)) -> HTMLResponse:
        from ..scheduler import next_runs

        nr = next_runs(holder["sched"]) if "sched" in holder else []
        return page(request, "health.html", s, c, u, d=views.health(c, s), next_runs=nr,
                    scheduler_on="sched" in holder, active="health")

    # ------------------------------------------------------------ controls
    @app.post("/controls/{action}")
    def control(action: str, exp_id: int = Form(...), csrf: str = Form(...), reason: str = Form(""),
                confirm: str = Form(""), s: Session = Depends(db), c: AppContext = Depends(get_ctx),
                u: str = Depends(user)) -> RedirectResponse:
        check_csrf(csrf, u)
        e = s.get(Experiment, exp_id)
        if e is None or e.status != "RUNNING":
            raise HTTPException(400, "experiment not running")
        actor = f"user:{u}"
        why = reason.strip() or "(no reason given)"
        if action == "pause":
            controls.pause_entries(s, c, e, actor, why)
        elif action == "resume":
            try:
                controls.resume_entries(s, c, e, actor, why)
            except ValueError as ex:
                raise HTTPException(400, str(ex)) from None
        elif action == "cancel":
            controls.cancel_pending(s, c, e, actor)
        elif action == "liquidate":
            if confirm != "LIQUIDATE":
                raise HTTPException(400, "type LIQUIDATE to confirm")
            controls.request_liquidation(s, c, e, actor, why)
        else:
            raise HTTPException(404, "unknown control")
        return RedirectResponse(f"/?exp={exp_id}", status_code=303)

    @app.post("/reviews/{review_id}/ack")
    def ack_review(review_id: int, csrf: str = Form(...), note: str = Form(""), s: Session = Depends(db),
                   c: AppContext = Depends(get_ctx), u: str = Depends(user)) -> RedirectResponse:
        check_csrf(csrf, u)
        r = s.get(Review, review_id)
        if r is None:
            raise HTTPException(404)
        r.acknowledged_at = c.clock.now()
        r.acknowledged_note = note[:2000]
        audit(s, c.clock.now(), f"user:{u}", "review.acknowledged", {"checkpoint": r.checkpoint, "note": note[:500]},
              r.experiment_id)
        return RedirectResponse(f"/experiment?exp={r.experiment_id}", status_code=303)

    @app.post("/alerts/{alert_id}/dismiss")
    def dismiss_alert(alert_id: int, csrf: str = Form(...), s: Session = Depends(db), c: AppContext = Depends(get_ctx),
                      u: str = Depends(user)) -> RedirectResponse:
        check_csrf(csrf, u)
        a = s.get(AlertDraft, alert_id)
        if a:
            a.status = "DISMISSED"
        return RedirectResponse("/health", status_code=303)

    @app.post("/research/add")
    def research_add(csrf: str = Form(...), source_key: str = Form(...), url: str = Form(...), title: str = Form(...),
                     text: str = Form(""), published_at: str = Form(""), symbols: str = Form(""),
                     event_status: str = Form(""), doc_type: str = Form(""), statement_basis: str = Form("NA"),
                     reporting_period: str = Form(""), units: str = Form(""), facts: str = Form(""),
                     s: Session = Depends(db), c: AppContext = Depends(get_ctx), u: str = Depends(user)) -> RedirectResponse:
        from ..research.store import add_item

        check_csrf(csrf, u)
        pub = None
        if published_at.strip():
            pub = datetime.fromisoformat(published_at.strip())
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=IST)
        ov = {"event_status": event_status or None, "doc_type": doc_type or None, "statement_basis": statement_basis,
              "reporting_period": reporting_period or None, "units": units or None,
              "facts": [f.strip() for f in facts.splitlines() if f.strip()]}
        try:
            item, created = add_item(s, c.clock.now(), source_key, url.strip(), title, text, pub, "MANUAL",
                                     [x.strip().upper() for x in symbols.split(",") if x.strip()], ov)
        except ValueError as ex:
            raise HTTPException(400, str(ex)) from None
        audit(s, c.clock.now(), f"user:{u}", "research.added", {"item": item.id, "url": url, "created": created})
        return RedirectResponse("/research", status_code=303)

    # --------------------------------------------------------- Kite login
    @app.get("/auth/kite/login")
    def kite_login(c: AppContext = Depends(get_ctx), u: str = Depends(user)) -> RedirectResponse:
        from ..marketdata.kite import LOGIN_URL

        if not c.settings.kite_configured:
            raise HTTPException(400, "Kite API key/secret not configured on the server")
        return RedirectResponse(LOGIN_URL.format(api_key=c.settings.kite_api_key))

    @app.get("/auth/kite/callback")
    def kite_callback(request_token: str = "", status: str = "", s: Session = Depends(db),
                      c: AppContext = Depends(get_ctx), u: str = Depends(user)) -> RedirectResponse:
        from ..marketdata.kite import KiteReadOnlyClient
        from ..marketdata.kite_session import store_session

        if status != "success" or not request_token or not c.settings.kite_configured:
            raise HTTPException(400, "Kite login was not successful")
        assert c.settings.kite_api_key and c.settings.kite_api_secret
        client = KiteReadOnlyClient(c.settings.kite_api_key, lambda: None, c.clock)
        data = client.exchange_request_token(request_token, c.settings.kite_api_secret.get_secret_value())
        store_session(s, c.clock.now(), data["access_token"], data.get("user_id", ""))
        audit(s, c.clock.now(), f"user:{u}", "kite.login", {"user_hint": str(data.get("user_id", ""))[:2] + "***"})
        return RedirectResponse("/", status_code=303)

    # ------------------------------------------------------------ reports
    @app.get("/reports/{kind}.csv")
    def report(kind: str, exp: int | None = None, s: Session = Depends(db), c: AppContext = Depends(get_ctx),
               u: str = Depends(user)) -> Response:
        e = views.pick_experiment(s, exp)
        buf = io.StringIO()
        w = csv.writer(buf)
        eid = e.id if e else -1
        if kind == "trades":
            w.writerow(["fill_time_ist", "session", "symbol", "side", "qty", "price_rs", "turnover_rs", "charges_rs",
                        "realised_gross_rs", "order_id", "intent", "reason", "market_ref"])
            orders = {o.id: o for o in s.scalars(select(Order).where(Order.experiment_id == eid))}
            for f in s.scalars(select(Fill).where(Fill.experiment_id == eid).order_by(Fill.ts)):
                o = orders[f.order_id]
                w.writerow([to_ist(f.ts).isoformat(), f.session_date, f.symbol, f.side, f.qty, f.price_paise / 100,
                            f.turnover_paise / 100, f.charges_paise / 100, f.realised_gross_paise / 100, f.order_id,
                            o.intent, o.reason, f.market_ref])
        elif kind == "orders":
            w.writerow(["created_ist", "order_id", "session", "symbol", "side", "qty", "limit_rs", "status", "filled",
                        "avg_fill_rs", "intent", "reason", "reject_reason", "cancel_reason"])
            for o in s.scalars(select(Order).where(Order.experiment_id == eid).order_by(Order.created_at)):
                w.writerow([to_ist(o.created_at).isoformat(), o.id, o.session_date, o.symbol, o.side, o.quantity,
                            o.limit_price_paise / 100, o.status, o.filled_qty, o.avg_fill_price_paise / 100, o.intent,
                            o.reason, o.reject_reason or "", o.cancel_reason or ""])
        elif kind == "ledger":
            w.writerow(["time_ist", "session", "kind", "amount_rs", "symbol", "ref", "memo"])
            for l in s.scalars(select(LedgerEntry).where(LedgerEntry.experiment_id == eid).order_by(LedgerEntry.id)):
                w.writerow([to_ist(l.ts).isoformat(), l.session_date, l.kind, l.amount_paise / 100, l.symbol or "",
                            l.ref or "", l.memo or ""])
        elif kind == "sessions":
            w.writerow(["date", "session_no", "kind", "quality", "cash_rs", "market_value_rs", "trading_equity_rs",
                        "opex_cum_rs", "economic_equity_rs", "setup_cum_rs", "allin_equity_rs", "return_trading",
                        "return_economic", "return_allin", "benchmark_rs", "charges_cum_rs", "notes"])
            for r in s.scalars(select(ExperimentSession).where(ExperimentSession.experiment_id == eid)
                               .order_by(ExperimentSession.session_date)):
                w.writerow([r.session_date, r.session_number or "", r.kind, r.quality, r.cash_paise / 100,
                            r.market_value_paise / 100, r.trading_equity_paise / 100, r.opex_cum_paise / 100,
                            r.economic_equity_paise / 100, r.setup_cum_paise / 100, r.allin_equity_paise / 100,
                            r.return_trading, r.return_economic, r.return_allin, r.benchmark_value_paise / 100,
                            r.charges_cum_paise / 100, r.quality_notes or ""])
        elif kind == "audit":
            w.writerow(["id", "time_ist", "actor", "event", "experiment_id", "details", "hash"])
            for a in s.scalars(select(AuditLog).order_by(AuditLog.id)):
                w.writerow([a.id, to_ist(a.ts).isoformat(), a.actor, a.event, a.experiment_id or "", a.details_json,
                            a.hash])
        elif kind == "research":
            w.writerow(["id", "url", "title", "published", "first_observed", "retrieved", "doc_type", "event_status",
                        "basis", "period", "units", "symbols"])
            for it in s.scalars(select(ResearchItem).order_by(ResearchItem.id)):
                w.writerow([it.id, it.url, it.title, views.fmt_dt(it.published_at), views.fmt_dt(it.first_observed_at),
                            views.fmt_dt(it.retrieved_at), it.doc_type, it.event_status, it.statement_basis,
                            it.reporting_period or "", it.units or "", it.symbols])
        else:
            raise HTTPException(404)
        name = f"{e.code if e else 'none'}-{kind}.csv"
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})

    # ------------------------------------------------------------- health
    @app.get("/healthz")
    def healthz(c: AppContext = Depends(get_ctx)) -> JSONResponse:
        """Unauthenticated liveness probe. Reveals no secrets or positions."""
        try:
            with c.db.session() as s:
                s.execute(select(1))
            db_ok = True
        except Exception:  # noqa: BLE001
            db_ok = False
        return JSONResponse({"ok": db_ok, "db": db_ok, "scheduler": "sched" in holder,
                             "time_ist": c.clock.now().astimezone(IST).isoformat()},
                            status_code=200 if db_ok else 503)

    @app.get("/robots.txt", response_class=PlainTextResponse)
    def robots() -> str:
        return "User-agent: *\nDisallow: /\n"

    return app
