# Paper Trading Lab (`tradelab`)

A research and **paper-trading** platform for a small set of liquid NSE ETFs, built for a
₹25,000 virtual account. It runs a single, simple strategy automatically during Indian market
hours, keeps full accounts and an audit trail, and shows everything on a dashboard.

> **Paper trading only.** This version has no code that can place, modify or cancel a real
> order. The Kite client only allows market-data and login endpoints, and tests prove it.
> Nothing here is investment advice.

## What it does, in plain words

* **Every evening after the market closes**, the strategy looks at four ETFs (Nifty 50, Nifty Next 50,
  Bank, Gold) and decides what it would like to hold next session. It is allowed to hold nothing.
* **The next morning at 09:20 IST**, it places *simulated* limit orders. A simulator decides whether
  and how they fill, using real quotes when available, with realistic charges and delays.
* **All day**, it watches prices (once a minute by default), simulates fills, and checks the risk rules.
* **After the close**, it records the day's results: trading account, economic result after running
  costs, and all-in result after setup costs.
* **It runs a 20-session experiment** and stops for reviews after sessions 5, 10 and 20.

The research target of **+10% per session is treated as a hypothesis to test, not a promise**.
Compounded, it would turn ₹25,000 into about ₹1.68 lakh in 20 sessions. Nothing in the backtests
comes anywhere close; see [docs/STRATEGY.md](docs/STRATEGY.md).

## Quick start (local computer)

Needs Python 3.12 or newer.

```bash
cd trading-platform
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env                               # then edit .env (placeholders only)
tradelab init                                      # creates data/tradelab.db
tradelab demo-simulate --sessions 12               # optional: fills the dashboard with a DEMO on mock data
tradelab serve                                     # http://127.0.0.1:8000
```

Without Kite credentials everything runs on **MOCK data** (synthetic prices). The dashboard says so
in an amber badge on every page. A MOCK experiment can never become the official experiment.

### Useful commands

| Command | What it does |
|---|---|
| `tradelab calendar-show` | NSE holidays, special sessions, next 25 trading days |
| `tradelab experiment-create --purpose DEMO` | Create a practice experiment (never counts) |
| `tradelab experiment-readiness` | Run every readiness check |
| `tradelab experiment-start` | Start the clock (only if every check passes) |
| `tradelab backtest --period TRAIN` | Historical test (also `VALIDATION`; `EVALUATION` needs `--confirm-holdout`) |
| `tradelab reconcile` / `tradelab audit-verify` | Independent accounting and audit-trail checks |
| `tradelab run-job post_close` | Run one scheduled job by hand |
| `tradelab expense-add ...` | Record a cost paid outside the virtual account |
| `tradelab healthcheck --url http://127.0.0.1:8000` | Probe for uptime monitors |

Run the tests: `pytest -q` (69 tests). Type check: `mypy` (strict).

## Starting the official 20-session experiment

These steps need your decisions. None are done yet.

1. **Approve and buy the Kite Connect plan** (₹500/month on Zerodha's charges page). The free plan has
   no market data. Sandbox availability is unconfirmed; see docs/VERIFICATION.md.
2. Create a Kite Connect app at developers.kite.trade and set its redirect URL. Put the key and secret
   in `.env` on the server only, and set `TRADELAB_MARKET_DATA=kite`.
3. Open the two NSE circulars listed in `config/calendar/nse_cm_2026.json`, compare the dates, then run
   `tradelab calendar-verify --year 2026 --by "<your name>"`. Add a 2027 file before December.
4. Each trading morning, click **Log in to Kite** on the dashboard. Tokens expire at 06:00 IST daily by
   regulation. This app never sees your password or TOTP.
5. `tradelab experiment-create --purpose OFFICIAL`, then `tradelab experiment-start`.

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, data sources, safety design
* [docs/STRATEGY.md](docs/STRATEGY.md): strategy specification, experiment rules, backtest findings
* [docs/ACCOUNTING.md](docs/ACCOUNTING.md): execution model, charges, three performance layers
* [docs/COSTS.md](docs/COSTS.md): itemised setup and monthly costs (verified vs estimated)
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): staging-first cloud deployment, rollback, backups
* [docs/OPERATIONS.md](docs/OPERATIONS.md): daily routine, health checks, recovery, alerts
* [docs/VERIFICATION.md](docs/VERIFICATION.md): what was verified externally, test results, known gaps
* [docs/HANDOFF.md](docs/HANDOFF.md): where things stand and how to resume
