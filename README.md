# Minimalist-app: Crypto Trend-Following Bot

A small Python trading bot for Crypto.com that **backtests** and **paper trades** a
moving-average crossover strategy. It never places real orders and never asks for
API keys. All market data comes from Crypto.com's public endpoints.

## How it works

- **Strategy:** hold the coin while the fast moving average (default 20-day EMA) is
  above the slow one (default 100-day EMA), otherwise sit in cash. Long only, no leverage.
- **No look-ahead:** a decision made at a candle's close is acted on at the *next*
  candle, and the still-forming candle is always ignored.
- **Costs are modeled:** 0.50% fee per buy and per sell (Crypto.com's base-tier taker
  fee) plus 0.05% slippage. Edit `config.toml` if your fee tier is lower.
- **Benchmarks:** every backtest also shows buy-and-hold and dollar-cost averaging
  (DCA) so you can see whether the strategy adds anything.
- **Train/test split:** data before `test_start` is for choosing parameters, and data
  after it is held out to check whether the results hold up.

## Setup

```bash
pip install -r requirements.txt
```

Python 3.11+ is required.

## Commands

```bash
python -m tradingbot backtest          # strategy vs benchmarks, train and test periods
python -m tradingbot sweep             # try many fast/slow combos, ranked on train only
python -m tradingbot paper             # one paper-trading check against live prices
python -m tradingbot paper --loop      # keep running, checking after each candle closes
python -m tradingbot paper --reset     # archive paper state (never deletes) and start fresh
```

Add `--offline` to `backtest` or `sweep` to use cached candles without network access.

Outputs (all git-ignored):

| Folder | Contents |
|---|---|
| `data/` | Cached candles as CSV |
| `results/` | Equity curves and trade lists from backtests |
| `state/` | Paper account balances, trade log, equity log; resets go to `state/archive/` |

Running `paper` on a schedule (e.g. cron once a day shortly after 00:00 UTC for daily
candles) is safe: it acts at most once per closed candle.

Note: when paper trading starts, it joins whatever the current signal is. If the trend is
already "in", it buys immediately rather than waiting for a fresh crossover.

## Project layout

```
config.toml                  all settings
tradingbot/
  account.py                 simulated cash/coin account (fees, slippage)
  backtest.py                backtester, benchmarks, metrics
  paper.py                   paper trader
  exchange.py                Crypto.com data via ccxt, candle cache
  strategies/                strategy plug-ins (add new ones here and register in __init__.py)
  cli.py                     command line
tests/                       pytest suite (`python -m pytest`)
archive/                     dated copies of files before they were edited
```

## Before ever using real money

1. Paper trade for at least a few months and compare paper results to the backtest.
2. Check your actual fee tier on Crypto.com and update `fee_rate`.
3. Live trading would need API keys, exchange order-size rules, error handling for
   partial fills, and a hard daily loss limit. None of that exists here yet, on purpose.

This is an educational tool, not financial advice.
