# Security, privacy & recovery

## Authentication
- Individual accounts; email + password (argon2id via `@node-rs/argon2`).
- Sessions: 32-byte random token in an `HttpOnly; SameSite=Lax; Secure (prod)` cookie. Only the SHA-256 hash is stored (`sessions.token_hash`), so a DB leak does not yield live sessions. 14-day sliding expiry; revoked on logout and on account deactivation.
- Users are created by invitation (single-use hashed token, 7-day expiry). No self-registration.
- Login is rate-limited per email+IP (in-memory limiter — adequate for a single instance; move to DB/Redis if horizontally scaled).
- Deactivated users: every request re-loads the user; `is_active = false` → session rejected.

## Authorisation
- Permission catalogue in `src/lib/auth/permissions.ts` (e.g. `trip.read`, `trip.edit`, `trip.approve`, `finance.read`, `admin.users`).
- Role → permission mapping stored in DB (`role_permissions`), seeded with defaults, editable by admins (audited).
- Enforced in **services** (`requirePermission`) and by record scoping (Guide role only sees trips they are assigned to). Navigation hiding is cosmetic only.
- Record lookups by id always go through scoped queries so manipulated ids return "not found", not someone else's data.
- Financial fields (cost, margin) are stripped server-side for users without `finance.read_costs`.

## Audit
`audit_events` (actor, action, entity type/id, summary, JSON diff, ip, timestamp) written inside the same transaction as the change. Never stores passwords, tokens or card data.

## Application security checklist
CSRF: Next server actions check Origin; mutating route handlers check Origin too. XSS: React escaping; no `dangerouslySetInnerHTML` with user content. SQL injection: parameterised Drizzle queries only. File uploads: not yet implemented — will use private storage + signed URLs + type/size validation. Errors: users see safe messages; details are logged server-side.

## Privacy (POPIA)
Guest data minimised to operational need; dietary/medical/accessibility fields restricted to `guest.read_sensitive`. Retention policy and Information Officer are open (OPEN_DECISIONS D11) — needs legal review.

## Recovery
Not deployed yet. Requirement for production: managed Postgres with daily automated backups + PITR, 30-day retention, and a **tested** restore into a staging DB before go-live. Recoverability is not claimed until that test is done.
