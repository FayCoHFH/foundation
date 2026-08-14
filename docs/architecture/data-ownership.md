# Data ownership and system-of-record boundaries

Status: Accepted
Last reviewed: 2026-08-14

## Rule

Every important datum has one authoritative owner. The platform may store a reference, public projection, immutable transaction snapshot, or time-stamped imported measurement without claiming ownership of the upstream record. Integration convenience does not justify a second writable source of truth.

## Ownership matrix

| Data | Authoritative owner | Local representation | Write path and conflict rule |
| --- | --- | --- | --- |
| Public Stories and News | Habitat platform | Typed aggregates, revisions, approvals, snapshots | Edited only in Communications; published snapshot wins public reads |
| Newsletter authored content | Habitat platform | Typed newsletter/publication records when implemented | Communications workflow owns content |
| Newsletter subscribers, consent, suppression, and mailing-list membership | DonorView under the accepted current boundary | Minimal DonorView destination/reference and aggregate delivery status if required | Correct in DonorView; never create a second editable subscriber list. A different system of record requires an explicit replacement decision |
| Authors, categories, publication workflow, Publication Queue, Communications Dashboard | Habitat platform | Local domain/read models | Local only |
| Featured News and other curated placements | Habitat platform | Managed FeaturePlacement records | Authorized placement managers only |
| Programs, Projects, public partners and attributable impact | Habitat platform | Local structured records | Local workflows with verification/provenance |
| Public event marketing | Habitat platform | Event and EventEdition | Local public facts; registration state is external |
| Habitat Campaign narrative, goal, updates, and public impact | Habitat platform | Campaign aggregate | Local; never equate automatically with a DonorView campaign/fund/appeal |
| Constituents and donor identities | DonorView | External reference only by default | Correct in DonorView; do not reconcile by overwriting local copies |
| Gifts, pledges, recurring gifts, receipts, donation designations | DonorView while it provides the approved giving flow | Hosted destination plus optional time-stamped aggregate progress | Never edit gift truth locally |
| Volunteer applications, waivers, registrations, attendance, and hours | DonorView | Hosted destination and optional time-stamped aggregate metrics | Correct in DonorView |
| Event registrants/tickets/attendance when using DonorView | DonorView | Registration destination; no attendee mirror by default | Correct in DonorView |
| Google account identity | Google | Provider subject, verified email/domain claims, last-seen profile | Google `sub` is the stable identity key; email changes do not create a new authorization silently |
| Admin invitation, activation, roles, capabilities, suspension | Habitat platform | AdminUser/access aggregates | Local capability policy is authoritative regardless of Google sign-in success |
| Products, variants, prices presented, orders, order item snapshots, fulfillment | Habitat platform | Local commerce aggregates | Local catalog/order state; Stripe events advance payment mirror state |
| Payment methods, card data, payment-network processing, processor transaction state | Stripe | Opaque Stripe identifiers and minimum status/totals needed for reconciliation | Correct financial processing in Stripe; never accept card data on platform servers |
| Public media provenance, credits, rights/consent, and contextual alt text/captions | Habitat platform | MediaAsset source metadata plus relationship/snapshot-specific presentation text | Local publication rules govern eligibility; one asset may require different alternatives in different contexts |
| File bytes | Configured object-storage provider | Opaque storage key, checksum, class, scan state | Storage holds bytes; database metadata governs access/lifecycle |
| Public grant acknowledgment and approved impact | Habitat platform | Grant/GrantImpact public projection | Published only after human approval |
| Private grant administration | Future Habitat private grant module | Restricted records and private objects | Never automatically exposed through public Grant views |
| Applicant, household, eligibility, documents, case workflow, notes | Future Habitat private casework module | Restricted records and private objects | No public path; no SSN; no PDF/email intake |
| Audit history | Habitat platform | Append-only AuditEvent | Corrections are compensating events, not mutation/deletion |
| Legacy Wix content and media | Legacy source during migration only | Ledger entry, transformed local record, or archive | Migration disposition is a one-time decision; legacy structures do not remain authoritative |

## Communications ownership

Fayette County Habitat owns Stories, News, Newsletter content, editorial revisions, publication state, approval evidence, authorship, related-domain selections, and curated placements. None of these belongs to DonorView.

Public publication is a snapshot. An author's current profile, a media asset's later caption, or a related Project's later edit must not retroactively change what was approved. An explicit republication produces a new snapshot.

## DonorView boundary

The preferred donation flow is:

`Habitat Campaign -> approved DonorView designated destination -> donor contributes -> DonorView owns constituent/gift/receipt`

The local `DonationDestination` records the call-to-action, URL/embed reference, designation label, and verification metadata. It is not a donation ledger. If supported exports or APIs are later confirmed, imported totals remain time-stamped, attributable projections and do not become editable gift data.

No authoritative public evidence currently establishes a supported DonorView API, webhook, or Zapier mechanism. The account owner/vendor must confirm those capabilities before architecture relies on them. Absence of public documentation is recorded as an uncertainty, not a claim that no private capability exists.

## Stripe boundary

Stripe is approved for merchandise commerce. The local platform creates an order attempt and a hosted Checkout Session; Stripe collects payment details. A verified Stripe event advances local payment mirror state and idempotent fulfillment. The browser success page is informational, not proof of payment.

Stripe donation processing is only a future fallback/option behind the provider-neutral `DonationDestination` boundary. Choosing it would require a separate decision covering recurring gifts, receipts and tax acknowledgments, refunds/disputes, accounting reconciliation, donor consent, and constituent synchronization. It must not silently create a second donor system of record.

## Public/private projection rules

- Public queries are allowed to read only explicit public fields or immutable publication snapshots.
- Private grant and applicant records have no automatic serializer, public foreign-key traversal, search index, analytics export, or media URL.
- A projection records source, approver, approval time, consent/permission basis where applicable, and the public values actually released.
- Revoking consent can withdraw future presentation while preserving a restricted audit/legal record; it does not rewrite immutable audit facts.
- Aggregate statistics must carry source, methodology, period/as-of time, and verification state. Counts from DonorView are not live truth unless a supported synchronization mechanism and freshness policy exist.

## External identifiers

- Store external system, external object type, external identifier, local type/id, and provenance in `ExternalSystemReference`.
- Enforce uniqueness for mappings where the provider guarantees it.
- Treat external IDs as opaque strings; never infer meaning from their format.
- Do not put confidential data in Stripe metadata, URLs, object keys, logs, idempotency keys, or external reference display names.
- Provider deletion does not automatically delete the local reference; mark it invalid and preserve reconciliation/audit context according to retention policy.

## Correction and reconciliation

| Conflict | Resolution |
| --- | --- |
| Local campaign total differs from DonorView | Mark local projection stale; verify/import from DonorView with source and as-of time |
| Local order payment state differs from Stripe | Retrieve/verify Stripe state and apply idempotent reconciliation; preserve the event trail |
| Google email changes for an existing `sub` | Update last verified email subject to domain/access policy; do not create or transfer permissions by email alone |
| Published snapshot differs from draft | Public snapshot remains authoritative until approved republication or withdrawal |
| Public grant text conflicts with private grant record | Stop publication and require an authorized projection correction; private record is never exposed to “explain” the conflict |
| Legacy fact conflicts with verified current information | Verified current source wins; preserve legacy only as attributed history if valuable |

## Prohibited duplication

Do not create local writable tables for individual donors, gifts, recurring agreements, volunteer applications, waiver answers, attendance, volunteer hours, or DonorView event registrants merely to make admin screens convenient. Do not store raw Stripe payment methods or card data. Do not place applicant or private-grant documents in public media storage.
