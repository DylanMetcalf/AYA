# Implementation roadmap (continuation build)

Order chosen so each step unlocks the next; every step ends with typecheck + tests.

1. **Design system** — new tokens (graphite/cool grey/indigo, Inter), shell & grouped nav, toast, skeleton loading. *Verify:* contrast script, screenshots.
2. **Suppliers & rates** — supplier CRUD + contacts, services, versioned rates (draft → approved → superseded), review queue, rate-change impact. *Verify:* integration tests for version history and approval permissions.
3. **Finance engine** — `src/lib/finance`: decimal money, rate-basis quantity, FX conversion with buffer, margin vs markup, rounding (half-up to 2dp). *Verify:* unit tests incl. R10 000 → 20% markup R12 000 / 20% margin R12 500.
4. **Trip Studio** — itinerary days + components (typed details, brand/provider/supplier per segment, booking status), reorder/move with keyboard buttons, cost per component from rate or manual, costing summary. *Verify:* integration + e2e.
5. **Quotes** — versioned quotes, JSONB snapshot with locked FX, approve/issue/accept/decline/revise; lifecycle gates use real quote state; guest-facing preview (print to PDF). *Verify:* snapshot invariance after rate change.
6. **Payments & balances** — client receipts and supplier payments, idempotency key. 
7. **Fleet** — vehicles, allocations with `btree_gist` exclusion constraint incl. buffer, inspections with critical defects blocking readiness, audited override.
8. **Operations** — tasks (assign, due, status), trip readiness summary, run sheet (print view).
9. **Inventory** — items + movement ledger, trip reservations, no negative stock.
10. **Business** — budgets per trip (planned vs actual), targets + simple forecast, reports page, audit log page.
11. **Audits 1–4**, demo dataset, screenshots, PPTX deck, handover.

Out of scope this build (documented as future): Xero sync, live FX provider, Google Places, email, file storage, AI extraction, MFA.
