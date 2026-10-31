# Dependency audit

Checked with `npm audit --omit=dev` (production dependencies) on 2026-10-31. CI runs the same check on every push
(report only). Re-run before each release and before UAT.

## Fixed

| Advisory | Package | Fix |
|---|---|---|
| multer DoS via pending async `fileFilter` (high) | `multer` (via `@nestjs/platform-express`) | `overrides` pins `multer ^2.5.0` |
| uuid missing buffer bounds check (moderate) | `uuid` (via `exceljs`) | `overrides` pins `uuid ^11.1.1`; XLSX export covered by a round-trip test |

Result: 14 findings → 11.

## Accepted (not exploitable in this application), with reasons

| Advisory | Package chain | Why it does not apply here | To remove |
|---|---|---|---|
| minimatch ReDoS via glob amplification (moderate, 8 findings) | `exceljs` → `archiver` → `glob` → `minimatch` | Used only while writing the zip container of an XLSX export, with fixed internal paths. No user-controlled glob pattern ever reaches it. | Replace `exceljs`, or drop XLSX and keep CSV (FR-37 allows CSV) |
| DeepmergeTS stack exhaustion on recursive objects (high, 3 findings) | `prisma` → `@prisma/config` → `deepmerge-ts` | Prisma CLI only, at build/migrate time. The running API does not load it, and there is no `prisma.config.ts` to feed it hostile input. | Upgrade to Prisma 7 (major; plan as its own change) |
| React Router SSR `deserializeErrors` constructor injection (moderate, frontend) | `react-router-dom` 6 | Affects server-side-rendered hydration only. The app is a client-side SPA. | Upgrade to React Router 7 (major) |

Dev-only tooling (vite/esbuild dev server, jest) is excluded from this scope; it is never deployed.

## Process

- Review `npm audit` output at each release; anything *high* and reachable blocks the release.
- Pin transitive fixes with `overrides` (as above) when a compatible patched version exists; otherwise document it here.
