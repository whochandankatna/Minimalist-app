"""Bar-by-bar backtester with fees, slippage, benchmarks and performance metrics."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from .account import Account
from .exchange import timeframe_ms
from .strategies import Strategy


@dataclass
class Result:
    label: str
    equity: pd.Series
    initial_cash: float
    fees_paid: float = 0.0
    trades: list[dict] = field(default_factory=list)
    exposure: float = 0.0          # fraction of bars spent holding coins

    def metrics(self, timeframe: str) -> dict:
        return compute_metrics(self, timeframe)


def bars_per_year(timeframe: str) -> float:
    return 365.25 * 24 * 3600 * 1000 / timeframe_ms(timeframe)


def compute_metrics(r: Result, timeframe: str) -> dict:
    eq = r.equity
    final = float(eq.iloc[-1])
    total_return = final / r.initial_cash - 1
    days = max((eq.index[-1] - eq.index[0]).total_seconds() / 86400, 1)
    years = days / 365.25
    cagr = (final / r.initial_cash) ** (1 / years) - 1 if final > 0 else -1.0

    curve = pd.concat([pd.Series([r.initial_cash]), eq.reset_index(drop=True)])
    max_dd = float((curve / curve.cummax() - 1).min())

    rets = curve.pct_change().dropna()
    std = rets.std()
    sharpe = float(rets.mean() / std * math.sqrt(bars_per_year(timeframe))) if std > 0 else 0.0

    sells = [t for t in r.trades if t["side"] == "sell"]
    wins = [t for t in sells if t["pnl"] > 0]
    return {
        "label": r.label,
        "final_equity": final,
        "total_return": total_return,
        "cagr": cagr,
        "max_drawdown": max_dd,
        "sharpe": sharpe,
        "round_trips": len(sells),
        "win_rate": len(wins) / len(sells) if sells else None,
        "exposure": r.exposure,
        "fees_paid": r.fees_paid,
    }


def simulate(
    df: pd.DataFrame,
    held: pd.Series,
    fee_rate: float,
    slippage: float,
    initial_cash: float,
    allocation: float = 1.0,
    label: str = "strategy",
) -> Result:
    """`held[i]` is whether to hold coins during bar i. Trades fill at bar i's open."""
    acct = Account(cash=initial_cash)
    equity, trades, bars_in = [], [], 0
    for ts, o, c, want in zip(df.index, df["open"], df["close"], held.reindex(df.index).fillna(0)):
        fill = None
        if want and not acct.in_position:
            fill = acct.buy(o, fee_rate, slippage, allocation)
        elif not want and acct.in_position:
            fill = acct.sell_all(o, fee_rate, slippage)
        if fill:
            trades.append({"time": ts, **fill.__dict__})
        if acct.in_position:
            bars_in += 1
        equity.append(acct.equity(c))
    return Result(
        label=label,
        equity=pd.Series(equity, index=df.index),
        initial_cash=initial_cash,
        fees_paid=acct.fees_paid,
        trades=trades,
        exposure=bars_in / len(df) if len(df) else 0.0,
    )


def held_from_strategy(df: pd.DataFrame, strategy: Strategy) -> pd.Series:
    """Shift by one bar: the decision made at bar i's close is acted on at bar i+1's open."""
    return strategy.target_position(df).shift(1).fillna(0).astype(int)


def buy_and_hold(df, fee_rate, slippage, initial_cash) -> Result:
    held = pd.Series(1, index=df.index)
    return simulate(df, held, fee_rate, slippage, initial_cash, 1.0, label="buy & hold")


def dca(df, fee_rate, slippage, initial_cash, every: int) -> Result:
    """Split cash into equal slices and buy one slice at the open every `every` bars."""
    n = math.ceil(len(df) / every)
    slice_cash = initial_cash / n
    acct = Account(cash=initial_cash)
    equity, trades, bars_in = [], [], 0
    for i, (ts, o, c) in enumerate(zip(df.index, df["open"], df["close"])):
        if i % every == 0 and acct.cash > 0:
            fraction = min(1.0, slice_cash / acct.cash)
            fill = acct.buy(o, fee_rate, slippage, fraction)
            if fill:
                trades.append({"time": ts, **fill.__dict__})
        if acct.in_position:
            bars_in += 1
        equity.append(acct.equity(c))
    return Result(
        label=f"DCA every {every} bars",
        equity=pd.Series(equity, index=df.index),
        initial_cash=initial_cash,
        fees_paid=acct.fees_paid,
        trades=trades,
        exposure=bars_in / len(df) if len(df) else 0.0,
    )


def split_periods(df: pd.DataFrame, start: str, test_start: str | None) -> dict[str, pd.DataFrame]:
    df = df[df.index >= pd.Timestamp(start, tz="UTC")]
    if not test_start:
        return {"full": df}
    cut = pd.Timestamp(test_start, tz="UTC")
    periods = {"train": df[df.index < cut], "test": df[df.index >= cut]}
    return {k: v for k, v in periods.items() if len(v) > 1}


def warmup_start(start: str, timeframe: str, bars: int) -> str:
    """Date to begin downloading so indicators are ready by `start`.
    Twice the warmup lets EMAs settle close to their long-run values."""
    ts = pd.Timestamp(start, tz="UTC") - pd.Timedelta(milliseconds=timeframe_ms(timeframe) * bars * 2)
    return ts.strftime("%Y-%m-%d")


def is_warmed_up(df: pd.DataFrame, strategy: Strategy, start: str) -> bool:
    return len(df[df.index < pd.Timestamp(start, tz="UTC")]) >= strategy.warmup


def run_all(df, strategy, cfg) -> dict[str, list[Result]]:
    """Strategy + benchmarks for each period. Indicators are computed on the full
    history, including bars before cfg.start (they only look backward), so each
    period starts fully warmed up when enough history exists."""
    held = held_from_strategy(df, strategy)
    out = {}
    for name, part in split_periods(df, cfg.start, cfg.test_start).items():
        out[name] = [
            simulate(part, held, cfg.fee_rate, cfg.slippage, cfg.initial_cash, cfg.allocation,
                     label=strategy.describe()),
            buy_and_hold(part, cfg.fee_rate, cfg.slippage, cfg.initial_cash),
            dca(part, cfg.fee_rate, cfg.slippage, cfg.initial_cash, cfg.dca_every_bars),
        ]
    return out
