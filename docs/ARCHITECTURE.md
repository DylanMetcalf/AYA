# Architecture

## Starting point (Phase 0 audit, 2026-10-29)
The repository was empty (no commits, no code). There was nothing to preserve, so the stack below is a greenfield selection.

## Stack
| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 16 (App Router, React 19, Turbopack) | One typed codebase for UI + server; server components keep data access server-side. |
| Language | TypeScript 5.9 (strict) | Type safety across domains. TS 7 skipped until Next supports it. |
| Database | PostgreSQL 16 | Relational integrity, exclusion constraints (vehicle overlap), transactions, JSONB snapshots. |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations in `drizzle/`) | Thin, SQL-first, allows raw SQL constraints; migrations are version-controlled SQL. |
| Validation | Zod 4 | Shared schemas at every server boundary (server actions, route handlers). |
| Money | decimal.js; DB `numeric` | No floating point in financial maths. See `docs/FINANCIAL_ENGINE.md`. |
| Auth | Own DB-backed sessions; argon2id passwords | Individual accounts, revocable sessions, no third-party dependency for a small internal team. Tokens stored as SHA-256 hashes. |
| Styling | Tailwind CSS v4 with CSS-variable design tokens | Tokens in `src/app/globals.css`; brand-aware theming. |
| Fonts | Fraunces (display) + Inter (UI) via Fontsource, self-hosted, SIL OFL | Legal, no runtime Google dependency. Provisional pending brand guidelines. |
| Tests | Vitest (unit + integration against real Postgres), Playwright (e2e) | |

## Shape: modular monolith
```
src/
  app/                 Presentation (routes, layouts). No business logic.
    (auth)/            Login / activation
    (app)/             Authenticated workspace shell
  components/ui/       Design-system primitives
  components/shell/    Navigation, header, context
  lib/                 Pure, isomorphic logic (no DB): finance, lifecycle rules, permission catalogue, formatting
  server/              server-only
    db/                Drizzle schema (by domain) + client
    auth/              Sessions, passwords, current-user, authorisation guard
    services/          Application workflows per domain: validate → authorise → transact → audit
scripts/               migrate, seed
tests/                 unit/, integration/, e2e/
```
Rules:
- Pages and server actions call **services**; services call `authorize()` themselves, so a page that forgets a check still cannot leak data.
- Every multi-step write runs in a DB transaction and writes an `audit_events` row inside the same transaction.
- Financial maths lives only in `src/lib/finance`. Screens never compute money themselves.
- Pure rule modules (lifecycle transitions, permissions, readiness) are unit-tested without a DB.

## Environments
`.env.example` lists variables. `DATABASE_URL` (dev), `TEST_DATABASE_URL` (integration tests), `SESSION_SECRET` is not needed (tokens are random + hashed). Secrets never committed.

## Deployment (not yet done)
Any Node 22 host + managed Postgres 16 works (Render and Supabase connectors exist in the dev environment but nothing has been provisioned — needs an owner decision, see OPEN_DECISIONS). Backups/restore: see `docs/SECURITY.md` §Recovery; not verified until a restore is tested.
