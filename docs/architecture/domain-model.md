# Domain model

Status: Accepted conceptual model; not a database schema
Last reviewed: 2026-08-14

## Modeling rules

- This is a relational/domain map for implementation planning. Names, columns, and enums remain subject to slice-level design and migration review.
- Aggregate roots protect lifecycle invariants. A route handler may not update child records around the root's rules.
- Relationships to external systems use stable local references and provider identifiers; external payloads are not copied wholesale into domain tables.
- Public data is an explicit projection. Confidential source records never become public merely because they have a relationship to a public aggregate.
- Historical records use state transitions, effective dates, revisions, and audit events rather than destructive replacement.
- The legacy Wix content model has no authority over these aggregates.

## Identity and access

### Aggregate: AdminUser

- `AdminUser`: local authorization principal linked to one or more verified external identities; states conceptually include `INVITED`, `ACTIVE`, `SUSPENDED`, and `REVOKED`.
- `AdminInvitation`: single-use, expiring invitation tied to an intended verified email/domain and inviter. Acceptance does not grant permissions beyond the recorded assignment.
- `ExternalIdentity`: provider (`GOOGLE` initially), immutable provider subject, last verified email, hosted-domain claim, and verification timestamps.
- `Role`: editable permission bundle used for administration and assignment convenience.
- `Permission`: stable capability identifier.
- `UserRole`: effective-dated role assignment with assigner and optional revocation.
- Exceptional direct grants/denials may be supported later, but role capability grants are the initial policy surface.
- `AuthSession`: owned by Better Auth and backed by PostgreSQL; access suspension revokes active sessions.
- `AuditEvent`: append-only security and domain audit record containing actor, action, target, timestamp, request/correlation context, result, and a redacted before/after summary when appropriate.

`AdminUser` is not `Person`. Linking them is optional and explicit so a staff biography cannot acquire administrative access and an administrator need not have a public biography.

## Communications

### Shared publication foundation

The relational direction uses a narrow shared publication spine plus typed domain records:

- `Publication`: identity, kind, canonical slug, workflow status, current working revision, approved revision/hash, active snapshot, shared scheduling reference/invariants, withdrawal state, and optimistic concurrency version. Gate C and schema design decide exact temporal fields; a shared scheduling contract does not give Stories a generic expiration window.
- `PublicationRevision`: immutable numbered revision metadata, schema-versioned rich-text JSON, normalized title/summary/SEO fields, creator, creation time, and canonical content hash.
- `PublicationAuthor`: ordered link from a revision or snapshot to a public `Person`/author profile; authorship at publication time is preserved.
- `PublicationApproval`: reviewer/approver, exact revision and canonical hash, decision, reason, and timestamp.
- `PublicationSnapshot`: immutable public payload derived from one approved revision, including frozen authors, relations, media references, SEO, structured document, and renderer/schema version.
- `PublicationRelation`: typed link from a revision/snapshot to an eligible Project, Program, Campaign, Event, Grant, Partner, Person, Product, or other approved subject.
- `Category` and `PublicationCategory`: Communications-owned classification where a type permits it. Categories and tags are not assumed interchangeable.
- `PublicationQualityIssue`: derived or recorded accessibility/link/validation problem used by the Publication Queue and Communications Dashboard; it does not replace validation.

`Publication.kind` is a discriminator with a closed set. Each kind must have exactly one typed detail record and typed validation. This shared spine is intentionally narrower than a generic `Content` table.

### Aggregate: Story

- `Story`: one-to-one typed detail for a `Publication` of kind `STORY`; contains story-specific presentation and narrative invariants.
- Long-form body, pull quotes, galleries, contextual calls to action, and rich relations are represented as allowlisted structured nodes and typed relationships, not arbitrary embedded HTML.
- Stories are generally evergreen and never inherit News expiration semantics by default.

### Aggregate: News

- `News`: one-to-one typed detail for a `Publication` of kind `NEWS`; supports concise announcement semantics and typed optional expiration/archive behavior. Gate C decides whether urgency, pinning, or priority has a real workflow meaning; no such field is committed here.
- Conceptual lifecycle states include draft, review, approved, scheduled, published, expired, archived, and withdrawn. Exact enum names are selected with the first implementation.
- Expiration changes public eligibility or archive presentation but does not delete the item or its snapshots.
- Relations to Project, Program, Campaign, Event, Grant, Partner, and media are optional and independently validated.

