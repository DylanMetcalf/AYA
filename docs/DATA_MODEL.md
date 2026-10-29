# Data model

Source of truth: `src/server/db/schema/*.ts` → SQL migrations in `drizzle/`. This file explains intent.

## Implemented (migration 0000)
| Domain | Tables | Key rules |
|---|---|---|
| Organisation | `legal_companies`, `brands` | Brand → optional legal company. `legal_companies.group_role` (central_operator / group_company / connected_partner / supplier / other) and `verified` flag. Brands carry their own colours/identity and an `is_provisional` flag. |
| Identity | `users`, `roles`, `role_permissions`, `user_roles`, `sessions`, `invitations` | Email unique case-insensitively. Permissions are strings from the code catalogue. Session/invite tokens stored only as SHA-256 hashes. |
| Audit | `audit_events` | Written in the same transaction as the change; `category` = business \| security. |
| Guests | `client_organisations`, `guests` | Sensitive columns (`dietary`, `accessibility`, `medical_notes`) redacted server-side without `guest.read_sensitive`. |
| Suppliers | `suppliers`, `supplier_contacts`, `supplier_services`, `supplier_rates` | Rates versioned by `lineage_id` + `version` (unique); typed (`public`, `trade`, `contracted`, `indicative`…) and statused (`draft` → `approved` → `superseded`). Schema only; services/UI arrive in phase 5. |
| Trips | `trips`, `trip_brands`, `trip_guests`, `trip_assignments`, `trip_status_history` | Commercial context on the trip: `primary_brand_id`, `guest_facing_brand_id`, `operating_company_id`, `quoting_company_id`; extra brands in `trip_brands` with role `participating` / `supplying`. `version` column for optimistic concurrency. CHECK constraints on dates and party size. Reference from `trip_reference_seq` (`ULT-YYYY-NNNN`). |

## Money
`numeric(14,2)` amounts, `varchar(3)` currency alongside every amount. Maths only via `src/lib/finance` (phase 6, decimal.js). Display via `formatMoney`, which never parses to float.

## Planned (later phases)
Itinerary (`itineraries`, `itinerary_days`, `itinerary_components`), quotes (`quotes`, `quote_versions` with immutable JSONB snapshot + locked FX), `currency_rates`, payments (`client_receivables`, `supplier_payables`, `payment_records` with idempotency key), tasks/checklists, fleet (`vehicles`, `vehicle_allocations` with a `btree_gist` **exclusion constraint** preventing overlapping confirmed allocations incl. turnaround buffer), inventory (`inventory_items`, `inventory_movements` ledger), targets/forecasts, `integration_connections` + `integration_sync_logs`, documents/files.
