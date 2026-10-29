# Product specification — ULTIMA Experience Operations Platform

Internal operating system (not a public booking site) for designing, costing, coordinating and reconciling bespoke journeys across connected businesses. Guiding principle: **one coordinated operating system, multiple connected brands, one seamless guest journey.**

The full original brief is the source of truth for scope; this file records the interpreted model and the primary journeys. Domain detail lives in the other `docs/` files.

## Business structure (modelled, not hardcoded)
- **ULTIMA** — central operating company: trip design, quotations, cost control, supplier coordination, operations, management reporting. Default primary operator.
- **AYA** — safari & wilderness brand ("Private. Personal. Flexible. By invitation only."). Distinct visual identity; operationally connected to ULTIMA.
- **Schmidt Car Hire** — separate specialist vehicle business; supplies vehicles (MGA, MGB, Triumph TR3/TR4…) to journeys but is never the guest-facing operator.

The data model separates **legal company**, **brand** (trading/operating), **supplier**, and **trip-specific commercial role** (primary operator, guest-facing brand, quoting entity, participating brand, supplying company). Ownership, tax and invoicing arrangements are configuration, not assumptions (see OPEN_DECISIONS D1).

## Users
Owner/Admin, Management, Trip Manager, Operations Coordinator, Fleet Manager, Finance, Guide/Field Staff. Individual accounts only. Roles are seeded defaults stored in the DB; permissions are a code catalogue mapped to roles in the DB.

## Primary journeys (priority order)
1. **Enquiry → trip**: capture an enquiry, assign a manager, brand context, dates, travellers. Save and resume.
2. **Design in Trip Studio**: day-by-day itinerary with typed components (accommodation, classic car, helicopter, guide, dining, safari…), each optionally linked to a supplier service + rate.
3. **Cost & price**: rate-basis calculation, multi-currency conversion with recorded rates, target margin or markup, explainable breakdown.
4. **Quote**: approve → issue an immutable snapshot; revisions create new versions.
5. **Confirm & prepare**: lifecycle transitions with rules; supplier confirmations; readiness checklist; tasks; vehicle allocation without overlap.
6. **Operate & reconcile**: run sheets, payments in/out, balances, close.
7. **Manage the business**: Command Centre, targets, forecast, reports.

## Non-goals (current scope)
Public guest portal; online card payments; automated scraping of supplier sites; AI features (no provider configured).

## Definitions of done
A feature is done when it has a working interaction, a persisted data source, server-side validation and authorisation, tests for its business rules, and a status entry in `IMPLEMENTATION_PLAN.md`.
