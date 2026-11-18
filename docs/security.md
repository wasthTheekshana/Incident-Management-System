# Security controls and where they live

| Concern | Control | Location |
|---|---|---|
| Passwords (NFR-2) | argon2id; the company password policy ([password-policy.md](password-policy.md)): 10+ characters with lowercase, capital, number and special character, no part of the name or email, last 3 passwords cannot be reused, 90-day expiry, 1-day minimum age; temporary passwords (admin-typed or generated) must be changed at first login and are shown to the admin once, never stored in clear text | `auth/password.policy.ts`, `auth/password.service.ts` |
| Brute force (NFR-2) | 3 failed sign-ins lock the account until an admin unlocks it (counter resets after 5 minutes); per-route throttling (10/min on auth routes, 300/min global); lock/inactive/unknown all return the same message; dummy hash verify equalises timing | `auth/auth.service.ts`, `app.module.ts` |
| Sessions (FR-3) | 256-bit random token, only its SHA-256 stored; `HttpOnly`, `SameSite=Strict`, `Secure` in production; idle timeout (configurable) + 12 h absolute; revoked on deactivate / password change | `common/session.guard.ts` |
| CSRF | SameSite=Strict cookie + Origin check on state-changing requests + JSON-only API | `main.ts` |
| Access control (NFR-3) | Global session guard → role guard → `AccessPolicy` scoping every query; out-of-scope records return 404, not 403 | `common/*`, `incidents/incident-loader.service.ts` |
| Input validation | Global `ValidationPipe` (whitelist + forbidNonWhitelisted); template field values validated server-side against the template version; unknown keys rejected | `main.ts`, `templates/field-values.validator.ts` |
| Injection | Prisma parameterised queries only; no raw SQL; emails are plain text with substitution only; UI renders user text as text, never HTML | – |
| Uploads (NFR-4) | Type from file *content* (magic bytes), extension must agree, size/count limits, random server-side names, stored outside web root, authorised streaming download with `nosniff` + forced attachment | `attachments/*` |
| Export | Same visibility filter as the list; formula-injection neutralised (`= + - @`) | `incidents/incident-export.service.ts` |
| Audit (FR-33) | Append-only history written in the same transaction as the change | `incidents/incident-history.service.ts` |
| Audit log | Every state-changing request and every sign-in, failed sign-in, sign-out and password event is recorded with who, what, when and IP; secrets are never stored; no update or delete exists. Super Admin sees all, an Admin sees their companies and their own actions | `audit/*` |
| Transport (NFR-1) | HSTS, CSP, `X-Frame-Options`, `nosniff` headers; production refuses to start with `COOKIE_SECURE=false` | `frontend/nginx.conf`, `config/env.validation.ts` |
| Secrets | Env-only, validated at boot, `.env` git-ignored; seed never hardcodes a password | `.env.example` |
| Shared-network isolation | The API shares `shared-nginx` with other apps, so it answers only requests carrying the Nginx-set `PROXY_KEY` header (403 otherwise); Nginx overwrites `X-Forwarded-For`, so client IPs and rate limits cannot be forged by neighbouring containers | `common/proxy-key.middleware.ts`, `deploy/dok-nginx-ims.conf` |
| Containers | Non-root user, read-only root FS, all capabilities dropped, resource limits, internal network, only `web` published (loopback) | `docker-compose.prod.yml` |
| Account enumeration | Forgot-password always answers identically; reset tokens are single-use, hashed, 30-minute expiry | `auth/auth.service.ts` |

## Known gaps / to confirm before go-live

- Backup, restore and restore-test scripts exist (`scripts/`, see [operations.md](operations.md)); scheduling them,
  copying backups off the host, monitoring and the TLS proxy are still deployment tasks on the target server.
- Dependencies were audited (see [dependency-audit.md](dependency-audit.md)): 3 patched, the remainder documented as
  not reachable. A penetration test by an independent party is still recommended before UAT.
- Retention (≥ 3 years) is satisfied by never deleting incident data; an archival policy is still to be agreed.