### Aggregate: FeaturePlacement

- `FeaturePlacement`: curated slot identifier, eligible subject type/id, optional active interval, order/priority, and publication state.
- It supports Featured Story, Featured News, Campaign, Project, Event, ReStore, Shop, and future slots without scattering permanent Boolean flags.
- Only placements approved by the homepage/Communications design are created in Slice work. This direction does not imply a universal page builder.

### Future Communications concepts

- Newsletter content should reuse suitable authorship, media, review, and scheduling services but remains a typed capability.
- A Communications Calendar can query publication and newsletter schedules; no foundation-only calendar entity is required.
- A future Communications/Story Package may group typed publications and domain records around an initiative. Its name, ownership, and lifecycle remain deliberately undecided.

## People, leadership, and governance

### Aggregate: Person

- `Person`: public-safe identity/profile record, with deliberate visibility and consent status.
- `BoardPosition`: named position with sort order and effective dates.
- `BoardMembership`: a Person holding a BoardPosition for an effective interval; supports history without rewriting prior rosters.
- `Committee`: public-safe committee identity, purpose, and visibility.
- `CommitteeMembership`: effective-dated Person-to-Committee membership and title.

Private contact details do not belong in the public Person aggregate. A future private staff directory, if needed, is a separate projection.

## Projects, programs, partners, and impact

### Aggregate: Program

- `Program`: stable description of a Habitat program and its public eligibility/presentation information.
- Program relationships include Projects, Stories, News, Campaigns, Partners, and attributable Impact records.

### Aggregate: Project

- `Project`: local record for work such as new home builds, repairs, aging-in-place work, ramps, disaster response, or community engagement.
- `ProjectPartner`: relationship to a `Partner`, role, effective dates, and public-recognition approval.
- `ProjectMetric`: attributable metric value, unit, period/as-of date, methodology/source, verification state, and public visibility.
- `ProjectMedia`: ordered/typed relation to a `MediaAsset`, including project-specific caption and consent/use constraints.

Project lifecycle labels are selected when Projects are designed; they must distinguish planning, active, completed, paused/cancelled, and public visibility. A Project must not contain a homeowner/applicant record. Any public participant narrative is an independently consented projection with revocable use constraints.

### Aggregate: Partner

- `Partner`: organization identity and public recognition information.
- Logo or testimonial use requires a recorded permission basis; relationship existence does not authorize public logo display.

### Aggregate: ImpactMetric

- `ImpactMetric`: definition, unit, methodology, owner, acceptable sources, and public eligibility.
- `ImpactSnapshot`: immutable value for a period/as-of date with source attribution, verification state, and optional Project/Program/Grant relationships.

Impact presentation is based on verified snapshots, not counters recomputed from unrelated operational tables.

## Campaigns, donation destinations, and events

### Aggregate: Campaign

- `Campaign`: Habitat-owned narrative, goal, dates, relationships, public status, updates, and final impact reporting.
- `CampaignUpdate` and `CampaignMetric`: dated, attributable progress or impact records.
- `DonationDestination`: provider-neutral call-to-action configuration with provider, hosted URL or integration reference, designation label, active dates, verification state, and last verification time.
- `ExternalSystemReference` may map a Campaign to a DonorView designation/page/campaign or Stripe object without asserting semantic identity.

Financial progress is imported or entered only from an authoritative source with an as-of time and provenance. It must not be inferred from page visits or unverified widget output.

### Aggregate: Event

- `Event`: stable event concept and Habitat-owned public marketing content.
- `EventEdition`: dated occurrence with venue/public logistics, status, and registration destination.
- Registrants, tickets, attendance, and volunteer shifts belong to DonorView when that service is used. The local record stores only the external destination and public display facts required by the website.

## Grants

### Public aggregate: GrantImpact

- `Grant`: public-safe grant/funder identity and acknowledgment state.
- Public relationships to Projects, Programs, Stories, News, Partners, and attributable ImpactSnapshots.
- Only approved acknowledgment text, amounts/ranges when authorized, dates, logos with permission, and public outcomes are published.

