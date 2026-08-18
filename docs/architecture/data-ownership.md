# Data ownership and system-of-record boundaries

Status: Accepted
Last reviewed: 2026-08-18

## Rule

Every important datum has one authoritative owner. The platform may store a reference, public projection, immutable transaction snapshot, or time-stamped imported measurement without claiming ownership of the upstream record. Integration convenience does not justify a second writable source of truth.

## Ownership matrix

| Data | Authoritative owner | Local representation | Write path and conflict rule |
| --- | --- | --- | --- |
| Public Stories and News | Habitat platform | Typed roots, revisions, approvals, immutable snapshots, typed relationships | Edited only in Communications; the active eligible snapshot wins public reads and never falls back to a draft |
| Public Projects | Habitat platform | Typed Project root, immutable revisions/snapshots, bounded public projection, ordered impact facts | P1 owns only verified public editorial facts; no exact address, coordinates, homeowner/applicant identity, case, construction-scheduling, or financial record is collected |
| Habitat Campaign narrative, public status, timing, editorial facts, display goal/progress, and approved action labels/destinations | Habitat platform | Typed Campaign root, immutable revisions/snapshots, bounded public projection, ordered facts, revision-scoped Campaign–Project references, and reviewed HTTPS action handoffs | C1/C2 own only public editorial initiative facts and safe outbound links; goal/progress is integer-cent USD display content, not accounting, donor, payment, or DonorView truth. Giving execution and records remain in DonorView |
| Newsletter authored content | Habitat platform | NewsletterEdition, ordered typed blocks, approved delivery/web snapshots when required | Communications workflow owns curation and edition text; reference blocks do not become duplicate canonical Story/News records |
| Newsletter subscribers, consent, suppression, and mailing-list membership | DonorView under the accepted current boundary | Minimal DonorView destination/reference and aggregate delivery status if required | Correct in DonorView; never create a second editable subscriber list. A different system of record requires an explicit replacement decision |
| Newsletter delivery execution/provider credentials | Provider selected later | Provider-neutral port, minimum redacted delivery result if required | No provider commitment or credential storage until an approved integration decision; provider does not own Habitat editorial records |
| Story Submission clearance evidence originals and review derivatives | Habitat platform | Confidential clearance-evidence aggregate and dedicated private object boundary | No public URL/library or DonorView ownership; manual retention pending G-07 |
| Author profiles, editorial categories, publication workflow, Publication Queue, Communications Dashboard | Habitat platform | Local typed aggregates and derived read models | Local only; Queue/Dashboard do not become workflow truth |
| Site Notices | Habitat platform | Small typed operational-notice aggregate with bounded public projection | Local `communications.notices.manage` workflow; end time removes presentation without rewriting audit history |
| Featured News and other curated placements | Habitat platform | Code-owned PlacementDefinition and ContentPlacement assignments targeting shared Publication identity | Authorized placement managers only; a placement never grants ownership of its Story/News target |
| Public Story Submissions | Habitat platform, confidential intake boundary | Text `PublicStorySubmission`; C6B-3A attempt-scoped raw image rows and C6B-3B separate private review derivatives, both outside Story drafts/MediaAsset; protected server-rendered review inbox/detail in C6B-2A/2B | Collect/use/retain only under the approved intake/privacy policy and current manual-retention policy; unsubmitted technical attempts expire after 24 hours; spam restoration is higher-authority and audited; later explicit conversion creates a new Story draft; administrative reads use allowlisted DTOs and no shared cache |
| PublicStorySubmission-to-Story conversion provenance | Habitat platform, confidential bridge record | One-to-one source submission, created Story, source version, converter, timestamp, and correlation reference | Created only by the authorized accepted-submission handoff; remains restricted and auditable; it never becomes public Story content, public authorship, media, clearance, evidence, or a substitute for the Story workflow |
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
| Public media provenance, credits, rights/consent, and contextual alt text/captions | Habitat platform | MediaAsset plus unique promotion/provenance and clearance snapshots; confidential Story Submission image declarations, subjects, clearances, restrictions, and revocation requests remain authoritative in the intake boundary | Explicit promotion creates only a sanitized public derivative and website baseline; every MediaUsage re-evaluates current rights and restrictions |
| File bytes | Configured object-storage provider | Opaque storage key, checksum, class, scan state | Storage holds bytes; database metadata governs access/lifecycle |
| Public grant acknowledgment and approved impact | Habitat platform | Grant/GrantImpact public projection | Published only after human approval |
| Private grant administration | Future Habitat private grant module | Restricted records and private objects | Never automatically exposed through public Grant views |
| Applicant, household, eligibility, documents, case workflow, notes | Future Habitat private casework module | Restricted records and private objects | No public path; no SSN; no PDF/email intake |
| Audit history | Habitat platform | Append-only AuditEvent | Corrections are compensating events, not mutation/deletion |
| Legacy Wix content and media | Legacy source during migration only | Ledger entry, transformed local record, or archive | Migration disposition is a one-time decision; legacy structures do not remain authoritative |

C6A-2B validation confirmed this boundary in the browser: public homepage,
News, and Story routes receive only effective notice projections, while the
administrative list/detail surface retains the local workflow and safe display
metadata. No actor, audit, version, or authoring record is copied into public
rendering.

## Communications ownership

Fayette County Habitat owns Stories, News, Newsletter content, editorial revisions, internal publication responsibility assignments, publication state, approval evidence, public authorship, related-domain selections, and curated placements. None of these belongs to DonorView. Internal editorial owner/reviewer/approver AdminUser assignments are authorization/work-management facts and never become public AuthorProfile/byline data.

For C4, Fayette Habitat also owns the four implemented placement definitions
(`HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and
`NEWS_FEATURED`), their assignments, UTC activation windows, replacement and
cancellation history, current/upcoming administration, audit evidence, and
public placement resolution. `HOME_FEATURED_PROJECT` and
`HOME_FEATURED_CAMPAIGN` remain future extensions. DonorView, Stripe, and
Google do not own or authorize homepage placement state.

Public publication is a snapshot. An author's current profile, an EditorialCategory rename, a media asset's later caption, a MediaUsage edit, or a related Project's later edit must not retroactively change what was approved. An explicit republication produces a new snapshot.

Raw Public Story Submission data is intake data, not a public Story, author profile, or editorial draft. It is deliberately isolated from the normal public projection and rich-text authoring paths. Its contact details, consent assertions, source files, moderation/rejection reasons, and retention handling are restricted; only deliberately accepted material may be copied to a new Story draft. A submitter is not thereby an administrator or a public byline.

Media ownership is split intentionally: `MediaAsset` owns immutable byte/provenance/rights/consent/scan facts, while a contextual `MediaUsage` owns the applicable alternative text, caption, crop, order, and presentation role. A snapshot freezes both versions used. Private/quarantined submission uploads cannot enter public storage merely because a later Story refers to them.

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
