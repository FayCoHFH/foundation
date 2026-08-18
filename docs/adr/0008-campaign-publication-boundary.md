# ADR-0008: Typed Campaign publication boundary

- Status: Accepted
- Date: 2026-08-18

## Context

Campaigns need a durable Habitat-owned publication boundary for bounded public
initiative information. A Campaign may mention public Projects, but it must not
become a donation ledger, donor mirror, payment workflow, volunteer-registration
system, or generic content record. The shared publication kernel already owns
revision, approval, release, immutable snapshots, and public projection rules.

## Decision

Add `CAMPAIGN` as a closed `PublicationKind` with a one-to-one typed `Campaign`
root. Campaign revisions use code-owned type and status enums, UTC start/end
instants, bounded structured editorial content, up to ten ordered facts, and
optional non-negative integer-cent goal/progress values with an explicit currency.
Project relationships are explicit, revision-scoped ordered joins. Release
creates a detached immutable `PublicCampaignProjection`; public reads never
fall back to mutable authoring data and re-check linked Project public
eligibility at read time.

Campaign C1 has no public routes, administrative UI, donation/checkout,
volunteer registration, DonorView integration, media, or placement behavior.
Those capabilities require later slices and their own contracts.

## Consequences

- Campaign identity, editorial workflow, and public release use the established
  publication guarantees and capability checks.
- Campaign facts and amounts are bounded and auditable; amounts cannot be
  confused with DonorView gift truth or payment reconciliation.
- Explicit Project joins preserve type safety, ordering, and privacy filtering
  without copying private Project data.
- Later Campaign UI and provider handoffs can consume stable public/admin DTOs
  without reopening the root or publication model.

## Alternatives considered

- A generic content table was rejected because it would erase Campaign-specific
  validation and weaken typed publication boundaries.
- A permanent `isCampaign` or `isFeatured` flag on another domain was rejected
  because Campaign identity and curation belong to typed roots and future
  placement rules, not scattered booleans.
- Donation totals, donor records, and volunteer registrations were rejected
  because DonorView/provider contracts are unresolved and outside C1 ownership.

## Validation and follow-up

The C1 migration, Prisma constraints, unit suite, focused Campaign integration,
focused Project regression, and full PostgreSQL integration suite are the
implementation evidence. C2 may add public Campaign presentation only after
content, CTA, and provider-neutral handoff requirements are separately scoped.
