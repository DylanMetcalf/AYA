# ULTIMA Experience Operations Platform

Internal multi-brand operations platform (ULTIMA, AYA, Schmidt Car Hire). Read `docs/IMPLEMENTATION_PLAN.md` first — it is the ledger of what's done and what's next. Business unknowns live in `docs/OPEN_DECISIONS.md`: never hardcode answers to them.

## Commands
- `npm run dev` / `npm run build` / `npm run typecheck` / `npm run lint`
- `npm test` (unit + integration; integration resets `TEST_DATABASE_URL`, whose name must contain "test")
- `npm run test:e2e` (needs a build, seeded dev DB; set `PW_CHROMIUM` to the pre-installed Chromium if needed)
- `npm run db:generate` after schema edits, then `npm run db:migrate`; `npm run db:seed`; `npm run db:seed:demo` (opt-in, flagged demo data)
- Local Postgres 16: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/ultima -o '-p 5432 -k /tmp' start"`

## Conventions
- Next.js 16: `params`/`searchParams`/`cookies()` are async; use `PageProps<"/route">`. Middleware is `proxy.ts` (none yet).
- Layers: `app/` (presentation only) → `server/services/*` (validate with Zod → `requirePermission` → transaction → `audit()`) → `server/db`. Pure rules in `src/lib`.
- Services take `(db, actor, …)` explicitly. Every trip read goes through `tripScope(actor)`; out-of-scope ids must yield `not_found`.
- Server actions: `requireActor()`, call the service, map errors with `toActionError`; forms submit via `startTransition` (avoids React's form reset on error).
- Money: `numeric` + currency column; maths only in `src/lib/finance` with decimal.js; never JS floats.
- Status changes only via `transitionTrip` (rules in `src/lib/domain/trip-lifecycle.ts`). Writes that edit a trip check `expectedVersion`.
- Brand colours come from the `brands` table. Demo records set `is_demo`.
- No dead buttons: unbuilt modules show as disabled nav with their phase.
- Never commit `.env`; never log secrets or tokens in audit events.
