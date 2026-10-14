"""Transaction-charge model for simulated equity-delivery fills.

Rates come from a versioned JSON schedule (config/fees/). The schedule id and
file hash are frozen into each experiment, so charges cannot silently change.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from decimal import Decimal
from pathlib import Path

from .money import Paise, apply_rate, round_to_rupee
from .settings import CONFIG_DIR


@dataclass(frozen=True)
class FeeSchedule:
    id: str
    brokerage_rate: Decimal
    brokerage_cap_paise: Paise
    stt_rate_buy: Decimal
    stt_rate_sell: Decimal
    stt_round_to_rupee: bool
    exchange_txn_rate: Decimal
    sebi_rate: Decimal
    ipft_rate: Decimal
    stamp_rate_buy: Decimal
    gst_rate: Decimal
    dp_charge_per_scrip_sell_day_paise: Paise
    source_url: str
    retrieved: str
    file_sha256: str

    @classmethod
    def load(cls, schedule_id: str = "zerodha_equity_delivery_v1", directory: Path | None = None) -> "FeeSchedule":
        p = (directory or CONFIG_DIR / "fees") / f"{schedule_id}.json"
        raw = p.read_bytes()
        d = json.loads(raw)
        return cls(
            id=d["id"],
            brokerage_rate=Decimal(d["brokerage_rate"]),
            brokerage_cap_paise=int(d["brokerage_cap_paise"]),
            stt_rate_buy=Decimal(d["stt_rate_buy"]),
            stt_rate_sell=Decimal(d["stt_rate_sell"]),
            stt_round_to_rupee=bool(d["stt_round_to_rupee"]),
            exchange_txn_rate=Decimal(d["exchange_txn_rate"]),
            sebi_rate=Decimal(d["sebi_rate"]),
            ipft_rate=Decimal(d["ipft_rate"]),
            stamp_rate_buy=Decimal(d["stamp_rate_buy"]),
            gst_rate=Decimal(d["gst_rate"]),
            dp_charge_per_scrip_sell_day_paise=int(d["dp_charge_per_scrip_sell_day_paise"]),
            source_url=d["source_url"],
            retrieved=d["retrieved"],
            file_sha256=hashlib.sha256(raw).hexdigest(),
        )


@dataclass(frozen=True)
class ChargeBreakdown:
    brokerage: Paise
    stt: Paise
    exchange_txn: Paise
    sebi: Paise
    ipft: Paise
    stamp: Paise
    gst: Paise

    @property
    def total(self) -> Paise:
        return self.brokerage + self.stt + self.exchange_txn + self.sebi + self.ipft + self.stamp + self.gst

    def as_dict(self) -> dict[str, int]:
        d = asdict(self)
        d["total"] = self.total
        return d


def fill_charges(schedule: FeeSchedule, side: str, turnover: Paise) -> ChargeBreakdown:
    """Charges for one fill of `turnover` paise (price x quantity). side is BUY or SELL.

    DP charges are NOT included here: they apply once per scrip per sell day and
    are booked separately by the portfolio when the first sell of the day fills.
    """
    if side not in ("BUY", "SELL"):
        raise ValueError(side)
    if turnover < 0:
        raise ValueError("turnover must be non-negative")
    brokerage = apply_rate(turnover, schedule.brokerage_rate)
    if schedule.brokerage_cap_paise:
        brokerage = min(brokerage, schedule.brokerage_cap_paise)
    stt = apply_rate(turnover, schedule.stt_rate_buy if side == "BUY" else schedule.stt_rate_sell)
    if schedule.stt_round_to_rupee:
        stt = round_to_rupee(stt)
    txn = apply_rate(turnover, schedule.exchange_txn_rate)
    sebi = apply_rate(turnover, schedule.sebi_rate)
    ipft = apply_rate(turnover, schedule.ipft_rate)
    stamp = apply_rate(turnover, schedule.stamp_rate_buy) if side == "BUY" else 0
    gst = apply_rate(brokerage + txn + sebi + ipft, schedule.gst_rate)
    return ChargeBreakdown(brokerage, stt, txn, sebi, ipft, stamp, gst)


def estimated_round_trip_cost(schedule: FeeSchedule, turnover: Paise) -> Paise:
    """Buy + sell charges + one DP charge for a position of `turnover` paise."""
    return (
        fill_charges(schedule, "BUY", turnover).total
        + fill_charges(schedule, "SELL", turnover).total
        + schedule.dp_charge_per_scrip_sell_day_paise
    )
