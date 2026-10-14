"""Frozen strategy + risk specification and its fingerprint.

The fingerprint is a SHA-256 over the strategy JSON, risk JSON, universe JSON
and the source code of the signal module. It is stored on the experiment when
it starts; every scheduled job re-computes it and refuses to trade if it has
changed (including changes made by an AI assistant or by accident). A real
strategy change therefore requires creating a new experiment.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from ..money import Paise, rupees
from ..settings import CONFIG_DIR

STRATEGY_FILE = CONFIG_DIR / "strategy" / "momentum_etf_v1.json"
RISK_FILE = CONFIG_DIR / "strategy" / "risk_controls_v1.json"
UNIVERSE_FILE = CONFIG_DIR / "strategy" / "universe_v1.json"
SIGNAL_SOURCE = Path(__file__).with_name("momentum.py")


@dataclass(frozen=True)
class StrategyParams:
    momentum_lookback: int
    sma_window: int
    top_k: int
    rebalance_every: int
    buy_buffer_bps: int
    sell_buffer_bps: int
    liquidation_buffer_bps: int
    submit_time: str
    trade_on_special_sessions: bool

    @property
    def min_history(self) -> int:
        return max(self.sma_window, self.momentum_lookback + 1)


@dataclass(frozen=True)
class RiskControls:
    starting_capital: Paise
    max_invested: Paise
    pause_dd: Decimal
    halt_loss: Decimal

    def to_json(self) -> str:
        return json.dumps({
            "starting_capital_paise": self.starting_capital, "max_invested_paise": self.max_invested,
            "pause_entries_drawdown_from_peak": str(self.pause_dd), "halt_loss_from_start": str(self.halt_loss),
        })

    @classmethod
    def from_json(cls, s: str) -> "RiskControls":
        d = json.loads(s)
        return cls(int(d["starting_capital_paise"]), int(d["max_invested_paise"]),
                   Decimal(d["pause_entries_drawdown_from_peak"]), Decimal(d["halt_loss_from_start"]))


@dataclass(frozen=True)
class FrozenSpec:
    strategy_id: str
    version: str
    params: StrategyParams
    risk: RiskControls
    raw_strategy: dict[str, Any]
    fingerprint: str


def fingerprint(paths: tuple[Path, ...] = (STRATEGY_FILE, RISK_FILE, UNIVERSE_FILE, SIGNAL_SOURCE)) -> str:
    h = hashlib.sha256()
    for p in paths:
        h.update(p.name.encode())
        h.update(b"\0")
        h.update(p.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def load_spec() -> FrozenSpec:
    st = json.loads(STRATEGY_FILE.read_text())
    rk = json.loads(RISK_FILE.read_text())
    p = st["params"]
    return FrozenSpec(
        strategy_id=st["id"], version=st["version"],
        params=StrategyParams(
            momentum_lookback=int(p["momentum_lookback_sessions"]), sma_window=int(p["trend_sma_sessions"]),
            top_k=int(p["top_k"]), rebalance_every=int(p["rebalance_every_sessions"]),
            buy_buffer_bps=int(p["buy_limit_buffer_bps"]), sell_buffer_bps=int(p["sell_limit_buffer_bps"]),
            liquidation_buffer_bps=int(p["liquidation_limit_buffer_bps"]), submit_time=p["order_submit_time_ist"],
            trade_on_special_sessions=bool(p["trade_on_special_sessions"]),
        ),
        risk=RiskControls(
            starting_capital=rupees(rk["starting_capital_rupees"]), max_invested=rupees(rk["max_invested_rupees"]),
            pause_dd=Decimal(rk["pause_entries_drawdown_from_peak"]), halt_loss=Decimal(rk["halt_loss_from_start"]),
        ),
        raw_strategy=st,
        fingerprint=fingerprint(),
    )
