# Integrations

Status model (stored per connection): `not_configured → awaiting_credentials → awaiting_authorisation → connected ⇄ synchronising`, plus `action_required`, `error`, `disconnected`. A status of `connected` is only set after a successful live call.

| Integration | Status | Notes |
|---|---|---|
| Xero | Not configured | Needs Xero app client id/secret + OAuth consent + workflow decisions (OPEN_DECISIONS D8). Idempotency: store Xero IDs on our records; never create invoice/bill without a stored external reference check. Quote ≠ invoice. |
| Exchange rates | Manual | Finance enters rates with source + timestamp. Provider can be added behind `CurrencyRateProvider`. Issued quotes keep their locked rate. |
| Google Places / Maps | Not configured | Needs API key + terms review. Imported locations are `verified = false` until reviewed. |
| Email | Not configured | Invitations currently produce a copyable activation link shown to the admin. |
| AI assistance | Not configured | No provider. Any future output must be labelled AI-generated and require human review. |
| File storage | Not configured | Needed for documents/inspection photos (S3-compatible private bucket). |

## Tools available in the development environment (audit 2026-10-29)
Useful and used: local PostgreSQL 16, Playwright + Chromium (pre-installed) for e2e/visual QA, GitHub MCP.
Available but **not** used without an owner decision because they create billable/external resources: Supabase MCP (managed Postgres/auth/storage), Render MCP (hosting).
Present but unauthenticated: Figma, Canva, Notion, Slack, Linear (could hold brand assets/specs once connected).
Not relevant: marketing/SEO/data-warehouse plugins.
