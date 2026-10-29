# Open business decisions

Items that materially affect real-world use. Each has a **safe default** currently implemented (configurable) and must be confirmed by the business before production use.

| # | Decision | Current safe default | Owner |
|---|---|---|---|
| D1 | Legal entities: are ULTIMA, AYA and Schmidt Car Hire separate legal companies? Which entity quotes/invoices guests? VAT registration of each? | Seed creates ULTIMA (Pty) Ltd and Schmidt Car Hire as **separate placeholder legal companies**; AYA is a trading brand of ULTIMA. All marked `verified = false`. | Owner |
| D2 | Official logos, colours, typography | Provisional palette and fonts (see DESIGN_SYSTEM.md). No logos invented; wordmarks rendered as text. | Owner |
| D3 | Base/reporting currency | ZAR. Trips may quote in ZAR, USD, EUR, GBP. | Finance |
| D4 | Default target margin and minimum acceptable margin | No default enforced; per-trip target entered by user. A "below minimum margin" warning threshold is a setting (unset = no warning). | Management |
| D5 | Who may approve quotations and confirm trips? | Roles Owner + Management hold `trip.approve`. Confirmation without approval requires `trip.override` and a recorded reason. | Owner |
| D6 | Deposit policy (client and supplier) | No default percentages; entered per trip/supplier. | Finance |
| D7 | Tax/levy treatment on quotes (VAT inclusive/exclusive, tourism levy) | Not calculated. Quotes show prices "as entered"; tax fields reserved. Needs accountant input. | Finance |
| D8 | Xero workflow: which documents sync (invoices only? bills?), account codes, tracking categories, which legal entity's Xero org | Not connected; integration boundary only. | Finance |
| D9 | Exchange-rate source and buffer % | Manual rates entered by Finance; buffer setting default 0%. | Finance |
| D10 | Vehicle turnaround buffer between allocations | 1 day, configurable per vehicle. | Fleet |
| D11 | POPIA: retention period for guest data after trip close; Information Officer | Not automated; flagged for legal review. | Owner / legal |
| D12 | Hosting provider and data region | Not deployed. | Owner |
| D13 | Whether field staff (guides) get accounts on personal phones | Guide role exists with assigned-trip-only access. | Operations |
| D14 | Exact lifecycle rules per trip type (which stages are mandatory) | Default transition graph in `src/lib/domain/trip-lifecycle.ts`. | Management |
