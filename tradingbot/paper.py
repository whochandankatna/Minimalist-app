"""Paper trader: runs the strategy against live Crypto.com prices with simulated money.

No API keys, no real orders. Each run looks at the most recent *closed* candle and
acts at most once per candle, so it is safe to run on a schedule or in a loop.
"""

from __future__ import annotations

import csv
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from .account import Account
from .config import Config
from .exchange import drop_unclosed, fetch_history, make_exchange, timeframe_ms
from .strategies import Strategy

STATE_FILE = "paper_state.json"
TRADES_FILE = "paper_trades.csv"
EQUITY_FILE = "paper_equity.csv"
TRADE_FIELDS = ["time", "symbol", "side", "price", "qty", "fee", "cash_after", "pnl", "signal_bar"]
EQUITY_FIELDS = ["time", "symbol", "price", "cash", "qty", "equity"]


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec="seconds")


def load_state(cfg: Config, strategy: Strategy) -> dict:
    path = cfg.state_dir / STATE_FILE
    if path.exists():
        state = json.loads(path.read_text())
    else:
        state = {
            "version": 1,
            "created": _iso(int(time.time() * 1000)),
            "strategy": strategy.describe(),
            "timeframe": cfg.timeframe,
            "accounts": {},
        }
    for sym in cfg.symbols:
        state["accounts"].setdefault(
            sym, {**Account(cash=cfg.initial_cash).to_dict(), "last_bar": None}
        )
    return state


def save_state(cfg: Config, state: dict) -> None:
    cfg.state_dir.mkdir(parents=True, exist_ok=True)
    path = cfg.state_dir / STATE_FILE
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.replace(tmp, path)  # atomic: a crash never leaves a half-written state file


def _append_csv(path: Path, fields: list[str], row: dict) -> None:
    new = not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        if new:
            w.writeheader()
        w.writerow({k: row.get(k) for k in fields})


def archive_state(cfg: Config) -> list[Path]:
    """Move existing paper-trading files aside (never deletes) so a fresh run can start."""
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    dest = cfg.state_dir / "archive" / stamp
    moved = []
    for name in (STATE_FILE, TRADES_FILE, EQUITY_FILE):
        src = cfg.state_dir / name
        if src.exists():
            dest.mkdir(parents=True, exist_ok=True)
            os.replace(src, dest / name)
            moved.append(dest / name)
    return moved


def run_once(cfg: Config, strategy: Strategy, ex=None, now_ms: int | None = None, log=print) -> dict:
    ex = ex or make_exchange(cfg.exchange_id)
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    state = load_state(cfg, strategy)

    if state.get("strategy") != strategy.describe() or state.get("timeframe") != cfg.timeframe:
        log(f"WARNING: state was created with {state.get('strategy')} on {state.get('timeframe')}, "
            f"but config now says {strategy.describe()} on {cfg.timeframe}. "
            f"Use `paper --reset` to start fresh if this is unintended.")

    step = timeframe_ms(cfg.timeframe)
    # Extra history beyond warmup lets EMAs converge to the same values the backtest sees.
    lookback = (strategy.warmup * 3 + 10) * step
    summary = {}

    for sym in cfg.symbols:
        a = state["accounts"][sym]
        acct = Account(cash=a["cash"], qty=a["qty"], entry_cost=a["entry_cost"], fees_paid=a["fees_paid"])

        df = drop_unclosed(fetch_history(ex, sym, cfg.timeframe, now_ms - lookback), cfg.timeframe, now_ms)
        if len(df) <= strategy.warmup:
            log(f"{sym}: only {len(df)} closed candles, need more than {strategy.warmup}; skipping")
            continue

        ticker = ex.fetch_ticker(sym)
        last = ticker.get("last") or float(df["close"].iloc[-1])
        bar = int(df["timestamp"].iloc[-1])
        want = int(strategy.target_position(df).iloc[-1])
        action = "hold"

        if a["last_bar"] is not None and bar <= a["last_bar"]:
            action = "no new candle"
        else:
            fill = None
            if want and not acct.in_position:
                fill = acct.buy(ticker.get("ask") or last, cfg.fee_rate, cfg.slippage, cfg.allocation)
            elif not want and acct.in_position:
                fill = acct.sell_all(ticker.get("bid") or last, cfg.fee_rate, cfg.slippage)
            if fill:
                action = fill.side.upper()
                _append_csv(cfg.state_dir / TRADES_FILE, TRADE_FIELDS, {
                    "time": _iso(now_ms), "symbol": sym, **fill.__dict__, "signal_bar": _iso(bar),
                })
            a.update(acct.to_dict())
            a["last_bar"] = bar

        equity = acct.equity(last)
        _append_csv(cfg.state_dir / EQUITY_FILE, EQUITY_FIELDS, {
            "time": _iso(now_ms), "symbol": sym, "price": last,
            "cash": acct.cash, "qty": acct.qty, "equity": equity,
        })
        pnl = equity / cfg.initial_cash - 1
        log(f"{sym}: candle {_iso(bar)} signal={'IN' if want else 'OUT'} action={action} "
            f"price={last:,.2f} equity=${equity:,.2f} ({pnl:+.2%})")
        summary[sym] = {"action": action, "signal": want, "equity": equity}

    save_state(cfg, state)
    return summary


def run_loop(cfg: Config, strategy: Strategy, grace_seconds: int = 60, log=print) -> None:
    """Run once now, then again shortly after each candle closes. Ctrl-C to stop."""
    step = timeframe_ms(cfg.timeframe)
    ex = make_exchange(cfg.exchange_id)
    while True:
        try:
            run_once(cfg, strategy, ex=ex, log=log)
        except Exception as e:  # network blips shouldn't kill a long-running loop
            log(f"ERROR during paper run: {e!r}; will retry next cycle")
        now = int(time.time() * 1000)
        next_close = (now // step + 1) * step
        wait = (next_close - now) / 1000 + grace_seconds
        log(f"Next check at {_iso(next_close + grace_seconds * 1000)} (sleeping {wait / 60:.0f} min)")
        time.sleep(wait)
