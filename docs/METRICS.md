# Metric definitions

All Command Centre figures are live queries over persisted records, scoped to what the viewer may see and to the brand view (primary or guest-facing brand), excluding archived trips. Each count links to the trip list view with the identical status set (`src/lib/domain/trip-views.ts`).

| Metric | Definition |
|---|---|
| Active trips | Status in enquiry … reconciliation (everything except closed, cancelled, lost). |
| Awaiting quotation | draft_itinerary, costing, internal_review, quote_ready. |
| Awaiting client | quote_issued, awaiting_decision, provisional_hold. |
| Confirmed & operating | confirmed, pre_trip, in_progress. |
| Departing within 30 days, not confirmed | Sales-stage status and start date within the next 30 days. |
| No responsible trip manager | Open trip with `manager_id` null. |
| Confirmed without commercial approval | Confirmed-or-later (not closed) with no approval — only possible via a recorded override. |
| Sales pipeline | Sum of `estimated_value` on sales-stage trips, per currency. **Manager estimates — not quotes, not revenue.** Never converted across currencies. |

Not yet available (needs phase 6+ data): sales, confirmed booking value, gross profit/margin, balances, target progress, forecasts.
