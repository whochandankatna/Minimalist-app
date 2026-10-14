from __future__ import annotations

import pandas as pd


class Strategy:
    """A strategy turns candles into a target position for each bar.

    target_position(df)[i] is decided using only data up to and including the
    close of bar i. 1 means "be fully in the market", 0 means "be in cash".
    The backtester and paper trader act on that decision at the *next* bar,
    so a strategy can never trade on a price it hasn't seen yet.
    """

    name = "base"

    def __init__(self, **params):
        self.params = params

    @property
    def warmup(self) -> int:
        """Bars of history needed before the first meaningful signal."""
        return 0

    def target_position(self, df: pd.DataFrame) -> pd.Series:
        raise NotImplementedError

    def describe(self) -> str:
        args = ", ".join(f"{k}={v}" for k, v in self.params.items())
        return f"{self.name}({args})"
