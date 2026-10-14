"""MOCK market data: deterministic synthetic prices. NOT real market data.

Used for development, demos and tests when no Kite Connect data subscription
is available. Everything it produces is tagged source="MOCK", and an official
experiment cannot be started on it (enforced by a DB constraint and readiness).

It can also simulate failures (disconnects, stale quotes, auth expiry) for tests.
"""

from __future__ import annotations

import hashlib
import math
import random
from datetime import date, datetime, time, timedelta

from ..calendar import TradingCalendar
from ..clock import IST, Clock
from ..money import Paise, round_to_tick
from .base import AuthError, Bar, DepthLevel, MarketDataError, Quote, Universe

EPOCH = date(2012, 1, 2)
OPEN_T = time(9, 15)
CLOSE_T = time(15, 30)
CLOSE_PUBLISHED_T = time(15, 35)


def _seed(*parts: object) -> int:
    return int.from_bytes(hashlib.sha256("|".join(map(str, parts)).encode()).digest()[:8], "big")


class MockMarketData:
    source = "MOCK"

    def __init__(self, universe: Universe, clock: Clock, calendar: TradingCalendar | None = None) -> None:
        self.universe = universe
        self.clock = clock
        self.calendar = calendar
        self._series: dict[str, list[Bar]] = {}
        # failure injection (tests / drills)
        self.disconnected = False
        self.auth_expired = False
        self.stale_by: timedelta | None = None
        self.no_depth = False

    @property
    def is_live_data(self) -> bool:
        return False

    def auth_status(self) -> tuple[bool, str]:
        if self.auth_expired:
            return False, "MOCK: simulated session expiry"
        return True, "MOCK provider (no broker login needed)"

    # ------------------------------------------------------------ calendar
    def _is_session(self, d: date) -> bool:
        if d.weekday() >= 5:
            return False
        if self.calendar and self.calendar.covers(d):
            return self.calendar.is_regular_session(d)
        return True

    # ------------------------------------------------------------- series
    def _build(self, symbol: str, through: date) -> list[Bar]:
        inst = self.universe.get(symbol)
        series = self._series.get(symbol, [])
        if series and series[-1].day >= through:
            return series
        rng = random.Random(_seed("series", symbol))
        price = float(inst.mock_start_price)
        d = EPOCH
        out: list[Bar] = []
        mu, sig = inst.mock_annual_drift / 252, inst.mock_annual_vol / math.sqrt(252)
        while d <= through:
            if self._is_session(d):
                z = rng.gauss(0, 1)
                if rng.random() < 0.02:
                    z *= 3.0  # occasional shock days (fat tails)
                overnight = rng.gauss(0, sig * 0.35)
                o = price * math.exp(overnight)
                c = price * math.exp(mu - 0.5 * sig * sig + sig * z)
                hi = max(o, c) * (1 + abs(rng.gauss(0, sig * 0.4)))
                lo = min(o, c) * (1 - abs(rng.gauss(0, sig * 0.4)))
                vol = int(400_000 * math.exp(rng.gauss(0, 0.4)))
                t = inst.tick_paise
                ob, cb = round_to_tick(int(o), t, "nearest"), round_to_tick(int(c), t, "nearest")
                hb = max(round_to_tick(int(hi), t, "up"), ob, cb)
                lb = min(round_to_tick(int(lo), t, "down"), ob, cb)
                out.append(Bar(symbol, d, ob, hb, lb, cb, vol, "MOCK"))
                price = c
            d += timedelta(days=1)
        self._series[symbol] = out
        return out

    def _bar_on(self, symbol: str, d: date) -> Bar | None:
        for b in reversed(self._build(symbol, d)):
            if b.day == d:
                return b
            if b.day < d:
                return None
        return None

    def _prev_close(self, symbol: str, d: date) -> Paise:
        for b in reversed(self._build(symbol, d)):
            if b.day < d:
                return b.close
        return self.universe.get(symbol).mock_start_price

    # -------------------------------------------------------------- API
    def daily_bars(self, symbol: str, start: date, end: date) -> list[Bar]:
        if self.disconnected:
            raise MarketDataError("MOCK: simulated disconnect")
        now = self.clock.now().astimezone(IST)
        last_complete = now.date() if now.time() >= CLOSE_PUBLISHED_T else now.date() - timedelta(days=1)
        end = min(end, last_complete)
        return [b for b in self._build(symbol, end) if start <= b.day <= end]

    def quotes(self, symbols: list[str]) -> dict[str, Quote]:
        if self.disconnected:
            raise MarketDataError("MOCK: simulated disconnect")
        if self.auth_expired:
            raise AuthError("MOCK: simulated session expiry")
        now = self.clock.now().astimezone(IST)
        return {s: self._quote(s, now) for s in symbols}

    def _quote(self, symbol: str, now: datetime) -> Quote:
        inst = self.universe.get(symbol)
        d = now.date()
        bar = self._bar_on(symbol, d) if self._is_session(d) else None
        prev_close = self._prev_close(symbol, d)
        open_dt = datetime.combine(d, OPEN_T, IST)
        close_dt = datetime.combine(d, CLOSE_T, IST)
        if bar is None or now < open_dt:
            ltp, vol, day_open = prev_close, 0, prev_close
            last_trade = datetime.combine(d - timedelta(days=1), CLOSE_T, IST)
        elif now >= close_dt:
            ltp, vol, day_open, last_trade = bar.close, bar.volume, bar.open, close_dt
        else:
            f = (now - open_dt).total_seconds() / (close_dt - open_dt).total_seconds()
            rng = random.Random(_seed("intraday", symbol, d, now.replace(second=0, microsecond=0)))
            bridge = rng.gauss(0, 1) * math.sqrt(f * (1 - f)) * (bar.high - bar.low) * 0.5
            p = bar.open + (bar.close - bar.open) * f + bridge
            p = min(max(p, bar.low), bar.high)
            ltp = round_to_tick(int(p), inst.tick_paise, "nearest")
            vol, day_open, last_trade = int(bar.volume * f), bar.open, now
        t = inst.tick_paise
        rng = random.Random(_seed("book", symbol, now.replace(second=0, microsecond=0)))
        half = max(1, int(ltp * 0.0002) // t) * t  # ~2 bps half-spread, at least one tick
        bids = tuple(DepthLevel(ltp - half - i * t, rng.randint(200, 4000)) for i in range(5))
        asks = tuple(DepthLevel(ltp + half + i * t, rng.randint(200, 4000)) for i in range(5))
        if self.no_depth:
            bids, asks = (), ()
        qts = now - self.stale_by if self.stale_by else now
        lt = last_trade - self.stale_by if self.stale_by else last_trade
        return Quote(
            symbol=symbol, source="MOCK", observed_at=now, quote_ts=qts, last_trade_ts=lt,
            ltp=ltp, prev_close=prev_close, day_open=day_open, volume=vol, bids=bids, asks=asks,
            lower_band=round_to_tick(int(prev_close * 0.8), t, "up"),
            upper_band=round_to_tick(int(prev_close * 1.2), t, "down"),
        )
