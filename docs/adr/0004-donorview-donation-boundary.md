# ADR-0004: Keep DonorView authoritative behind a donation-provider boundary

- Status: Accepted
- Date: 2026-08-14

## Context

Fayette County Habitat already uses DonorView for constituent, fundraising, volunteer, and event operations. The new platform needs project-specific Campaign storytelling and giving calls to action but must not rebuild the CRM or rely on undocumented integration mechanisms.

Official public material documents hosted donation pages, recurring giving, configurable `For`/`Fund`/`Event`/`Appeal`/goal categories, constituent CRM, volunteer applications/registration/time, events, reports/exports/widgets, and a QuickBooks feature. The public evidence reviewed does **not** establish a supported API, webhook contract, or Zapier integration. Those are vendor/account questions, not claims that the capability is absent.

## Decision

DonorView remains system of record for constituents, donors, gifts, pledges, recurring gifts, receipts, newsletter subscribers/consent/suppression and mailing-list membership, volunteer applications/waivers, registrations, attendance/hours, and DonorView event registrants.

Use a provider-neutral `DonationDestination` and DonorView anti-corruption adapter. The preferred initial Campaign flow is an authorized staff member creating a targeted DonorView destination, then recording its hosted URL/designation/verification metadata locally. DonorView owns the resulting donor and gift.

Supported exports may later provide time-stamped aggregate progress. API creation/sync or webhook ingestion is enabled only after current vendor documentation, account entitlement, credentials, stable IDs, error semantics, security, and privacy are confirmed. Never reverse-engineer browser/private endpoints.

## Consequences

- Habitat owns Campaign narrative and public presentation without duplicating donor operations.
- A manual reference-first integration is an acceptable production mechanism.
- Imported progress is a source-stamped projection, not a local gift ledger.
- Public calls to action continue to work if deeper integration is unavailable.
- Person-level sync remains deferred until IDs, merge/deduplication ownership, minimum fields, consent, and retention are approved.

## Rejected alternatives

- **Rebuild DonorView locally:** duplicates sensitive systems and operational processes.
- **Assume an API/webhook/Zapier connector:** lacks authoritative evidence.
- **Scrape/automate DonorView browser flows:** unsupported, brittle, and a credential/privacy risk.
- **Treat local Campaign as DonorView Campaign/Fund/Appeal:** semantic collision between storytelling and accounting/fundraising constructs.
- **Make Stripe the default donation provider immediately:** creates a second donor/gift/receipt workflow before DonorView capability is tested.

## Validation

The priority vendor/account test is whether staff can quickly create a durable targeted destination, fix/preselect its designation, obtain a hosted URL or supported accessible embed, and associate progress with it. The full questionnaire and evidence are in [DonorView integration](../integrations/donorview.md).
