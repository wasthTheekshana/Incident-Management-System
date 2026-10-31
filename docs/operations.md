# Operations runbook

For whoever deploys and looks after CIMS. Security controls are in [security.md](security.md).

## 1. First deployment

Prerequisites: a Linux host with Docker + Docker Compose, a DNS name, a TLS certificate, and an SMTP account.

```bash
git clone <repo> /opt/cims && cd /opt/cims
cp .env.prod.example .env        # fill in every value; use long random passwords
chmod 600 .env
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d      # runs migrations first, then starts api + web
```

Create the first Super Admin (one time):

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e SEED_ADMIN_EMAIL=you@company.com api node prisma/seed.js
```

This also creates the two companies, the default SLA times and a starter root-cause list. It is safe to re-run (it
never overwrites existing data). The temporary password is printed once; the account must change it at first login.
Set `SEED_ADMIN_PASSWORD` too if you prefer to choose it yourself.

### HTTPS

`web` listens on `127.0.0.1:8080` only. Put a TLS-terminating proxy in front (TLS 1.2+, NFR-1). Minimal Caddy example:

```
cims.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

The API refuses to start in production with `COOKIE_SECURE=false`, and the compose file sets it to `true`; session
cookies therefore only travel over HTTPS.

## 2. Configuration that lives in the app (Super Admin screens)

Priority/SLA times, notification recipients and email text, root-cause lists, session idle timeout, attachment limits.
None of these need a redeploy (NFR-12).

## 3. Backups (NFR-9: daily, kept at least 30 days)

```bash
./scripts/backup.sh          # database dump + attachments archive into ./backups, prunes after 30 days
```

Schedule it daily and copy `./backups` **off the host** (a backup on the same disk is not a backup):

```
15 1 * * *  cd /opt/cims && ./scripts/backup.sh >> /var/log/cims-backup.log 2>&1
```

Backups contain personal data: keep them owner-only (the script sets `umask 077`) and encrypt them in transit/at rest
wherever they are copied to.

### Prove a backup works (do this before go-live, then weekly)

```bash
./scripts/restore-test.sh    # restores the newest dump into a scratch database, compares row counts, drops it
```

It never touches the live database. A failing run exits non-zero; wire it to an alert.

### Restore after a failure

```bash
./scripts/restore.sh --yes backups/cims-db-<stamp>.dump backups/cims-files-<stamp>.tar.gz
```

This **replaces** the current database and attachments, stopping and restarting `api` and `web`. Without `--yes` it
refuses to run. Expect to lose anything created after the backup was taken.

## 4. Upgrades and rollback

```bash
git pull
docker compose -f docker-compose.prod.yml build
./scripts/backup.sh                                   # always back up first
docker compose -f docker-compose.prod.yml up -d       # migrations run before the new api starts
```

Rollback: check out the previous tag, rebuild, and if the release included a migration that must be undone,
`./scripts/restore.sh` from the backup taken just before upgrading. (Migrations are forward-only.)

## 5. Monitoring checklist

| What | How |
|---|---|
| Is it up | `curl -s -o /dev/null -w '%{http_code}' https://<host>/api/auth/me` → `401` means the API is answering |
| Email delivery | Failed emails are marked `FAILED` in the `Notification` table after 5 retries with backoff |
| SLA alerts | The per-minute scan logs `SLA scan raised N alert(s)` when it fires |
| Disk | Watch the `pgdata`, `uploads` volumes and `./backups` |
| Logs | `docker compose -f docker-compose.prod.yml logs -f api` |

## 6. Known limits

- SLA timers use calendar time (24 h), not working hours (SRS assumption; deferred).
- Attachments are stored on a local Docker volume. For multi-host deployments move them to S3-compatible storage
  (the storage code is isolated in `backend/src/attachments`).
