# Paper execution and accounting

## Execution model (conservative by design)

**Forward paper trading (live quotes with depth)**

* Orders become eligible only after a simulated latency (2 s), so the next quote poll is the earliest fill.
* Quotes older than 120 s, or with no trade for 15 min after the first 15 min of the session, are
  **stale**: no fills, no new entries, incident logged.
* BUY fills only against displayed asks at or below the limit; at most **25% of displayed quantity per
  poll**, so orders fill partially over time. Price = level-weighted average + 5 bps adverse slippage,
  never worse than the limit.
* Without depth data: synthetic ask/bid = LTP ± 10 bps, at most 50% of remaining quantity per poll.
* Orders outside the exchange price band are rejected. Unfilled DAY orders expire at 15:25.
* A disconnect or auth failure produces no fills, no new entries, and an incident.

**Backtests (daily bars)**

* Fill at the open (+10 bps) if it opens through the limit, so gaps help or hurt realistically. Fill at the
  limit only if the day traded *through* it by at least one tick. **Touching the limit is not a fill.**
* Quantity capped at 1% of the day's volume; remainder expires.
* A sell limit never fills below its limit, so an exit can fail on a gap-down day.

**Duplicates and restarts.** Order ID = UUIDv5(experiment, intent key such as
`2026-10-21:ENTRY:GOLDBEES`), and the pair is unique in the DB. Re-running a job returns the existing
order. Ledger rows have unique refs (`fill:<id>`, `dp:<symbol>:<date>`, `ca:<id>`), so nothing is booked
twice. On startup `recover` reconciles everything and closes missed sessions without inventing fills.

## Accounts kept

* **Cash ledger** (append-only): initial capital, buys, sells, charges, DP charges, dividends, external flows.
* **Reserved cash**: open buy orders reserve quantity × limit + estimated charges.
* **FIFO lots**: realised P&L per sell; unrealised P&L at the latest mark (quote after close, else close).
* **Corporate actions**: splits/bonuses adjust units (cost unchanged) and cancel open orders in that
  scrip; dividends are credited on the ex-date (simplification: real payment arrives later). Each needs an
  official source URL (`tradelab corporate-action-add`).
* **Reconciliation** (`tradelab reconcile`, nightly, after every close and on restart) re-derives cash
  and units from fills and actions. A mismatch pauses entries and raises a CRITICAL incident.
* **Audit log**: every order, fill, control, expense and readiness result, hash-chained so tampering is
  detectable (`tradelab audit-verify`).

## Charges (config/fees/zerodha_equity_delivery_v1.json)

From zerodha.com/charges on 2026-10-14: zero delivery brokerage; STT 0.1% on buy and sell (rounded to
the rupee per fill); NSE transaction 0.00307%; SEBI ₹10/crore; stamp 0.015% on buys; GST 18% on
brokerage + exchange + SEBI; DP ₹15.34 per scrip per sell day. **Conservative assumptions:** ETFs are
charged equity-delivery STT (ETFs may actually pay less), and IPFT at ₹10/crore (the page extract was
unclear). Both overstate costs slightly rather than understate them.

## Three performance layers (no double counting)

| Layer | Equals | Includes |
|---|---|---|
| 1. Trading account | cash + holdings at market | all trading charges (paid from virtual cash) |
| 2. Economic | trading − accrued **operating** expenses | API/data, hosting, AI, paid outside the account |
| 3. All-in project | economic − **setup** expenses allocated to this experiment | one-off setup costs |

* Operating expenses accrue **per calendar day** (monthly ÷ days in month), including weekends and holidays.
  A Monday return therefore includes Saturday's and Sunday's costs.
* Project-level setup costs are charged once, to the first official experiment active on or after the
  expense date.
* Daily net return = (E_t − E_{t−1} − external flow_t) / E_{t−1}, using the previous session's closing equity.
* **Record expenses when they start.** An expense entered with a past start date is accrued
  retroactively, and the whole catch-up lands in the next session's return.
* Personal income tax is **not** deducted anywhere. The dashboard shows a clearly labelled indicative
  short-term capital gains figure (20% of realised net gains). Gold ETFs are taxed differently, paper
  gains are not taxable, and this is not tax advice.
* The 10%-per-session curve is plotted for comparison only, on a log scale.
