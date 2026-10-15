# Verification, test results and known limitations

## External facts checked on 2026-10-14

| Fact | Result | Source |
|---|---|---|
| Kite Connect sandbox | **Unconfirmed.** Official FAQ and support article (checked 15 Oct 2026) say none exists. A 17 Sep 2026 reply on tradingqna.com said it was "actively" in development, "available in coming weeks". The user reports it now exists; no public URL or docs found yet | [FAQ](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs), [support article](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/api-sandbox), [forum](https://tradingqna.com/t/eta-for-sandbox-environment/198193) |
| Free Personal plan | Orders/portfolio only; **no live or historical market data** | same FAQ |
| Connect plan | ₹500/month per app; WebSocket + historical candles included | same FAQ; [zerodha.com/charges](https://zerodha.com/charges/) |
| Login flow | Redirect to `kite.zerodha.com/connect/login`, `request_token` → `POST /session/token` with SHA-256 checksum | [Kite user docs](https://kite.trade/docs/connect/v3/user/) |
| Token expiry | 06:00 IST next day (regulatory); 403 TokenException means log in again | Kite user docs, [exceptions](https://kite.trade/docs/connect/v3/exceptions/) |
| Rate limits | Quote 1 req/s, historical 3 req/s, others 10 req/s | Kite exceptions page |
| Static IP | Required only for **placing orders** (from 1 Apr 2025). Not needed here | Kite FAQ |
| Delivery charges | Zero brokerage; STT 0.1% both sides; NSE txn 0.00307%; SEBI ₹10/cr; stamp 0.015% buy; GST 18%; DP ₹15.34 | zerodha.com/charges |
| 2026 NSE holidays | Circular NSE/CMTR/71775 (12 Dec 2025) + NSE/CMTR/72260 (15 Jan 2026 added) | Search excerpts + secondary calendars. **nseindia.com returned 403 to automated access, so a human must confirm** |
| Hosting prices | DigitalOcean $6/mo (1 GiB); Lightsail $7/mo (1 GB, IPv4), half transfer in Mumbai | official pricing pages |

**Not verified:** ETF-specific STT (equity rate applied, which is conservative); NSE IPFT rate (₹10/crore
assumed, which is conservative); GST on the Kite fee; USD→INR rate (₹88 assumed); the 2026-08-26
holiday that one secondary source listed (excluded, and past anyway); Muhurat 2026 timings.

## Automated tests: `pytest -q`, 69 passed (and `mypy --strict`: no issues in 44 files)

| Area | Tests |
|---|---|
| Accounting & expenses | hand-calculated charges; DP once per scrip-day; round-trip reconciliation; duplicate posting refused; tampering detected; opex accrues on weekends; setup costs charged once across experiments; three layers don't double count; flow-adjusted returns |
| Sizing & risk | whole-unit sizing; ₹12,500 cap including pending reservations; no short sale; no margin; price band; 5% pause; 10% halt cancels buys and requests liquidation; no resume after halt; pause ≠ cancel ≠ liquidate |
| Orders | duplicate intent → same order; partial fills; latency; stale quote → no fill; touch ≠ fill; gap fills; volume cap |
| Data/auth | stale data blocks entries; token expiry blocks entries + incident + auto-resolve; disconnect → no crash, no fills; 06:00 IST expiry |
| Restart | crash mid-session → restart two days later → missed sessions closed DEGRADED, orders expired, books reconcile, recovery idempotent, no duplicate orders on re-submit |
| Calendar/timezone | holidays, weekends, special sessions, coverage error for 2027, UTC↔IST boundaries at 09:15/15:30, 20-session count skips Dussehra and Diwali |
| Look-ahead | future bar raises; data after cutoff can't change a signal; DB rejects `data_through >= valid_for`; changing day D's close doesn't change trades up to D in a backtest |
| Safety | 12 order/GTT/margin endpoints blocked with zero network calls; allowlist audit; source scan for order code; no order routes in the web app; research can't import trading code; research flags can't affect trading; OFFICIAL+MOCK rejected; strategy edit blocks trading; secrets absent from every page and CSV |
| Web | auth required; all pages render; CSV reports; CSRF on controls; controls audited |

Full 20-session forward run on mock data (FakeClock, Oct 14 → Nov 12, 2026): **COMPLETED** with
sessions 1 to 20, holidays skipped, reviews at 5/10/20.

## Browser check

Chromium (Playwright) at 1280×900 (light) and 390×844 (dark): all 7 pages return 200 with no console
errors and no horizontal scroll, after fixing mobile overflow, crowded chart labels and a missing-favicon
404. Screenshots are in `screenshots/` (not committed).

## Known limitations and verification gaps

* **No real market data was used.** Every result so far is MOCK. The Kite adapter is tested against
  documented response shapes with a fake transport only, so its first real use must happen in DEMO mode.
* **The Docker image was not built**: no Docker daemon was available in the build environment.
* **Calendar** is a transcription; it needs human verification, and a 2027 file is needed before
  experiments run past December 2026.
* Backtest limits are set from the previous close, so a split's ex-date can give odd limits for that one
  day. Corporate actions must be entered by hand from official sources (none are entered yet).
* Dividends are credited on the ex-date rather than the payment date.
* Kite quotes give 5 depth levels; hidden liquidity and queue position aren't modelled (conservative).
* Intraday halt checks run once a minute, so prices can move further between checks.
* The heuristic research tagger is keyword-based and will misclassify. No AI summarisation is
  implemented, and research coverage is manual for NSE/BSE.
* Single-user design: one dashboard login and a SQLite database.
