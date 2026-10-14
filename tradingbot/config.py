"""Load and validate config.toml."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    exchange_id: str
    fee_rate: float
    slippage: float
    strategy_name: str
    timeframe: str
    strategy_params: dict
    symbols: list[str]
    initial_cash: float
    allocation: float
    start: str
    test_start: str | None
    dca_every_bars: int
    state_dir: Path = field(default_factory=lambda: Path("state"))


def load_config(path: str | Path = "config.toml") -> Config:
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    ex = raw.get("exchange", {})
    st = raw.get("strategy", {})
    tr = raw.get("trading", {})
    bt = raw.get("backtest", {})
    pp = raw.get("paper", {})

    cfg = Config(
        exchange_id=ex.get("id", "cryptocom"),
        fee_rate=float(ex.get("fee_rate", 0.005)),
        slippage=float(ex.get("slippage", 0.0005)),
        strategy_name=st.get("name", "ma_crossover"),
        timeframe=st.get("timeframe", "1d"),
        strategy_params=dict(st.get("params", {})),
        symbols=list(tr.get("symbols", ["BTC/USD"])),
        initial_cash=float(tr.get("initial_cash", 10000)),
        allocation=float(tr.get("allocation", 1.0)),
        start=bt.get("start", "2022-01-01"),
        test_start=bt.get("test_start") or None,
        dca_every_bars=int(bt.get("dca_every_bars", 7)),
        state_dir=Path(pp.get("state_dir", "state")),
    )

    if not 0 <= cfg.fee_rate < 0.1:
        raise ValueError(f"fee_rate {cfg.fee_rate} looks wrong (expected a fraction like 0.005)")
    if not 0 <= cfg.slippage < 0.1:
        raise ValueError(f"slippage {cfg.slippage} looks wrong (expected a fraction like 0.0005)")
    if not 0 < cfg.allocation <= 1:
        raise ValueError("allocation must be between 0 (exclusive) and 1")
    if cfg.initial_cash <= 0:
        raise ValueError("initial_cash must be positive")
    if cfg.dca_every_bars < 1:
        raise ValueError("dca_every_bars must be at least 1")
    return cfg
