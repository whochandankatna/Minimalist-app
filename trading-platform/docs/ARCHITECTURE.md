# Architecture

## Stack and why

| Choice | Reason |
|---|---|
| Python 3.13 | Best ecosystem for market data and finance; easy to read |
| FastAPI + Jinja2 templates | Server-rendered dashboard: no separate front-end build, secrets never reach the browser |
| SQLite (WAL, `synchronous=FULL`) via SQLAlchemy 2 | One file, cheap to host and back up; models are portable to Postgres if needed |
| APScheduler | Established in-process scheduler with `Asia/Kolkata` cron triggers |
| httpx | Small HTTP client; the Kite client is hand-written so it can be allow-listed |
| Chart.js 4.4.1 (vendored file) | Charts without a CDN dependency |

Money is stored as **integer paise** everywhere; rates are `Decimal`. Times are stored in UTC and
shown in IST.

## Components

```
config/                   versioned inputs (frozen into each experiment by SHA-256)
  calendar/nse_cm_2026.json   NSE Capital Market holidays + special sessions, citing circulars
  fees/…v1.json               Zerodha delivery charges, source URL + retrieval date
  strategy/                   strategy spec, risk controls, ETF universe, backtest periods
  research/sources.json       research sources and their automated-access status
src/tradelab/
  marketdata/   mock.py (synthetic), kite.py (read-only, allow-listed), csvdata.py, kite_session.py
  execution/    paper.py (the only "broker"), fillmodel.py (quote- and bar-based fill models)
  accounting/   portfolio.py (ledger, FIFO lots, fills, corporate actions, reconcile),
                expenses.py (operating vs setup costs), performance.py (equity layers, returns)
  strategy/     spec.py (frozen spec + fingerprint), momentum.py (signal + sizing; pure functions)
  experiment/   lifecycle.py (create/readiness/start), engine.py (scheduled jobs),
                controls.py (pause/cancel/liquidate), selftest.py (execution self-test)
  backtest/     engine.py (daily-bar replay using the same broker/accounting/strategy code)
  research/     store.py (provenance + heuristic tagging), fetch.py (only human-enabled sources)
  ops/audit.py  hash-chained audit log, incidents, unsent alert drafts
  scheduler.py  job wiring + job_runs records
  web/          dashboard, controls, CSV reports, Kite login callback, /healthz
```

### Daily job timeline (IST, every day; jobs consult the NSE calendar and skip non-sessions)

| Time | Job | Purpose |
|---|---|---|
| 08:10, 17:10 | `research_fetch` | Only sources a human enabled; never affects trading |
| 08:45 | `pre_session` | Verify frozen spec, apply corporate actions, create session row, ensure signal |
| 09:20 | `submit_orders` | Exits/liquidation first, then entries, only when data and auth are healthy |
| every 60 s | `monitor` | Quotes, staleness, simulated fills, intraday halt check. Never creates strategy trades |
| 15:25 | `expire_orders` | Unfilled DAY orders expire |
| 15:50 | `post_close` | Official marks, equity, returns, risk rules, next signal, reviews |
| 23:30 | `housekeeping` | Backup (30 kept), reconcile, audit-chain check, prune quote snapshots |
| on startup | `recover` | Reconcile; close sessions missed while offline (no retroactive fills) |

## Safety design (paper only)

1. **No order code exists.** The Kite client (`marketdata/kite.py`) checks every request against
   `ALLOWED_ENDPOINTS` *before any network I/O*: quotes, instruments, historical day candles, profile,
   and the session-token handshake. Order, GTT, margin, portfolio and MF endpoints raise
   `ForbiddenEndpointError`. Tests check this list, prove no request leaves the process, and scan the
   source for SDK/order calls.
2. **The paper broker is the only venue.** It refuses margin (cash check), short sales (holdings check),
   anything outside the frozen universe, prices outside exchange bands, and buys while paused.
3. **Secrets stay server-side.** API secret, access token and dashboard password live in `.env` / DB,
   are never rendered or logged (`audit.redact`), and tests assert they never appear in any page or CSV.
4. **Frozen strategy.** Strategy JSON, risk JSON, universe JSON and the signal source file are hashed.
   Every job re-checks the hash and blocks trading with a CRITICAL incident if anything changed,
   including edits by an AI assistant. A real change needs a new experiment.
5. **Research cannot trade.** `research/` may not import strategy/execution/experiment/accounting
   (tested), and the DB rejects any risk flag with `affects_trading = true`.
6. **Dashboard access.** HTTP Basic auth; without a password the app answers localhost only and refuses
   to bind publicly. POST controls carry a CSRF token. `/healthz` is public but reveals nothing sensitive.

## Data sources

| Data | Source | Status (checked 2026-10-14) |
|---|---|---|
| Live quotes + depth | Kite Connect `/quote` | Requires paid Connect plan (₹500/month). Rate limit 1 req/s |
| Historical daily candles | Kite Connect `/instruments/historical/{token}/day` | Included in Connect plan. 3 req/s |
| Synthetic data | `MockMarketData` | Always labelled MOCK; cannot be used for the official experiment |
| Historical CSV | User-downloaded files (`tradelab import-bars`) | Backtests only, tagged CSV |
| NSE holidays | NSE circulars NSE/CMTR/71775, NSE/CMTR/72260 | nseindia.com blocks automated access (403); transcribed, needs human verification |
| Exchange filings | NSE/BSE announcement pages | Automated access blocked; manual entry only |
| Central bank / government | RBI RSS, PIB, DGFT/CBIC, US Federal Register API, OFAC | Automation off until a human reviews terms (`tradelab research-enable`) |

Every research item stores source URL, publication time (or "not stated"), first-observed time,
retrieval time and content hash, and separates **verified facts**, **heuristic/AI inference** and
**missing information**. Event status distinguishes SIGNED / NON_BINDING / RUMOUR / PROPOSED / EFFECTIVE.
Financial items record consolidated vs standalone, units and reporting period. No AI model is called in
this version; the tagger is keyword-based and labelled as heuristic.
