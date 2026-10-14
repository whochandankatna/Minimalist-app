# Deployment proposal (not deployed; needs your approval and the costs in COSTS.md)

## Recommended setup

* **One small Linux server in India** (DigitalOcean Bangalore 1 GiB, or AWS Lightsail Mumbai 1 GB).
  The app used about 100 MB of RAM when measured locally (mock data) and keeps one SQLite file.
* Docker Compose: the `tradelab` container plus **Caddy** for automatic HTTPS (`deploy/`).
* `.env` exists only on the server (permissions `600`), never in git. It must set
  `TRADELAB_DASHBOARD_PASSWORD`, otherwise the app refuses to listen publicly.
* The server clock can stay in UTC: the app does everything in Asia/Kolkata itself.

## Staging first, then production

1. **Local:** `pytest -q` and `mypy` must pass. Then `tradelab demo-simulate` and look at the dashboard.
2. **Staging = same server, DEMO mode:** deploy with `TRADELAB_MARKET_DATA=mock` and run a DEMO
   experiment for two or three real sessions. Check that jobs fire at the right IST times on the Health
   page, that backups appear, and that `tradelab healthcheck` passes from another machine.
3. **Kite data check, still DEMO:** set `TRADELAB_MARKET_DATA=kite`, log in, run
   `tradelab experiment-readiness` on a DEMO experiment, and watch one full session.
4. **Official start** only after every readiness check passes, including the human calendar verification.
5. **After every deploy:** open the dashboard and check the badges (PAPER / data mode), the Health page
   (scheduler running, last job OK), and `/healthz`. Don't rely on "deploy succeeded" alone.

## Steps (server)

```bash
git clone <repo> && cd <repo>/trading-platform
cp .env.example .env && nano .env && chmod 600 .env
TAG=$(git rev-parse --short HEAD)
docker build -f deploy/Dockerfile -t tradelab:$TAG .
TRADELAB_TAG=$TAG docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml exec tradelab tradelab init
```

## Rollback

Images are tagged by git commit, so rolling back means running the previous tag:

```bash
docker compose -f deploy/docker-compose.yml exec tradelab tradelab backup     # 1. backup first
TRADELAB_TAG=<previous-commit> docker compose -f deploy/docker-compose.yml up -d   # 2. old image
```

The database schema only gains tables or columns in this version. If a future version changes the
schema, restore the matching backup taken just before that deploy (below). **Never roll back during an
official experiment without checking the strategy fingerprint:** a different strategy file blocks
trading by design.

## Backups and restore

* Automatic: nightly at 23:30 IST into `/data/backups/` (30 kept), plus one before every
  `experiment-start`. Manual: `tradelab backup`.
* Off-server: `deploy/backup.sh` (cron at 23:45) copies the newest backup and its SHA-256 elsewhere.
* Restore: stop the container, copy the backup over `/data/tradelab.db`, delete any `tradelab.db-wal`
  and `tradelab.db-shm`, start the container, then run `tradelab reconcile` and `tradelab audit-verify`.
  Restoring an older backup during an official experiment loses later sessions. Record that in the
  experiment notes rather than hiding it.
