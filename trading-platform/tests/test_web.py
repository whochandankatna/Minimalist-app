"""Dashboard rendering, auth, CSRF, reports and secret hygiene."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tradelab.clock import IST
from tradelab.context import AppContext
from tradelab.experiment.engine import ForwardEngine
from tradelab.web.app import create_app, csrf_token

from .conftest import run_day, start_demo

SECRET = "sup3r-s3cret-kite-api-secret"
PASSWORD = "dashboard-pass-123"


@pytest.fixture
def client(make_ctx: Callable[..., AppContext]) -> TestClient:
    ctx = make_ctx(datetime(2026, 10, 13, 18, 0, tzinfo=IST), dashboard_password=SecretStr(PASSWORD),
                   kite_api_key="key123", kite_api_secret=SecretStr(SECRET))
    start_demo(ctx)
    eng = ForwardEngine(ctx)
    for d in (date(2026, 10, 14), date(2026, 10, 15), date(2026, 10, 16)):
        run_day(ctx, eng, d, monitor_every=60)
    app = create_app(ctx, start_scheduler=False)
    c = TestClient(app)
    c.__enter__()
    return c


AUTH = ("admin", PASSWORD)


def test_auth_required(client: TestClient) -> None:
    assert client.get("/").status_code == 401
    assert client.get("/", auth=("admin", "wrong")).status_code == 401
    assert client.get("/healthz").status_code == 200  # liveness probe is public but reveals nothing


@pytest.mark.parametrize("path", ["/", "/trades", "/experiment", "/experiment?check=1", "/research", "/costs",
                                  "/backtests", "/health"])
def test_pages_render_without_secrets(client: TestClient, path: str) -> None:
    r = client.get(path, auth=AUTH)
    assert r.status_code == 200, r.text[:500]
    assert SECRET not in r.text and PASSWORD not in r.text
    assert "PAPER TRADING ONLY" in r.text
    assert "MOCK DATA" in r.text


def test_reports_download(client: TestClient) -> None:
    for k in ("trades", "orders", "ledger", "sessions", "audit", "research"):
        r = client.get(f"/reports/{k}.csv", auth=AUTH)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        assert SECRET not in r.text
    assert "session_no" in client.get("/reports/sessions.csv", auth=AUTH).text


def test_controls_need_csrf_and_are_audited(client: TestClient) -> None:
    r = client.post("/controls/pause", data={"exp_id": 1, "csrf": "bad", "reason": "x"}, auth=AUTH)
    assert r.status_code == 400
    r = client.post("/controls/pause", data={"exp_id": 1, "csrf": csrf_token("admin"), "reason": "holiday"},
                    auth=AUTH, follow_redirects=False)
    assert r.status_code == 303
    page = client.get("/", auth=AUTH).text
    assert "New entries paused" in page
    audit = client.get("/reports/audit.csv", auth=AUTH).text
    assert "entries.paused" in audit and "user:admin" in audit
    r = client.post("/controls/liquidate", data={"exp_id": 1, "csrf": csrf_token("admin"), "reason": "x",
                                                 "confirm": "nope"}, auth=AUTH)
    assert r.status_code == 400


def test_no_live_order_routes(client: TestClient) -> None:
    paths = {getattr(r, "path", "") for r in client.app.routes}  # type: ignore[attr-defined]
    assert not any("order" in p and "report" not in p for p in paths)
