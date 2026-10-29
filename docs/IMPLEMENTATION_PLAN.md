# Implementation plan & ledger

## Status (2026-10-29)
| Phase | Scope | Status |
|---|---|---|
| 0 | Audit, architecture, docs, open decisions | **Done** |
| 1 | Design tokens, shell, navigation, primitives, Command Centre layout | **Done** |
| 2 | Schema + migrations, auth (sessions, invites, deactivation), RBAC, companies/brands, guests, audit | **Done** (supplier tables exist; supplier services/UI in phase 5) |
| 3 | Trips: create/edit/list/views, workspace, lifecycle + gated transitions with audited override, commercial approval, duplicate, archive, search | **Done** (opportunities as a separate entity deferred — trips in sales stages serve as the pipeline for now) |
| 4 | Trip Studio: itinerary days/components, typed component schemas, ordering, versions, guest preview | Next |
| 5 | Suppliers, services, destinations, versioned rates, review/approval, change impact | |
| 6 | Finance engine (decimal.js), FX records, costing, margin vs markup, quotes with immutable snapshots, PDFs, payments, balances | |
| 7 | Tasks, readiness checklists, run sheets | |
| 8 | Vehicles, allocation calendar, exclusion-constraint conflict prevention, inspections | |
| 9 | Inventory ledger and trip allocations | |
| 10 | Targets, performance, forecasting, reports | |
| 11 | Integrations (Xero, FX, Places, email, AI) — needs credentials | |
| 12 | Hardening, deployment, backups, UAT | |

## Verified this session
- `npm run typecheck`, `npm run lint`: clean. `npm run build`: succeeds.
- Unit 17/17, integration 18/18 (real Postgres 16, migrations applied from scratch), e2e 2/2 (Chromium).
- `npm audit --omit=dev`: 0 vulnerabilities.

## Known limitations
- Login rate limiter is in-memory (single instance only).
- No email: invitations show a single-use link to the admin.
- Lifecycle gates for quotes return "no quote" until phase 6; management can override with a recorded reason.
- Trip Studio/suppliers/finance/etc. nav entries are disabled with phase labels.
- Not deployed; no backups configured.

## Next step
Phase 4: add `itineraries`/`itinerary_days`/`itinerary_components` schema (component `type` + typed JSONB `details` validated per type with Zod), service with ordering and move-between-days in transactions, and the Trip Studio day-by-day editor on `/trips/[id]/studio`.
