"""ETF trend + momentum rotation, v1. Pure functions: no I/O, no clock, no randomness.

Look-ahead protection: `compute_signal` refuses any bar dated after
`data_through`, and the signal is stored with valid_for > data_through
(also enforced by a database CHECK constraint).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from ..marketdata.base import Bar
from .spec import StrategyParams


class LookAheadError(RuntimeError):
    pass


@dataclass(frozen=True)
class AdjEvent:
    """Price adjustment event for signal calculation (from corporate actions)."""

    ex_date: date
    factor: float  # multiply prices BEFORE ex_date by this factor


@dataclass
class SignalResult:
    data_through: date
    rebalance_day: bool
    ranking: list[dict[str, Any]] = field(default_factory=list)
    selected: list[str] = field(default_factory=list)
    exits: list[dict[str, str]] = field(default_factory=list)
    entries: list[dict[str, str]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        return {
            "data_through": self.data_through.isoformat(), "rebalance_day": self.rebalance_day,
            "ranking": self.ranking, "selected": self.selected, "exits": self.exits,
            "entries": self.entries, "notes": self.notes,
        }


def adjusted_closes(bars: list[Bar], events: list[AdjEvent]) -> list[float]:
    out = []
    for b in bars:
        f = 1.0
        for e in events:
            if b.day < e.ex_date:
                f *= e.factor
        out.append(b.close * f)
    return out


def compute_signal(
    params: StrategyParams,
    bars: dict[str, list[Bar]],
    adj: dict[str, list[AdjEvent]],
    data_through: date,
    held: set[str],
    rebalance_day: bool,
) -> SignalResult:
    res = SignalResult(data_through=data_through, rebalance_day=rebalance_day)
    eligible: list[tuple[float, str]] = []
    trend_ok: dict[str, bool] = {}
    for sym in sorted(bars):
        series = sorted(bars[sym], key=lambda b: b.day)
        if any(b.day > data_through for b in series):
            raise LookAheadError(f"{sym}: bar after data_through {data_through}")
        events = [e for e in adj.get(sym, []) if e.ex_date <= data_through]
        row: dict[str, Any] = {"symbol": sym}
        if len(series) < params.min_history:
            row.update(eligible=False, note=f"insufficient history ({len(series)}/{params.min_history} sessions)")
            res.ranking.append(row)
            continue
        if series[-1].day != data_through:
            row.update(eligible=False, note=f"no bar for {data_through} (last {series[-1].day}); data gap")
            res.ranking.append(row)
            continue
        px = adjusted_closes(series, events)
        last = px[-1]
        mom = last / px[-1 - params.momentum_lookback] - 1
        sma = sum(px[-params.sma_window:]) / params.sma_window
        ok = last > sma
        trend_ok[sym] = ok
        elig = ok and mom > 0
        row.update(close=round(last / 100, 2), momentum=round(mom, 5), sma=round(sma / 100, 2),
                   above_trend=ok, eligible=elig,
                   note=("eligible" if elig else ("below trend average" if not ok else "momentum not positive")))
        res.ranking.append(row)
        if elig:
            eligible.append((mom, sym))
    eligible.sort(reverse=True)
    res.ranking.sort(key=lambda r: -float(r.get("momentum", -9)))

    if rebalance_day:
        res.selected = [s for _, s in eligible[: params.top_k]]
        for s in sorted(held):
            if s not in res.selected:
                why = "closed below 100-session average" if not trend_ok.get(s, False) else "no longer in top selection at rebalance"
                if s not in trend_ok:
                    why = "no valid data for held ETF; exiting conservatively"
                res.exits.append({"symbol": s, "reason": why})
        for s in res.selected:
            if s not in held:
                mom = next(m for m, x in eligible if x == s)
                res.entries.append({"symbol": s, "reason": f"rank {res.selected.index(s) + 1}: 63-session change {mom:+.2%}, above 100-session average"})
    else:
        res.selected = sorted(held)
        for s in sorted(held):
            if s in trend_ok and not trend_ok[s]:
                res.exits.append({"symbol": s, "reason": "closed below 100-session average (daily trend check)"})
        res.notes.append("not a rebalance session: no new entries, only trend exits")
    if rebalance_day and not res.selected:
        res.notes.append("no ETF qualifies: strategy holds cash")
    return res


# ------------------------------------------------------------------ sizing
# Kept in this module so sizing rules are covered by the strategy fingerprint.


def buy_limit(ref_price: int, buffer_bps: int, tick: int) -> int:
    raw = ref_price + ref_price * buffer_bps // 10_000
    return -(-raw // tick) * tick  # round UP to tick


def sell_limit(ref_price: int, buffer_bps: int, tick: int, lower_band: int | None) -> int:
    raw = ref_price - ref_price * buffer_bps // 10_000
    px = (raw // tick) * tick  # round DOWN to tick
    if lower_band is not None:
        px = max(px, lower_band)
    return max(px, tick)


def entry_quantity(slot_budget: int, limit: int, est_charge_rate_bps: int = 20) -> int:
    """Whole units affordable within slot_budget after estimated buy charges.

    With small capital, rounding down to whole units leaves cash unused. For a
    Rs6,250 slot and an ETF near Rs800 that can be up to ~Rs800 (13%) idle.
    """
    if slot_budget <= 0 or limit <= 0:
        return 0
    per_unit = limit + limit * est_charge_rate_bps // 10_000 + 1
    return slot_budget // per_unit


def adjustment_events(
    actions: list[tuple[str, date, int, int, int]], closes_before: dict[date, int]
) -> list[AdjEvent]:
    """actions: (kind, ex_date, ratio_new, ratio_old, dividend_paise). closes_before maps
    ex_date -> close on the session before ex_date (for dividend adjustment)."""
    out = []
    for kind, ex, rn, ro, dps in actions:
        if kind in ("SPLIT", "BONUS") and rn > 0:
            out.append(AdjEvent(ex, ro / rn))
        elif kind == "DIVIDEND" and dps > 0 and closes_before.get(ex):
            out.append(AdjEvent(ex, 1 - dps / closes_before[ex]))
    return out
