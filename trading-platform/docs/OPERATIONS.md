# Operations

## Your daily routine (official experiment, trading days only)

| When (IST) | You | The system |
|---|---|---|
| 06:00 | n/a | Yesterday's Kite token expires (regulatory) |
| 07:00 to 08:40 | Open the dashboard and click **Log in to Kite** | Stores the new token server-side |
| 08:45 | n/a | Prepares the session (signal, corporate actions) |
| 09:20 | n/a | Submits simulated orders *only if* data is fresh and the login is valid |
| During the day | Optional: glance at the Overview | Monitors once a minute, simulates fills |
| After 15:50 | Optional: look at the day's result | Closes the session, plans tomorrow |
| After sessions 5, 10, 20 | Read the review and click **Mark reviewed** | Never changes the strategy |

If you forget to log in, no new entries happen that day. Monitoring and exits still need data, so the
session is recorded as DEGRADED. That is the intended, safe behaviour.

## Health checks

* **Dashboard → Health:** scheduler status, next job times, latest job runs, last quote age, open
  incidents, audit-chain status, data-coverage gaps, alert drafts.
* **`GET /healthz`** (no login, no sensitive data): `{"ok", "db", "scheduler"}`. Use it from a free
  external uptime monitor.
* **Independent probe:** `tradelab healthcheck --url https://<your-domain> --require-scheduler`
  (exit 0 = healthy). It can run from cron on another computer.
* **Integrity:** `tradelab reconcile` and `tradelab audit-verify` (also run nightly).

## Recovery procedure

1. **App crashed or server rebooted:** restart it (`docker compose up -d`; `restart: unless-stopped`
   does this automatically). On startup `recover` reconciles the accounts. Sessions missed while offline
   are closed as DEGRADED with no retroactive fills, and their open orders expire.
2. **Reconciliation failure (CRITICAL incident):** entries are paused automatically. Don't resume.
   Download `ledger.csv`, `orders.csv` and `audit.csv`, restore the latest good backup to a copy, and
   compare. Resume only once `tradelab reconcile` reports consistent.
3. **Kite login failing:** check the API key/secret in `.env` and that the redirect URL matches the Kite
   app exactly. Zerodha has no sandbox, so test the flow on a DEMO experiment.
4. **Strategy fingerprint mismatch (CRITICAL):** someone edited a frozen file. Restore it with
   `git checkout <commit> -- config/strategy src/tradelab/strategy/momentum.py`, or create a new
   experiment if the change was intended.
5. **Stale or missing data:** entries are blocked automatically. Check the Health page and Kite status;
   no action is needed for the experiment's integrity.
6. **Calendar change** (NSE adds or moves a holiday): edit the year file citing the new circular, then
   re-run `tradelab calendar-verify`. The file hash changes, so the old verification no longer counts.

## Alerts (drafted, not sent)

ERROR and CRITICAL incidents create entries under **Alert drafts** on the Health page. No channel is
connected and no message ever leaves the server. Proposed integrations, each needing your approval:

* **Email** via an SMTP provider: send ERROR/CRITICAL drafts, at most one per component per hour.
* **Telegram bot:** same content to a private chat; needs a bot token stored in `.env`.

## Protecting the strategy from changes

* The strategy files are frozen by hash; edits block trading (see above).
* Suggested GitHub settings: protect the default branch, require review for `config/strategy/**` and
  `src/tradelab/strategy/**` (CODEOWNERS), and never let an automated agent merge its own changes there.
