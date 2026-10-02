# Sample data used in the showcase

**Every figure in this video is illustrative. None of it is live Tropicool Treats data.** No PINs, credentials, customer details or real staff records were used, and nothing was read from the production site or backend.

## Where the numbers come from

| Data | Source | Notes |
|---|---|---|
| 7-day sales, net sales, discounts, refunds, orders, labour, COGS, forecast | The app's own draft-mode sample (`sampleFinancials` and `loadDashboard` in `ManagerOverviewDashboard`, `src/App.tsx`) | Identical values, so the dashboard matches what the app shows in draft mode |
| Daily series, forecast days, daily expenses | Same draft sample | Dates fixed to 26 Sep to 6 Oct 2026 |
| Channel split (Square POS, Uber Eats, Bopple, DoorDash) | Same draft sample | Shares 58%, 26%, 11%, 5%; 412 orders |
| Recent transactions | Same draft sample | Times fixed; order numbers TT-9270 to TT-9275 |
| Stock items and opening checklist | The app's `src/lib/draft-data.ts` | Product names only |
| Today view | Derived from the same series | Gross $2,313.00, net = gross × 0.965 (the app's sample rule), 68 orders from the sample series. Labour $468.00 and refunds $21.00 are illustrative |
| Staff names | **Invented** | Jordan Lee, Priya Shah, Sam Taylor, Mia Chen. The draft sample's staff-performance names were not used |
| Locations and their totals (scene 7) | **Invented** | Flagship store, Second location, Delivery kitchen |
| Recommended next steps (scene 6) | **Illustrative** | Derived from the priority signals and forecast |

## Derived figures (calculated the same way as the app)

7-day view:

| Card | Value | How |
|---|---|---|
| Gross sales | $13,780.00 | Sample |
| Net sales | $13,298.00 | Sample |
| Orders | 412 | Sample; $32.28 average order |
| Labour cost | 20.0% | $2,760.00 ÷ $13,780.00 |
| Product COGS | $3,476.00 | Sample; 27.1% of mapped sales |
| Gross profit | $9,822.00 | $13,298.00 − $3,476.00 |
| Allocated rent | $1,652.96 | $7,150 a month spread by day across 5 September days and 2 October days |
| After labour and rent | $5,409.04 | $9,822.00 − $2,760.00 − $1,652.96 |
| Refunds | $126.00 | 0.9% of gross sales |
| Sales target | 115% | $13,780.00 of $12,000.00 |

Today view (Friday 2 October): gross $2,313.00, +19% on yesterday's $1,937.00, 116% of the $2,000.00 daily target, net $2,232.05, COGS $604.89, gross profit $1,627.16, rent $230.65, after labour and rent $928.51.

Scene 7 totals: $13,780.00 + $9,640.00 + $6,210.00 = $29,630.00.
