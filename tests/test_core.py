import json
from pathlib import Path

import pandas as pd
import pytest

from tradingbot import backtest as bt
from tradingbot import paper
from tradingbot.account import Account
from tradingbot.config import Config
from tradingbot.strategies import build_strategy
from tradingbot.strategies.base import Strategy

DAY = 86_400_000


def candles(closes, start="2024-01-01"):
    """Daily candles where each bar opens at the previous close."""
    t0 = int(pd.Timestamp(start, tz="UTC").timestamp() * 1000)
    opens = [closes[0]] + list(closes[:-1])
    rows = [[t0 + i * DAY, o, max(o, c), min(o, c), c, 1.0] for i, (o, c) in enumerate(zip(opens, closes))]
    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df


def make_cfg(tmp_path, **kw):
    base = dict(
        exchange_id="cryptocom", fee_rate=0.005, slippage=0.0, strategy_name="ma_crossover",
        timeframe="1d", strategy_params={"fast": 2, "slow": 4, "kind": "sma"}, symbols=["BTC/USD"],
        initial_cash=1000.0, allocation=1.0, start="2024-01-01", test_start=None, dca_every_bars=7,
        state_dir=tmp_path / "state",
    )
    base.update(kw)
    return Config(**base)


# --- Account fee math -------------------------------------------------------

def test_round_trip_at_flat_price_loses_exactly_two_fees():
    a = Account(cash=1000)
    a.buy(100, fee_rate=0.005, slippage=0)
    assert a.cash == pytest.approx(0)
    fill = a.sell_all(100, fee_rate=0.005, slippage=0)
    # buy: qty = 1000 / (100 * 1.005); sell proceeds = qty * 100 * 0.995
    expected = 1000 / 1.005 * 0.995
    assert a.cash == pytest.approx(expected)
    assert fill.pnl == pytest.approx(expected - 1000)
    assert a.fees_paid == pytest.approx(1000 - expected)


def test_slippage_worsens_both_sides():
    a = Account(cash=1000)
    a.buy(100, fee_rate=0, slippage=0.01)
    a.sell_all(100, fee_rate=0, slippage=0.01)
    assert a.cash == pytest.approx(1000 / 1.01 * 0.99)


def test_partial_allocation_keeps_cash():
    a = Account(cash=1000)
    a.buy(100, fee_rate=0, slippage=0, allocation=0.25)
    assert a.cash == pytest.approx(750)
    assert a.qty == pytest.approx(2.5)


# --- Strategy ---------------------------------------------------------------

def test_ma_crossover_rejects_bad_params():
    with pytest.raises(ValueError):
        build_strategy("ma_crossover", {"fast": 50, "slow": 20})
    with pytest.raises(ValueError):
        build_strategy("ma_crossover", {"fast": 5, "slow": 20, "kind": "wma"})


def test_ma_crossover_stays_out_during_warmup_and_follows_trend():
    s = build_strategy("ma_crossover", {"fast": 2, "slow": 4, "kind": "sma"})
    df = candles([10, 10, 10, 10, 12, 14, 16, 14, 10, 8, 6])
    pos = s.target_position(df)
    assert pos.iloc[:3].sum() == 0          # not enough data yet
    assert pos.iloc[5] == 1                 # uptrend
    assert pos.iloc[-1] == 0                # downtrend


# --- Backtester -------------------------------------------------------------

class Oracle(Strategy):
    """Cheats if allowed: wants to hold on bars whose close is up. Used to prove no look-ahead."""
    name = "oracle"

    def target_position(self, df):
        return (df["close"] > df["open"]).astype(int)


def test_no_lookahead_decision_is_acted_on_next_bar():
    df = candles([100, 200, 100, 200, 100, 200])
    held = bt.held_from_strategy(df, Oracle())
    # Decision at bar i's close only applies from bar i+1.
    assert list(held) == [0, 0, 1, 0, 1, 0]
    res = bt.simulate(df, held, 0, 0, 1000)
    # Buys at bar 2's open (200) and it closes at 100: a perfect-foresight strategy
    # would profit here, an honest one loses.
    assert res.equity.iloc[-1] < 1000


