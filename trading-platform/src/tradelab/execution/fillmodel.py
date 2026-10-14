"""Conservative fill models for simulated LIMIT orders.

QuoteFillModel (forward paper trading, uses live quote + market depth):
  * An order is only eligible after a simulated latency.
  * Stale quotes never produce fills.
  * BUY fills only against displayed asks at or below the limit; SELL only
    against bids at or above it. We take at most `participation` of the
    displayed quantity per poll, so large orders fill partially over time.
  * Fill price = volume-weighted level price plus adverse slippage, capped at
    the limit (a limit order never fills worse than its limit).
  * Without depth data we fill at most `no_depth_fraction` of the remaining
    quantity per poll at a synthetic ask/bid of LTP +/- half-spread.

BarFillModel (backtests on daily OHLCV bars, where no quotes exist):
  * BUY: if the day opens at/below the limit we fill at the open plus slippage
    (gaps work for or against us realistically). If it only trades *through*
    the limit intraday (low at least one tick below), fill at the limit.
    Merely touching the limit (low == limit) is NOT a fill.
  * SELL: mirror image.
  * Quantity capped at `participation_of_volume` of the day's volume.
  * One evaluation per day; any remainder expires at the close.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..marketdata.base import Bar, Quote
from ..money import Paise, round_to_tick


@dataclass(frozen=True)
class FillDecision:
    qty: int
    price: Paise
    ref: str


@dataclass(frozen=True)
class OrderView:
    side: str
    remaining: int
    limit: Paise
    eligible_at: datetime


@dataclass
class QuoteFillModel:
    participation: float = 0.25
    slippage_bps: int = 5
    no_depth_fraction: float = 0.5
    synthetic_half_spread_bps: int = 10

    def decide(self, o: OrderView, q: Quote, now: datetime, stale: bool, tick: Paise) -> tuple[FillDecision | None, str]:
        if stale:
            return None, "stale quote: no fill"
        if now < o.eligible_at:
            return None, "latency: order not yet at exchange"
        levels = q.asks if o.side == "BUY" else q.bids
        if not levels:
            half = max(tick, q.ltp * self.synthetic_half_spread_bps // 10_000)
            px = q.ltp + half if o.side == "BUY" else q.ltp - half
            ok = px <= o.limit if o.side == "BUY" else px >= o.limit
            if not ok:
                return None, "no depth; synthetic price outside limit"
            qty = max(1, int(o.remaining * self.no_depth_fraction))
            price = self._slip(o, px, tick)
            return FillDecision(min(qty, o.remaining), price, f"no-depth synthetic {px} ltp={q.ltp}"), "filled"
        take_qty = 0
        notional = 0
        for lv in levels:
            if (o.side == "BUY" and lv.price > o.limit) or (o.side == "SELL" and lv.price < o.limit):
                break
            avail = int(lv.qty * self.participation)
            t = min(avail, o.remaining - take_qty)
            if t <= 0:
                continue
            take_qty += t
            notional += t * lv.price
            if take_qty >= o.remaining:
                break
        if take_qty == 0:
            return None, "no displayed liquidity within limit"
        vwap = round(notional / take_qty)
        price = self._slip(o, vwap, tick)
        return FillDecision(take_qty, price, f"depth vwap {vwap} best={levels[0].price} qts={q.quote_ts}"), "filled"

    def _slip(self, o: OrderView, px: Paise, tick: Paise) -> Paise:
        adj = px * self.slippage_bps // 10_000
        if o.side == "BUY":
            return min(o.limit, round_to_tick(px + adj, tick, "up"))
        return max(o.limit, round_to_tick(px - adj, tick, "down"))


@dataclass
class BarFillModel:
    participation_of_volume: float = 0.01
    slippage_bps: int = 10

    def decide(self, o: OrderView, bar: Bar, tick: Paise) -> tuple[FillDecision | None, str]:
        cap = int(bar.volume * self.participation_of_volume)
        qty = min(o.remaining, cap)
        if qty <= 0:
            return None, "volume cap: no liquidity"
        slip = bar.open * self.slippage_bps // 10_000
        if o.side == "BUY":
            if bar.open <= o.limit:
                px = min(o.limit, round_to_tick(bar.open + slip, tick, "up"))
                return FillDecision(qty, px, f"open {bar.open} <= limit"), "filled at open"
            if bar.low <= o.limit - tick:
                return FillDecision(qty, o.limit, f"low {bar.low} traded through limit"), "filled at limit"
            return None, "price never traded through limit"
        if bar.open >= o.limit:
            px = max(o.limit, round_to_tick(bar.open - slip, tick, "down"))
            return FillDecision(qty, px, f"open {bar.open} >= limit"), "filled at open"
        if bar.high >= o.limit + tick:
            return FillDecision(qty, o.limit, f"high {bar.high} traded through limit"), "filled at limit"
        return None, "price never traded through limit"
