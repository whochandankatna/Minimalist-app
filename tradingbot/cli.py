"""Command line entry point: python -m tradingbot <command>"""

from __future__ import annotations

import argparse
import itertools
from pathlib import Path

import pandas as pd

from . import backtest as bt
from . import paper
from .config import load_config
from .exchange import load_candles
from .strategies import build_strategy


def _pct(x) -> str:
    return "n/a" if x is None else f"{x:+.1%}"


def _print_table(rows: list[dict]) -> None:
    header = f"{'':28} {'final $':>11} {'return':>8} {'CAGR':>8} {'max DD':>8} {'Sharpe':>7} {'trips':>7} {'win %':>6} {'in mkt':>7} {'fees $':>8}"
    print(header)
    print("-" * len(header))
    for m in rows:
        win = "n/a" if m["win_rate"] is None else f"{m['win_rate']:.0%}"
        print(f"{m['label'][:28]:28} {m['final_equity']:>11,.0f} {_pct(m['total_return']):>8} "
              f"{_pct(m['cagr']):>8} {_pct(m['max_drawdown']):>8} {m['sharpe']:>7.2f} "
              f"{m['round_trips']:>7} {win:>6} {m['exposure']:>7.0%} {m['fees_paid']:>8,.0f}")


def _candles(cfg, symbol, offline, warmup_bars):
    """Candles from before cfg.start too, so indicators are ready on the first test day."""
    data_start = bt.warmup_start(cfg.start, cfg.timeframe, warmup_bars)
    return load_candles(cfg.exchange_id, symbol, cfg.timeframe, data_start, refresh=not offline)


def _warn_warmup(df, strategy, cfg, sym):
    if not bt.is_warmed_up(df, strategy, cfg.start):
        print(f"WARNING: {sym} has fewer than {strategy.warmup} candles before {cfg.start}, so "
              f"{strategy.describe()} sits in cash at the start of the train period while it warms up. "
              f"Train results for it are less reliable.")


def cmd_backtest(cfg, args) -> None:
    strategy = build_strategy(cfg.strategy_name, cfg.strategy_params)
    out_dir = Path("results")
    out_dir.mkdir(exist_ok=True)
    print(f"Strategy: {strategy.describe()}  timeframe={cfg.timeframe}  "
          f"fee={cfg.fee_rate:.3%}/side  slippage={cfg.slippage:.3%}/side  "
          f"cash=${cfg.initial_cash:,.0f} per symbol")
    for sym in cfg.symbols:
        df = _candles(cfg, sym, args.offline, strategy.warmup)
        print(f"\n=== {sym}: {len(df)} candles incl. warmup, {df.index[0]:%Y-%m-%d} to {df.index[-1]:%Y-%m-%d} ===")
        _warn_warmup(df, strategy, cfg, sym)
        for period, results in bt.run_all(df, strategy, cfg).items():
            part = results[0].equity.index
            print(f"\n[{period.upper()}] {part[0]:%Y-%m-%d} to {part[-1]:%Y-%m-%d}")
            _print_table([r.metrics(cfg.timeframe) for r in results])
            curves = pd.DataFrame({r.label: r.equity for r in results})
            curves.to_csv(out_dir / f"equity_{sym.replace('/', '-')}_{period}.csv")
            trades = pd.DataFrame(results[0].trades)
            if not trades.empty:
                trades.to_csv(out_dir / f"trades_{sym.replace('/', '-')}_{period}.csv", index=False)
    if cfg.test_start:
        print("\nJudge the strategy on the TEST rows. TRAIN is where parameters were chosen, "
              "so it always looks better than reality.")
    print(f"Equity curves and trade lists saved in {out_dir}/")