### Future private aggregate: GrantAdministration

- Private application/proposal, budget, agreement, award terms, reporting calendar, deliverables, correspondence, documents, and internal notes.
- Private grant documents use private storage and dedicated capabilities.
- Public Grant/GrantImpact records are deliberate projections with provenance; private fields never flow automatically into them.

## ReStore and commerce

### Aggregate: ReStoreContent

- ReStore content owns public store facts, reuse/mission content, donation-of-goods guidance, Stories/News/Events relationships, and approved hours/status notices.
- Operational point-of-sale or inventory is out of scope unless later requirements establish it.

### Aggregate: Product

- `Artist`: public artist/collaborator profile and approved credit/usage information.
- `Product`: Habitat-owned merchandise definition and public lifecycle.
- `ProductVariant`: SKU-level attributes, price reference, availability, and inventory/fulfillment policy.
- `Order`: local order, buyer/shipping snapshot required for fulfillment, Stripe references, payment mirror state, fulfillment state, totals/currency snapshot, and retention state.
- `OrderItem`: immutable purchased product/variant description, quantity, unit amount, and tax/discount allocation snapshot.
- `IntegrationEvent`: verified Stripe event receipt and idempotent processing status.

Stripe owns card/payment method data and processor transaction detail. Product and Price identifiers are external references, not the sole local product catalog.

## Media and storage

### Aggregate: MediaAsset

- `MediaAsset`: metadata and lifecycle for an immutable object: classification, storage key/store, checksum, MIME type determined server-side, byte size, dimensions/duration, source description, credits, consent/license basis, upload actor/time, scan state, and publication eligibility. Context-specific relationships and snapshots carry the actual alt text/decorative treatment and caption used in that presentation.
- `MediaVariant`: generated rendition linked to its source and transformation version.
- Draft/public media and private/confidential documents never share an access policy simply because both are files.
- Replacing an asset creates a new immutable object/version; published snapshots continue to reference the version they approved.

## Integrations and synchronization

- `ExternalSystemReference`: local aggregate/type/id to external system/type/id mapping, with uniqueness and provenance.
- `IntegrationSync`: bounded execution, direction, cursor/as-of range, counts, result, and redacted diagnostics.
- `IntegrationEvent`: provider event id/type, received time, verification result, processing state, attempt count, and redacted payload or payload reference according to classification.
- `OutboxMessage`: local event awaiting a reliable side effect; processing is idempotent.

No integration record makes the platform authoritative for external donor, gift, volunteer, or payment data.

## Future applicant/casework boundary

The deferred private model may include `Applicant`, `Household`, `Application`, `EligibilityAssessment`, `SupportingDocument`, `CaseWorkflow`, and `CaseNote`. Before implementation it requires a dedicated threat model and retention schedule. It must observe these invariants:

- no SSN collection;
- no email/PDF intake workflow;
- private storage only for supporting documents;
- dedicated read/write/export capabilities and sensitive-read audit;
- no direct public query path or automatic Project/Story relationship;
- a separately approved consent/projection process for any participant narrative.

## Relationship summary

- Program 1-to-many Projects; Projects may participate in more than one Program only if the product design explicitly requires a join.
- Stories and News relate many-to-many to approved domain subjects through frozen revision/snapshot relations.
- Campaign may relate to Project/Program and has zero or more DonationDestinations; one destination is active per intended giving action and time window.
- Event has one or more Editions; each Edition may expose one approved DonorView registration destination.
- GrantImpact relates to Projects/Programs/ImpactSnapshots; private GrantAdministration projects only approved fields.
- Product has Variants and Orders have immutable OrderItems; Stripe references payment objects.
- MediaAsset relations carry contextual caption/order/consent constraints and are frozen into publication snapshots.

## Schema-design checks for implementation slices

Before migrations, each slice must document:

1. aggregate and transaction boundaries;
2. lifecycle transition table and concurrency behavior;
3. uniqueness and referential-integrity constraints;
4. public/private classification and projection path;
5. audit coverage and deletion/retention behavior;
6. external ownership and idempotency keys;
7. index/query needs, including public eligibility windows;
8. migration and rollback strategy.
