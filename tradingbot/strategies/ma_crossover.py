from __future__ import annotations

import pandas as pd

from .base import Strategy


class MACrossover(Strategy):
    """Trend following: hold when the fast moving average is above the slow one."""

    name = "ma_crossover"

    def __init__(self, fast: int = 20, slow: int = 100, kind: str = "ema"):
        fast, slow = int(fast), int(slow)
        if fast < 1 or slow < 2:
            raise ValueError("fast must be >= 1 and slow >= 2")
        if fast >= slow:
            raise ValueError(f"fast ({fast}) must be smaller than slow ({slow})")
        if kind not in ("ema", "sma"):
            raise ValueError("kind must be 'ema' or 'sma'")
        super().__init__(fast=fast, slow=slow, kind=kind)
        self.fast, self.slow, self.kind = fast, slow, kind

    @property
    def warmup(self) -> int:
        return self.slow

    def describe(self) -> str:
        return f"MA {self.kind} {self.fast}/{self.slow}"

    def _ma(self, s: pd.Series, n: int) -> pd.Series:
        if self.kind == "ema":
            return s.ewm(span=n, adjust=False, min_periods=n).mean()
        return s.rolling(n, min_periods=n).mean()

    def target_position(self, df: pd.DataFrame) -> pd.Series:
        fast = self._ma(df["close"], self.fast)
        slow = self._ma(df["close"], self.slow)
        # NaN during warmup compares False, so the strategy stays in cash until ready.
        return (fast > slow).astype(int)
