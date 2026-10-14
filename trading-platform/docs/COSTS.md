# Itemised costs

Nothing below has been purchased. Each item needs your approval first.
**Verified** = read from the provider's official page on 2026-10-14. **Estimate** = my assumption.

## Monthly running costs (operating, reduce *economic* performance)

| Item | Price | Status | Notes |
|---|---|---|---|
| Kite Connect plan (market data + historical candles) | ₹500 / month | **Verified** ([zerodha.com/charges](https://zerodha.com/charges/)) | Required for real quotes. The page does not say whether GST is added. The free Personal plan has no market data |
| Cloud server, DigitalOcean Basic 1 GiB (Bangalore) | US$6 / month | **Verified** USD price ([pricing page](https://www.digitalocean.com/pricing/droplets)) | ≈ ₹528 at an **assumed** ₹88/US$; plus 18% GST on foreign digital services ≈ ₹623 (**estimate**) |
| Alternative: AWS Lightsail 1 GB with IPv4 | US$7 / month | **Verified** USD price ([pricing page](https://aws.amazon.com/lightsail/pricing/)) | Mumbai plans get half the data transfer allowance. ≈ ₹727 with GST (**estimate**) |
| Server backups (DigitalOcean weekly backups) | ~20% of server price | **Estimate** | ≈ US$1.20. Or copy the nightly DB backup off-server for free with `deploy/backup.sh` |
| AI summarisation | ₹0 | Not used | No AI API is called in this version |
| Alerts (email/Telegram) | ₹0 | Not enabled | Drafted only, needs your approval |

**Estimated total ≈ ₹1,125 to ₹1,250 per month** (Kite ₹500 + server ₹623 + optional backups ≈ ₹125).
That is **≈ 4.5% to 5% of ₹25,000 every month**, or about 0.2% per trading session the strategy must
earn just to break even economically.

## One-off setup costs (reduce *all-in* performance only)

| Item | Price | Status |
|---|---|---|
| Software, libraries | ₹0 | Open source |
| Domain name (optional; HTTPS also works on a free subdomain) | ~₹800 to ₹1,200 / year | **Estimate** |
| Static IP | ₹0 | Not needed: Zerodha requires a static IP only for *placing orders*, which this app never does |

## Ways to spend less

* **Run on your own computer** during market hours (₹0 hosting). The trade-off is that the computer must
  stay on and online from 08:45 to 15:50 IST on every session, or sessions are recorded as DEGRADED.
* Keep the cloud server only for the 4-week experiment, then destroy it (backup first).
* Zerodha has announced developer credits for active traders (₹500 credit when monthly brokerage is
  ≥ ₹2,000). Delivery-only paper trading generates no brokerage, so **don't count on it**.

## Recording costs once incurred

```bash
tradelab expense-add --scope OPERATING --category API --description "Kite Connect" \
  --amount-rupees 500 --basis MONTHLY --start 2026-10-20 --verified --source-url https://zerodha.com/charges/
tradelab expense-add --scope SETUP --category DOMAIN --description "domain 1 yr" \
  --amount-rupees 999 --basis ONE_OFF --start 2026-10-20 --verified
```
