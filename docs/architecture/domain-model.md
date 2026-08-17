# Domain model

Status: Accepted conceptual model; not a database schema
Last reviewed: 2026-08-15

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

- `Publication`: identity, closed `kind`, canonical slug, candidate workflow state, current working revision, approved revision/hash, active snapshot, shared release/scheduling history, shared `ACTIVE`/`ARCHIVED` discovery disposition, and optimistic concurrency version. Candidate workflow, release history, and discovery disposition are intentionally separate so an active snapshot may coexist with a later draft.
- `PublicationResponsibility`: internal mutable assignment with required editorial-owner AdminUser and optional assigned reviewer/approver AdminUsers. Owner defaults to the creator unless an authorized any-scope command assigns another active user; reassignment is audited. It scopes `*.read/edit.own` but does not grant capabilities, represent public authorship, alter the content hash, or enter public snapshots.
- `PublicationRevision`: immutable numbered revision metadata, schema-versioned rich-text JSON, normalized title/summary/SEO fields, creator, creation time, and canonical content hash.
- `PublicationAuthor`: ordered link from a revision or snapshot to `AuthorProfile`; authorship at publication time is preserved.
- `PublicationApproval`: reviewer/approver, exact revision and canonical hash, decision, reason, and timestamp.
- `PublicationSnapshot`: immutable public payload derived from one approved revision, including frozen authors, relations, media references, SEO, structured document, and renderer/schema version.
- `PublicationRelation`: typed link from a revision/snapshot to an eligible Project, Program, Campaign, Event, Grant, Partner, Person, Product, or other approved subject.
- `EditorialCategory` and `PublicationCategory`: flat, Communications-owned, controlled classification where a publication kind permits it. Categories have an explicit merge/retire path. Generic tags are not a V1 concept.
- `PublicationQualityIssue`: derived or recorded accessibility/link/validation problem used by the Publication Queue and Communications Dashboard; it does not replace validation.
- `PublicationLifecycleTransition`: append-only lifecycle event with an explicit candidate-workflow, release/snapshot, shared discovery-disposition, or derived News-availability dimension; action and from/to state where applicable; subject revision/hash/snapshot/schedule; actor or service principal; reason where required; and correlation/idempotency/audit reference. `SUBMITTED` is an action selecting a candidate, not a workflow state, and expiry is an idempotent derived observation rather than mutable availability truth. The record is authoritative history while current aggregate state and immutable snapshots remain the operational sources used by Queue/Dashboard projections.
- `PublicationRequirement`: an evaluated, typed approval/publication requirement for an exact revision (for example, standard independent approval, consent clearance, second approval, or legal review). It is a small extensibility seam, not a general BPM engine.

`Publication.kind` is a discriminator with a closed set. Each kind must have exactly one typed detail record and typed validation. This shared spine is intentionally narrower than a generic `Content` table.

The candidate-revision workflow is `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`, and `APPROVED`; requested changes return responsibility to the author/editor, and `SUBMITTED` is the event that moves the selected candidate into review. `SCHEDULED` and `PUBLISHED` belong to the approved release/snapshot lifecycle, not this workflow. Publishing activates a snapshot and does not destroy the candidate; later activation can mark a prior public release `SUPERSEDED`, while `WITHDRAWN` records its deliberate removal. A material edit produces a successor revision and invalidates exact-revision approvals as determined by the revision-diff policy.

### Aggregate: Story

- `Story`: typed root and one-to-one detail for a `Publication` of kind `STORY`; it owns narrative/evergreen invariants and the minimum anatomy of headline, deck, excerpt, optional hero usage, and structured body. Canonical slug, SEO, authors, approved relationships, and workflow remain in the shared spine.
- Long-form body, pull quotes, galleries, contextual calls to action, and rich relations are represented as allowlisted structured nodes and typed relationships, not arbitrary embedded HTML. First-release relations are selected by real editorial need and validate the target's public eligibility.
- Stories are generally evergreen and never inherit News expiration semantics by default.
- An archived Story leaves ordinary collection/related/placement discovery but retains its direct historical snapshot; restoration or withdrawal recovery uses a successor revision and normal approval.

### Aggregate: News

- `News`: typed root and one-to-one detail for a `Publication` of kind `NEWS`; it owns concise-announcement anatomy, optional relevance end time, and derived availability. It is not a shorter Story; it uses the shared archival discovery disposition.
- News availability is `CURRENT` until the optional relevance end time, then derives `EXPIRED`; expired News is no longer eligible for current/latest/featured placement and is presented as no longer current where it remains directly addressable. Expiry does not change the shared `ACTIVE`/`ARCHIVED` disposition. The system preserves snapshots and audit records. Withdrawal removes a public release and requires a reason.
- Urgency, pinning, and priority are not V1 fields. “Latest” is derived from publication time and “featured” is a managed placement.
- Relations to Project, Program, Campaign, Event, Grant, Partner, and media are optional and independently validated.

### Aggregate: PlacementDefinition and ContentPlacement