def test_buy_and_hold_matches_price_change_minus_entry_fee():
    df = candles([100, 110, 120, 150])
    r = bt.buy_and_hold(df, fee_rate=0.005, slippage=0, initial_cash=1000)
    assert r.equity.iloc[-1] == pytest.approx(1000 / 1.005 * 150 / 100)
    m = r.metrics("1d")
    assert m["total_return"] == pytest.approx(150 / 100 / 1.005 - 1)


def test_dca_invests_everything_by_the_end():
    df = candles([100] * 21)
    r = bt.dca(df, fee_rate=0, slippage=0, initial_cash=900, every=7)
    buys = [t for t in r.trades if t["side"] == "buy"]
    assert len(buys) == 3
    assert r.equity.iloc[-1] == pytest.approx(900)


def test_max_drawdown():
    df = candles([100, 50, 100])
    r = bt.buy_and_hold(df, 0, 0, 1000)
    assert r.metrics("1d")["max_drawdown"] == pytest.approx(-0.5)


def test_split_periods_respects_start_and_test_start():
    df = candles([1] * 40, start="2024-01-01")
    parts = bt.split_periods(df, "2024-01-05", "2024-01-20")
    assert parts["train"].index[0] == pd.Timestamp("2024-01-05", tz="UTC")
    assert parts["train"].index[-1] == pd.Timestamp("2024-01-19", tz="UTC")
    assert parts["test"].index[0] == pd.Timestamp("2024-01-20", tz="UTC")


# --- Paper trader -----------------------------------------------------------

class FakeExchange:
    def __init__(self, df, bid, ask, last):
        self.df, self.bid, self.ask, self.last = df, bid, ask, last
        self.calls = 0

    def milliseconds(self):
        return int(self.df["timestamp"].iloc[-1]) + 2 * DAY

    def fetch_ohlcv(self, symbol, timeframe, since=None, limit=300):
        rows = self.df[self.df["timestamp"] >= since][["timestamp", "open", "high", "low", "close", "volume"]]
        return rows.values.tolist()[:limit]

    def fetch_ticker(self, symbol):
        self.calls += 1
        return {"bid": self.bid, "ask": self.ask, "last": self.last}


def test_paper_buys_once_per_candle_and_persists(tmp_path):
    cfg = make_cfg(tmp_path)
    strat = build_strategy("ma_crossover", cfg.strategy_params)
    df = candles([10, 10, 10, 10, 12, 14, 16, 18])
    ex = FakeExchange(df, bid=17.9, ask=18.1, last=18.0)
    now = int(df["timestamp"].iloc[-1]) + DAY + 1  # last candle has closed

    out = paper.run_once(cfg, strat, ex=ex, now_ms=now, log=lambda *_: None)
    assert out["BTC/USD"]["action"] == "BUY"
    state = json.loads((cfg.state_dir / "paper_state.json").read_text())
    acct = state["accounts"]["BTC/USD"]
    assert acct["cash"] == pytest.approx(0)
    assert acct["qty"] == pytest.approx(1000 / (18.1 * 1.005))  # filled at the ask, plus fee

    # Running again on the same candle must not trade again.
    out2 = paper.run_once(cfg, strat, ex=ex, now_ms=now, log=lambda *_: None)
    assert out2["BTC/USD"]["action"] == "no new candle"
    trades = (cfg.state_dir / "paper_trades.csv").read_text().strip().splitlines()
    assert len(trades) == 2  # header + one buy


def test_paper_ignores_the_still_forming_candle(tmp_path):
    cfg = make_cfg(tmp_path)
    strat = build_strategy("ma_crossover", cfg.strategy_params)
    # Last candle is a huge spike, but it has not closed yet at `now`.
    df = candles([10, 10, 10, 10, 10, 10, 10, 1000])
    ex = FakeExchange(df, bid=999, ask=1001, last=1000)
    now = int(df["timestamp"].iloc[-1]) + DAY // 2
    out = paper.run_once(cfg, strat, ex=ex, now_ms=now, log=lambda *_: None)
    assert out["BTC/USD"]["signal"] == 0
    assert out["BTC/USD"]["action"] == "hold"


def test_paper_reset_archives_instead_of_deleting(tmp_path):
    cfg = make_cfg(tmp_path)
    cfg.state_dir.mkdir(parents=True)
    (cfg.state_dir / "paper_state.json").write_text("{}")
    moved = paper.archive_state(cfg)
    assert len(moved) == 1 and moved[0].exists()
    assert not (cfg.state_dir / "paper_state.json").exists()