def cmd_sweep(cfg, args) -> None:
    if cfg.strategy_name != "ma_crossover":
        raise SystemExit("sweep currently supports ma_crossover only")
    if not cfg.test_start:
        raise SystemExit("Set backtest.test_start in config.toml so the sweep can hold out a test period")
    fasts = [int(x) for x in args.fast.split(",")]
    slows = [int(x) for x in args.slow.split(",")]
    kind = cfg.strategy_params.get("kind", "ema")
    combos = [(f, s) for f, s in itertools.product(fasts, slows) if f < s]

    for sym in cfg.symbols:
        df = _candles(cfg, sym, args.offline, max(slows))
        rows = []
        for f, s in combos:
            strat = build_strategy("ma_crossover", {"fast": f, "slow": s, "kind": kind})
            _warn_warmup(df, strat, cfg, sym)
            res = bt.run_all(df, strat, cfg)
            tr = res["train"][0].metrics(cfg.timeframe)
            te = res["test"][0].metrics(cfg.timeframe) if "test" in res else None
            rows.append((f, s, tr, te))
        bh = {p: r[1].metrics(cfg.timeframe) for p, r in bt.run_all(df, strat, cfg).items()}

        rows.sort(key=lambda r: r[2]["sharpe"], reverse=True)
        print(f"\n=== {sym}: {len(combos)} combos ranked by TRAIN Sharpe (test shown for honesty) ===")
        print(f"{'fast':>5} {'slow':>5} | {'train ret':>9} {'train DD':>9} {'train Sh':>8} | "
              f"{'test ret':>9} {'test DD':>9} {'test Sh':>8}")
        for f, s, tr, te in rows[: args.top]:
            t = te or {"total_return": None, "max_drawdown": None, "sharpe": float("nan")}
            print(f"{f:>5} {s:>5} | {_pct(tr['total_return']):>9} {_pct(tr['max_drawdown']):>9} "
                  f"{tr['sharpe']:>8.2f} | {_pct(t['total_return']):>9} {_pct(t['max_drawdown']):>9} "
                  f"{t['sharpe']:>8.2f}")
        for p, m in bh.items():
            print(f"  buy & hold {p}: return {_pct(m['total_return'])}, max DD "
                  f"{_pct(m['max_drawdown'])}, Sharpe {m['sharpe']:.2f}")
    print("\nPick parameters from the TRAIN columns. If the top picks fall apart in TEST, "
          "the edge is probably overfitting, not real.")


def cmd_paper(cfg, args) -> None:
    strategy = build_strategy(cfg.strategy_name, cfg.strategy_params)
    if args.reset:
        moved = paper.archive_state(cfg)
        print("Archived previous paper state to:" if moved else "No previous paper state to archive.")
        for p in moved:
            print(f"  {p}")
        return
    print(f"PAPER TRADING (simulated money only) with {strategy.describe()} on {cfg.timeframe} candles")
    if args.loop:
        paper.run_loop(cfg, strategy)
    else:
        paper.run_once(cfg, strategy)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="tradingbot", description="Crypto trend-following bot (backtest + paper only)")
    p.add_argument("--config", default="config.toml")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backtest", help="Backtest the configured strategy against benchmarks")
    b.add_argument("--offline", action="store_true", help="Use cached candles only, no network")

    s = sub.add_parser("sweep", help="Try many fast/slow combos, ranked on the train period only")
    s.add_argument("--fast", default="5,10,20,30,50")
    s.add_argument("--slow", default="50,100,150,200")
    s.add_argument("--top", type=int, default=10)
    s.add_argument("--offline", action="store_true")

    pp = sub.add_parser("paper", help="Paper trade with live prices and simulated money")
    pp.add_argument("--loop", action="store_true", help="Keep running, checking after each candle closes")
    pp.add_argument("--reset", action="store_true", help="Archive current paper state and start fresh")

    args = p.parse_args(argv)
    cfg = load_config(args.config)
    {"backtest": cmd_backtest, "sweep": cmd_sweep, "paper": cmd_paper}[args.cmd](cfg, args)


if __name__ == "__main__":
    main()
