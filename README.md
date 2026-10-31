# CIMS – Centralized Incident Management System (Phase 1)

Implements `SRS_CIMS_Phase1.docx` (SRS-2026-CIMS-P1 v1.0).

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript (Vite), React Router, TanStack Query |
| API | NestJS 11 (TypeScript), Prisma ORM |
| Database | PostgreSQL 16 |
| Queue / worker | BullMQ on Redis (email delivery, SLA scan every minute) |
| Packaging | Docker (non-root, read-only API container) |

## Run locally

```bash
docker compose -f docker-compose.dev.yml up -d        # Postgres :5433, Redis :6380
cd backend
cp .env.example .env                                  # set SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_PASSWORD)
npm install
npx prisma migrate dev
npm run seed                                          # companies, SLA defaults, Super Admin
npm run start:dev                                     # http://localhost:3000/api

cd ../frontend
npm install
npm run dev                                           # http://localhost:5173
```

Outgoing mail needs an SMTP server. For a local inbox:
`docker compose -f docker-compose.dev.yml --profile mail up -d` then open http://localhost:8025.

## Tests

```bash
cd backend && npm test      # SLA calculation, stage workflow, field validation, file signatures, export safety
cd frontend && npm test
```

## Deploy

See `docker-compose.prod.yml` and `.env.prod.example`. Put a TLS-terminating proxy (TLS ≥ 1.2) in front of `web`.
Migrations run as a separate `migrate` step before the API starts.

## Layout

```
backend/src
  common/        session + role guards, AccessPolicy (the one place data-visibility rules live)
  auth/          login, lockout, password reset, argon2id hashing
  users/ companies/ templates/ root-causes/ settings/
  incidents/     create/list/detail, actions (stage, priority, assign), history, export, pure SLA + workflow rules
  attachments/   content-sniffed uploads, authorised download
  notifications/ rule-driven recipients, in-app inbox, BullMQ email worker
  sla/           SLA config + per-minute monitor
frontend/src     api client, auth context, pages (incident flow, admin screens)
```

## Decisions beyond the SRS

- **Sessions** are server-side records in an `HttpOnly; SameSite=Strict` cookie, not JWTs, so idle timeout (FR-3) and
  deactivation take effect immediately.
- **Attachment on create** is a second request (`POST /incidents/:id/attachments`) after the incident is created.
- **Priority change** recalculates due times from creation but keeps time already spent in Pending.
- **Deactivating a user** also clears them as any company's Responsible/backup person.
- **Default notification audiences** (editable by Super Admin): see `notification.defaults.ts`.
- **Incident numbers** use the Sri Lanka calendar year.