- `PlacementDefinition`: code-owned singleton slot definition with a stable key, permitted target kinds, cardinality, half-open window rules, fallback policy, and public surface. The accepted catalog reserves six definitions; C4 implements `HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`. `HOME_FEATURED_PROJECT` and `HOME_FEATURED_CAMPAIGN` are future extensions, not available keys. Definitions are not administrator-created page-builder data and have no ordering mode.
- `ContentPlacement`: a persistent assignment for one definition and one shared `Publication` foreign key, with optional active interval, cancellation timestamp, optimistic version, actor/timestamp metadata, and retained lifecycle/audit history. The service enforces the typed Story/News target matrix; arbitrary polymorphic target storage and distributed `isFeatured` flags are rejected. One key has at most one effective non-cancelled assignment at an instant, while historical rows remain queryable.
- Placement windows are half-open; null `endsAt` is open-ended; adjacent windows are allowed and overlapping non-cancelled windows for one key are rejected. Replacement, clear/end, and future cancellation preserve historical rows. Stale mutations fail with a concurrency conflict, and consequential mutation audit evidence commits atomically with placement state.
- A target must have an eligible released public projection at resolution time. Ineligible, expired, archived, withdrawn, or missing targets do not render, but their placement history is not deleted. Public resolution returns only safe placement metadata and projection DTO fields; it never falls back to an editable draft or exposes authoring/workflow/approval/audit/internal-responsibility data.
- Because the placement targets stable `Publication` identity, a released successor projection updates every effective placement for that publication without rewriting placement IDs, windows, or placement history. Publication release audit is not a placement mutation event.

### Aggregate: AuthorProfile and editorial taxonomy

- `AuthorProfile`: Communications-owned public byline profile with display name, optional title/bio/portrait, organization/limited-identity setting, visibility and archival state. It may reference at most one public `Person` and/or `AdminUser`, while either upstream record may support multiple distinct byline profiles; these links are neither required nor authorization grants. An archived profile remains available to frozen historical snapshots.
- `EditorialCategory`: flat controlled vocabulary with display name, slug, description, permitted publication kinds, display order, and active/retired/merged lifecycle. V1 enforces zero or one primary category on a Story/News revision. Category changes do not mutate prior snapshots. Category creation, merge, and retirement require governed capabilities.

### Aggregate: SiteNotice

- `SiteNotice`: a small, separately typed Communications aggregate for operational notices: bounded plain-text title/message, severity (`INFO`, `IMPORTANT`, `URGENT`), code-owned target area (`SITE_WIDE` or `HOMEPAGE`), optional single CTA, optimistic version, and `DRAFT`/`PUBLISHED`/`WITHDRAWN` lifecycle with derived upcoming/active/expired presentation.
- Published notices require a bounded half-open activation window. They automatically stop rendering after their exclusive end time, are audited, and are not indexed or modeled as News unless staff intentionally creates a separate News item.
- C6A-2B browser and accessibility validation confirms that public routes consume only the safe effective projection; administrative actor, version, lifecycle, and audit metadata remain out of the public notice surface.

### Aggregate: PublicStorySubmission

- `PublicStorySubmission`: confidential, text-only intake, separate from `Story`, containing only justified contact/relationship/story/acknowledgement data, privacy acknowledgment, triage-only sensitivity declarations, lifecycle status, and bounded internal review notes. C6B-1A/C6B-2C have no media/attachment relation, public projection, or conversion path; submission content is manually retained pending an approved schedule.
- An editor accepts and explicitly converts a submission into a new Story draft. The draft receives only approved/necessary material; the submitter's identity, public byline, and consent are independently selected. Rejection, withdrawal, retention, and deletion follow the intake retention policy. A public News submission aggregate is not in V1.

### Aggregate: NewsletterEdition

- `NewsletterEdition`: typed Communications root for an edition-specific title, introduction, planned timing, and audit. It owns curation, not subscriber data or a duplicate canonical article body. Delivery execution and web-archive eligibility are deferred until their operating/provider policy is approved.
- `NewsletterBlock`: ordered typed block owned by an edition. Reference blocks link to canonical Story, News, Project, Event, Campaign, or ReStore material; a bounded custom-text/CTA block supplies edition-specific context. Delivery snapshots, if required by a provider, freeze the rendered edition separately.
- The provider-neutral delivery port receives an approved delivery snapshot and aggregate result only. DonorView remains the subscriber, consent, suppression, and mailing-list authority.

### Future Communications concepts

- Newsletter editions reuse suitable media, review, scheduling, and audit services but remain typed content.
- A Communications Calendar derives rows from Story/News/Newsletter publication schedules and other domain dates; no calendar entity or independent rescheduling system is required.
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

- `MediaAsset`: metadata and lifecycle for an immutable object: classification, storage key/store, checksum, MIME type determined server-side, byte size, dimensions/duration, source description, credits, consent/license basis, upload actor/time, scan state, processing state, and publication eligibility.
- `MediaUsage`: a typed contextual join to an eligible editorial owner (Story revision, News revision, AuthorProfile, or NewsletterBlock in approved scope) with presentation role, order, focal crop, contextual caption, contextual alternative text/decorative treatment, and use constraints. V1 placement uses the target snapshot’s approved media and cannot introduce its own media override. Raw `SubmissionMedia` is not a MediaUsage; explicit promotion after acceptance/rights review creates a normal MediaAsset and Story-revision usage. Public usage requires a ready, cleared asset and complete contextual requirements. Snapshotting freezes the approved asset and usage versions.
- `MediaVariant`: generated rendition linked to its source and transformation version.
- `PublicStorySubmissionMedia`: confidential intake-only original and, after
  server validation, one separate confidential review JPEG derivative. Its
  server-determined detected format, normalized source dimensions, derivative
  dimensions/bytes, and processing time are technical facts; neither object is
  a `MediaAsset`, `MediaUsage`, public object, consent record, or clearance.
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
