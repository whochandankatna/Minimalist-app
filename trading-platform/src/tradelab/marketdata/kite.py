"""Read-only Zerodha Kite Connect client (market data + login handshake only).

SAFETY: this app does not use the official Kite Python SDK and contains no order code.
Every request goes through `_request`, which checks (method, path) against
ALLOWED_ENDPOINTS *before* any network I/O. Order, GTT, margin, funds,
portfolio-conversion and mutual-fund endpoints are not in the allowlist, so
they cannot be reached from this code. Tests assert this.

Verified against https://kite.trade/docs/connect/v3/ on 2026-10-14:
- No sandbox exists; this client only ever talks to production read endpoints.
- Market data (quotes, historical candles) needs the paid Connect plan.
- access_token expires at 06:00 IST the next day; a 403 TokenException means
  the session expired or was invalidated and the user must log in again.
- Rate limits: quote 1 req/s, historical 3 req/s.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import threading
import time as _time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from ..clock import IST, Clock
from ..money import Paise, rupees
from .base import AuthError, Bar, DepthLevel, MarketDataError, Quote

BASE_URL = "https://api.kite.trade"
LOGIN_URL = "https://kite.zerodha.com/connect/login?v=3&api_key={api_key}"

# (METHOD, regex on path). Nothing else is reachable.
ALLOWED_ENDPOINTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GET", re.compile(r"^/quote$")),
    ("GET", re.compile(r"^/quote/ohlc$")),
    ("GET", re.compile(r"^/quote/ltp$")),
    ("GET", re.compile(r"^/instruments/NSE$")),
    ("GET", re.compile(r"^/instruments/historical/\d+/day$")),
    ("GET", re.compile(r"^/user/profile$")),
    ("POST", re.compile(r"^/session/token$")),  # exchange request_token -> access_token
    ("DELETE", re.compile(r"^/session/token$")),  # logout
)


class ForbiddenEndpointError(RuntimeError):
    """Raised for any endpoint outside the read-only allowlist. Never caught silently."""


def check_allowed(method: str, path: str) -> None:
    for m, rx in ALLOWED_ENDPOINTS:
        if m == method.upper() and rx.match(path):
            return
    raise ForbiddenEndpointError(f"Blocked by read-only allowlist: {method} {path}")


def checksum(api_key: str, request_token: str, api_secret: str) -> str:
    return hashlib.sha256(f"{api_key}{request_token}{api_secret}".encode()).hexdigest()


def next_expiry(created: datetime) -> datetime:
    """Kite tokens expire at 06:00 IST on the day after creation (or same day if created before 06:00)."""
    c = created.astimezone(IST)
    six = c.replace(hour=6, minute=0, second=0, microsecond=0)
    return six if c < six else six + timedelta(days=1)


def _parse_ist(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.replace("T", " ")[:19]
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)


class _Throttle:
    def __init__(self, per_second: float) -> None:
        self.min_gap = 1.0 / per_second
        self.last = 0.0
        self.lock = threading.Lock()

    def wait(self) -> None:
        with self.lock:
            gap = _time.monotonic() - self.last
            if gap < self.min_gap:
                _time.sleep(self.min_gap - gap)
            self.last = _time.monotonic()


class KiteReadOnlyClient:
    def __init__(
        self,
        api_key: str,
        token_provider: Callable[[], str | None],
        clock: Clock,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self._token_provider = token_provider
        self.clock = clock
        self._http = httpx.Client(base_url=BASE_URL, timeout=10.0, transport=transport)
        self._quote_throttle = _Throttle(1.0)
        self._hist_throttle = _Throttle(3.0)

    def _request(
        self, method: str, path: str, *, params: Any = None, data: Any = None, auth: bool = True
    ) -> httpx.Response:
        check_allowed(method, path)  # MUST stay first: no I/O before the allowlist check
        headers = {"X-Kite-Version": "3"}
        if auth:
            token = self._token_provider()
            if not token:
                raise AuthError("No valid Kite session. Log in via the dashboard.")
            headers["Authorization"] = f"token {self.api_key}:{token}"
        try:
            r = self._http.request(method, path, params=params, data=data, headers=headers)
        except httpx.HTTPError as e:
            raise MarketDataError(f"Kite network error: {type(e).__name__}") from None
        if r.status_code == 403:
            raise AuthError("Kite session expired or invalidated (403). Log in again.")
        if r.status_code == 429:
            raise MarketDataError("Kite rate limit hit (429)")
        if r.status_code >= 400:
            raise MarketDataError(f"Kite error HTTP {r.status_code}")
        return r

    # --------------------------------------------------------- session
    def exchange_request_token(self, request_token: str, api_secret: str) -> dict[str, Any]:
        r = self._request(
            "POST", "/session/token", auth=False,
            data={"api_key": self.api_key, "request_token": request_token,
                  "checksum": checksum(self.api_key, request_token, api_secret)},
        )
        data: dict[str, Any] = r.json()["data"]
        return data

    def profile(self) -> dict[str, Any]:
        out: dict[str, Any] = self._request("GET", "/user/profile").json()["data"]
        return out

    # ------------------------------------------------------- market data
    def quote(self, instruments: list[str]) -> dict[str, Any]:
        self._quote_throttle.wait()
        out: dict[str, Any] = self._request("GET", "/quote", params=[("i", i) for i in instruments]).json()["data"]
        return out

    def instruments_nse(self) -> list[dict[str, str]]:
        r = self._request("GET", "/instruments/NSE")
        return list(csv.DictReader(io.StringIO(r.text)))

    def historical_day(self, instrument_token: int, start: date, end: date) -> list[list[Any]]:
        self._hist_throttle.wait()
        r = self._request(
            "GET", f"/instruments/historical/{instrument_token}/day",
            params={"from": f"{start.isoformat()} 00:00:00", "to": f"{end.isoformat()} 23:59:59"},
        )
        candles: list[list[Any]] = r.json()["data"]["candles"]
        return candles


class KiteMarketData:
    """MarketDataProvider backed by Kite Connect (requires the paid Connect plan)."""

    source = "KITE"

    def __init__(self, client: KiteReadOnlyClient, clock: Clock) -> None:
        self.client = client
        self.clock = clock
        self._tokens: dict[str, int] = {}

    @property
    def is_live_data(self) -> bool:
        return True

    def auth_status(self) -> tuple[bool, str]:
        try:
            self.client.profile()
            return True, "Kite session valid"
        except AuthError as e:
            return False, str(e)
        except MarketDataError as e:
            return False, f"Kite unreachable: {e}"

    def quotes(self, symbols: list[str]) -> dict[str, Quote]:
        raw = self.client.quote([f"NSE:{s}" for s in symbols])
        now = self.clock.now()
        out: dict[str, Quote] = {}
        for s in symbols:
            q = raw.get(f"NSE:{s}")
            if q is None:  # Kite omits unknown instruments
                continue
            depth = q.get("depth") or {}
            bids = tuple(DepthLevel(rupees(str(l["price"])), int(l["quantity"]))
                         for l in depth.get("buy", []) if l.get("quantity"))
            asks = tuple(DepthLevel(rupees(str(l["price"])), int(l["quantity"]))
                         for l in depth.get("sell", []) if l.get("quantity"))
            ohlc = q.get("ohlc") or {}
            out[s] = Quote(
                symbol=s, source="KITE", observed_at=now,
                quote_ts=_parse_ist(q.get("timestamp")), last_trade_ts=_parse_ist(q.get("last_trade_time")),
                ltp=rupees(str(q["last_price"])), prev_close=rupees(str(ohlc.get("close", 0))),
                day_open=rupees(str(ohlc.get("open", 0))), volume=int(q.get("volume") or 0),
                bids=bids, asks=asks,
                lower_band=rupees(str(q["lower_circuit_limit"])) if q.get("lower_circuit_limit") else None,
                upper_band=rupees(str(q["upper_circuit_limit"])) if q.get("upper_circuit_limit") else None,
            )
        return out

    def _token(self, symbol: str) -> int:
        if not self._tokens:
            for row in self.client.instruments_nse():
                if row.get("segment") == "NSE" and row.get("exchange") == "NSE":
                    self._tokens[row["tradingsymbol"]] = int(row["instrument_token"])
        if symbol not in self._tokens:
            raise MarketDataError(f"{symbol} not found in Kite NSE instrument list")
        return self._tokens[symbol]

    def daily_bars(self, symbol: str, start: date, end: date) -> list[Bar]:
        now = self.clock.now().astimezone(IST)
        last_complete = now.date() if now.hour * 60 + now.minute >= 15 * 60 + 35 else now.date() - timedelta(days=1)
        end = min(end, last_complete)
        if end < start:
            return []
        tok = self._token(symbol)
        bars: list[Bar] = []
        # Kite limits day-candle requests to ~2000 days per call.
        chunk = start
        while chunk <= end:
            chunk_end = min(end, chunk + timedelta(days=1900))
            for c in self.client.historical_day(tok, chunk, chunk_end):
                ts = _parse_ist(str(c[0]))
                assert ts is not None
                p: list[Paise] = [rupees(str(x)) for x in c[1:5]]
                bars.append(Bar(symbol, ts.date(), p[0], p[1], p[2], p[3], int(c[5]), "KITE"))
            chunk = chunk_end + timedelta(days=1)
        return [b for b in bars if b.day <= end]
