# Deploying CIMS on the DOK shared server (ims.testsys.shop)

Follows the DOK Docker deployment rules: no published host ports, one shared Nginx and Certbot, data on the data disk,
CPU and memory limits on every container. Commands are plain ASCII, one per line, so they can be pasted as they are.

Stack folder: `~/ims-stack` (repo clone). Shared Nginx: `~/dok-stack`. Containers: `ims-postgres`, `ims-redis`,
`ims-migrate` (one-shot), `ims-api`, `ims-web`.

Resource budget (limits, not reservations): postgres 1 CPU / 2 GB, redis 0.5 / 512 MB, api 1.5 / 1 GB,
web 0.25 / 128 MB, migrate 0.5 / 512 MB. Check `docker stats --no-stream` against the other stacks before first start.

## 1. Before you start

1. DNS: an A record for `ims.testsys.shop` pointing to `34.93.171.14`.

```
nslookup ims.testsys.shop
```

2. Check the data disk is mounted. If it is not, STOP: Postgres would start on an empty folder on the boot disk.

```
findmnt /mnt/disks/data
grep disks/data /etc/fstab
df -h /mnt/disks/data
```

3. Mail. The app emails temporary passwords and password-reset links, so an SMTP account is needed (host, port, user,
   password, from address). Without it nobody can receive a first password.

## 2. Get the code and create the data folders

```
git clone <repo-url> ~/ims-stack
cd ~/ims-stack
sudo mkdir -p /mnt/disks/data/db/ims /mnt/disks/data/db/ims-redis /mnt/disks/data/documents/ims /mnt/disks/data/backups/ims
sudo chown -R 999:999 /mnt/disks/data/db/ims /mnt/disks/data/db/ims-redis
sudo chown -R 1000:1000 /mnt/disks/data/documents/ims
sudo chmod 700 /mnt/disks/data/backups/ims
```

The API image runs as uid 1000 (the `node` user) and Postgres and Redis as uid 999, which is why the owners differ.

## 3. Create .env

```
cd ~/ims-stack
cp .env.prod.example .env
chmod 600 .env
openssl rand -hex 24
openssl rand -hex 24
openssl rand -hex 32
nano .env
```

Fill in the first two generated values for `POSTGRES_PASSWORD` and `REDIS_PASSWORD` (hex only, they go into a URL), the
third for `PROXY_KEY` (the secret the shared Nginx sends so only it can reach the API), the SMTP
settings, and keep `APP_URL=https://ims.testsys.shop`. The API checks `APP_URL` as the only allowed browser origin.
Never commit `.env` and never paste its contents into chat.

## 4. Build and start

```
cd ~/ims-stack
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
docker compose -f docker-compose.prod.yml logs --tail=50 api
```

Migrations run first (`ims-migrate` must show `Exited (0)`), then the API starts. `ims-api` and `ims-web` should become
`healthy` within about a minute. The API health check is `/api/health` (it also checks the database).

Create the first Super Admin, once. The temporary password is printed once; it must be changed at first login.

```
docker compose -f docker-compose.prod.yml run --rm -e SEED_ADMIN_EMAIL=you@company.com api node prisma/seed.js
```

## 5. Nginx and the certificate

The file `deploy/dok-nginx-ims.conf` holds both server blocks. Add PART 1 (HTTP) first so the certificate challenge works.

```
nano ~/dok-stack/nginx/nginx.conf
cd ~/dok-stack
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

In PART 2, replace `PASTE_PROXY_KEY_HERE` with the same value as `PROXY_KEY` in `.env`. The API shares a Docker network with
the other applications, so it refuses any request that does not carry this key (anything that bypasses Nginx gets 403).

First check whether a certificate for the domain already exists. `deploy/dok-nginx-ims.conf` points at
`/etc/letsencrypt/live/testsys.shop/`, which only works if that certificate also covers `ims.testsys.shop` (a wildcard
`*.testsys.shop`). If the second command lists `DNS:*.testsys.shop` (or `DNS:ims.testsys.shop`), skip the issue step below.
If not, the browser will show a certificate warning, so issue one for `ims.testsys.shop` and point PART 2 at its folder.

```
ls ~/dok-stack/certbot/conf/live
openssl x509 -in ~/dok-stack/certbot/conf/live/testsys.shop/fullchain.pem -noout -subject -ext subjectAltName -enddate
```

Only if no suitable certificate exists, issue one (HTTP challenge, no DNS record or waiting needed for a single host name):

```
docker run --rm -v ~/dok-stack/certbot/conf:/etc/letsencrypt -v ~/dok-stack/certbot/www:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot --email wasath@doksolutions.lk --agree-tos --no-eff-email -d ims.testsys.shop
ls ~/dok-stack/certbot/conf/live
```

Check the real folder name under `live/` and use it in PART 2 if it is not exactly `ims.testsys.shop` (a `-0001` suffix
appears after repeated issues). Then add PART 2 (HTTPS), test and reload.

```
cd ~/dok-stack
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

If the browser shows 502 after the app was recreated, Nginx kept an old container address: reload or restart nginx.
Let's Encrypt certificates last 90 days: set a calendar reminder for renewal.

## 6. Verify

```
curl -s -o /dev/null -w "%{http_code}\n" https://ims.testsys.shop/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://ims.testsys.shop/api/auth/me
docker exec ims-web wget -S -O /dev/null http://ims-api:3000/api/auth/me
curl -sI https://ims.testsys.shop/ | head -n 12
```

Expected: `200`, `401` (the API answers and nobody is signed in), the security headers on the page, and a `403 Forbidden`
from the direct call (a container on the shared network cannot talk to the API without the key). Then, in a browser:
padlock shown, sign in, change the password, report a test incident with an attachment, open the dashboard and the audit
log. Confirm nothing is reachable except through Nginx:

```
ss -ltn | grep -E ":(3000|5432|6379|8080)\b"
```

That command should print nothing (no host port is published by this stack).

## 7. Backups (daily, 30 days)

```
cd ~/ims-stack
./scripts/backup.sh
./scripts/restore-test.sh
```

Backups go to `/mnt/disks/data/backups/ims`. Schedule it and add an Uptime Kuma monitor for `/api/health`:

```
crontab -e
15 1 * * * cd ~/ims-stack && ./scripts/backup.sh >> ~/ims-backup.log 2>&1
```

Run `restore-test.sh` once before go-live and then weekly. It restores the newest dump into a scratch database and never
touches the live one. Also copy the backup folder off the server (a GCP disk snapshot of the data disk does this too).

## 8. Updating after a push to main

```
cd ~/ims-stack
git status
git pull origin main
git log -1 --oneline
./scripts/backup.sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 api
```

The migration container runs again on every `up`, so new tables are applied automatically before the API restarts.
`.env` is not in git, so a pull never changes it. Then hard-refresh the browser. Occasionally run `docker image prune -f`
to protect the boot disk.

## 9. Known risks to review

- UFW is inactive on the server (no console fallback if SSH is blocked). This stack does not depend on it.
- Dependency advisories that remain are listed in `dependency-audit.md`; none is reachable by a user.
- Run an independent security test before real data goes in.
- This is a test system (`testsys.shop`). Do not load real personal data until the items above are done.
