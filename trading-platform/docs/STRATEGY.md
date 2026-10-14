# Strategy specification and experiment rules

## Strategy v1: ETF trend + momentum rotation (`etf_trend_momentum` 1.0.0)

**Hypothesis.** Broad Indian asset-class ETFs that have risen over the last ~3 months and trade above
their ~5-month average tend to keep outperforming over the following weeks, and stepping aside when
trends break reduces losses. This is a modest, widely studied effect. **It is not designed to produce
10% per day and is not expected to.** Typical daily moves for these ETFs are around ±1%.

**Universe** (fixed before any backtest): NIFTYBEES (Nifty 50), JUNIORBEES (Nifty Next 50),
BANKBEES (Nifty Bank), GOLDBEES (gold). All are long-listed and liquid. ETFs avoid single-company
risks such as fraud, delisting or trading suspensions. Benchmark: NIFTYBEES.

**Rules**

1. After each close, for every ETF compute the 63-session price change and whether it closed above
   its 100-session simple average (prices adjusted for splits, bonuses and dividends).
2. Eligible = above its average **and** positive 63-session change.
3. On sessions 1, 6, 11, 16 (every 5th), hold the top 2 eligible ETFs. Unused slots stay cash.
4. Any session: if a held ETF closed below its 100-session average, sell it next session.
5. Signals use closes up to day D and trade in session D+1 at 09:20 IST. A close is never traded the
   same day (enforced in code, by DB constraint, and by tests).
6. DAY limit orders: buys at reference +0.5%, sells at reference −3% (protected marketable).
   Liquidation uses −10%, clamped to the exchange band.
7. Sizing: each slot gets ₹12,500 ÷ 2 = ₹6,250, rounded **down** to whole units after estimated charges.
   Holdings that stay selected are not topped up.

**Holding period:** typically weeks, because changes happen only on rebalance sessions or trend breaks.

### Small capital and whole units

* A ₹6,250 slot buys 21 units of a ₹290 ETF (₹6,090), but only 3 units of a ₹1,985 ETF (₹5,955):
  up to one unit's price can sit idle.
* One round trip on ₹6,250 costs about ₹29 (≈0.46%): STT ₹6 each way, stamp ≈₹0.94, DP ₹15.34 on the
  sell day, and small exchange/SEBI/GST amounts.
* The **₹500/month data plan is 2% of ₹25,000 every month** (about 0.1% per session). Running costs,
  not trading charges, are the largest drag at this size.

## Provisional research risk controls (not approved live limits)

| Control | Value | Behaviour |
|---|---|---|
| Max invested | ₹12,500 (cost basis + pending buy reservations) | Buys beyond this are rejected |
| Pause entries | 5% below peak **economic** equity | No new buys; exits continue; a human must resume |
| Halt | 10% below starting economic capital (₹22,500) | Cancel pending buys, liquidate, end as HALTED |
| Never | margin, borrowing, short selling, F&O, withdrawals | Rejected by the paper broker |

Exit thresholds are **not** guaranteed prices: gaps, price bands and thin liquidity are simulated, so a
liquidation can fill below the trigger or take more than one session.

## Experiment rules

* 20 regular NSE sessions counted from the first session after the official start. Holidays and
  weekends don't count. Special sessions (e.g. Muhurat) are recorded but don't count, and the strategy
  doesn't trade them.
* Reviews are generated after sessions 5, 10 and 20. Reviews never change parameters.
* Results persist across restarts; nothing is reset or deleted. Sessions missed while offline are still
  counted, marked DEGRADED, and get no retroactive fills.
* The strategy, risk controls, universe, signal code and fee schedule are frozen by SHA-256 at creation.
  Any material change = a new experiment (`--supersedes <old id>`); the old one is preserved.
* DEMO/MOCK experiments never count. An OFFICIAL experiment requires live data (DB constraint) and every
  readiness check: frozen spec, calendar coverage, **human-verified calendar**, live data, Kite auth,
  quotes for all ETFs, enough price history, execution self-test, accounting reconciliation, and no other
  official experiment running.
* Even strong results over 20 sessions would not show that returns are sustainable.

## Backtesting

* Chronological periods fixed in advance: TRAIN 2014–2019, VALIDATION 2020–2022, EVALUATION
  (hold-out) 2023-01-01 to 2026-09-30. Parameters were chosen a priori, not tuned.
* EVALUATION runs need `--confirm-holdout` and are counted on the dashboard.
* Each run reports two views: **raw strategy** (no running costs, no pause/halt) and **experiment rules**
  (₹500/month running costs + pause/halt).
* Survivorship: the four ETFs exist throughout; the risk is *selection* bias (choosing well-known
  survivors). This is noted rather than hidden.

### Findings so far (MOCK data only; these say nothing about real markets)

| Run | Trading return | Economic | Benchmark | Max DD | Sessions ≥ +10% |
|---|---|---|---|---|---|
| TRAIN, raw strategy, 2014–2019 | +32.5% | +32.5% | +37.5% | 8.6% | 0 |
| TRAIN, experiment rules | +0.9% | −10.2% (halted 16 Jun 2014) | +0.8% | 10.2% | 0 |

The important finding: under the experiment rules, the **₹500/month running cost alone** reaches the
10% halt within about 5 to 6 months, whatever the strategy does. Real-data backtests need the Kite
Connect plan (historical candles) or CSV files you download yourself.
