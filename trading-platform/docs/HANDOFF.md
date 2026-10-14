# Handoff: where things stand (2026-10-14)

## State

* **Code:** `trading-platform/` in repo `whochandankatna/Minimalist-app`, branch
  `claude/youthful-mccarthy-xwsicq`. Git commits are the checkpoints. The separate "Trading Platform"
  repo could not be created because the GitHub integration lacked permission. Moving the folder into a
  new repo later is a plain copy.
* **Pre-existing files:** only the repo-root `README.md` existed and was **not modified**, so nothing
  needed archiving. If you later edit a file that predates a session, copy it to
  `trading-platform/archive/<name>_<YYYY-MM-DD>_v<N>.<ext>` first.
* **Working:** mock-data paper trading end to end, scheduler, dashboard, backtests, research store,
  69 passing tests, strict typecheck.
* **Not started:** the official experiment (needs live data), any deployment, any purchase.
* **No real money, live orders, subscriptions or deployments** were made or enabled.

## Decisions waiting for you

1. Approve the **Kite Connect plan (₹500/month)**. Without it there is no real market data.
2. Choose **hosting**: your own computer (₹0, must stay on during market hours) or a cloud server
   (≈ ₹623/month estimated). See [COSTS.md](COSTS.md).
3. **Verify the 2026 NSE holiday list** against the two circular PDFs (`tradelab calendar-verify`).
4. Optional: approve an alert channel (email or Telegram).

## How to resume

```bash
cd trading-platform && . .venv/bin/activate      # or create it: see README
pytest -q && mypy                                 # must stay green
tradelab demo-simulate --sessions 12 && tradelab serve
```

Next technical steps once Kite is approved:
1. DEMO experiment on Kite data for 2 or 3 sessions: check quotes, fills and closing marks against Kite's own app.
2. `tradelab backtest --period TRAIN` and `VALIDATION` on real candles. Run `EVALUATION` exactly
   once, after deciding in advance what result would count as support for the hypothesis.
3. Create the OFFICIAL experiment and start it when readiness is all PASS.
4. Before December: add `config/calendar/nse_cm_2027.json` from NSE's 2027 circular.

## Things not to do

* Don't edit `config/strategy/*` or `src/tradelab/strategy/momentum.py` during an official experiment.
  It blocks trading by design. Create a new experiment instead.
* Don't delete the database or backups. Experiments are never reset; abandon them instead.
* Don't add a live-order path to this codebase. Live trading needs a separate implementation, its own
  review and your explicit approval.
