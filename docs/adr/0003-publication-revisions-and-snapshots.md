# ADR-0003: Use typed publications, immutable revisions, and public snapshots

- Status: Accepted
- Date: 2026-08-14

## Context

Communications is a first-class domain. Stories are long-form, narrative, rich-media, and generally evergreen; News is concise, timely, and may expire/archive. Both need authorship, revision, review, approval, scheduling, SEO, media, relationships, and audit. Public output must never expose a draft or change after approval without review.

The design must avoid both a generic `Content` blob that erases differences and duplicated publishing engines. It must also preserve Featured News/homepage curation, a future Communications Calendar, future publication types, and possible Communications/Story Packages without designing them prematurely.

## Decision

Use a narrow shared publication spine (`Publication`, immutable `PublicationRevision`, `PublicationApproval`, immutable `PublicationSnapshot`, authors/categories/relations) with one-to-one typed records for `Story` and `News` and type-specific validation.

- Editing persists a successor working revision; previously persisted revisions remain immutable.
- Submission freezes the review candidate.
- Approval records the exact revision and a canonical hash covering structured content, title/summary/SEO, authors, relations, referenced media/version, and material publication metadata.
- A material change invalidates approval.
- Scheduling points to the approved hash.
- Publishing atomically creates/activates an immutable snapshot. Public reads use only the active eligible snapshot.
- Withdrawal, expiration, archival, and superseding publication preserve snapshots and audit history.
- News may add typed optional expiration/archive behavior; Stories do not inherit those semantics by default. Gate C decides whether urgency, pinning, or priority exists and what it means, and schema design decides exact field placement.

Model featured content through a managed, typed `FeaturePlacement` direction with named slots, eligible subject, optional active window, and ordering. Do not scatter permanent `isFeatured` flags. Implement only slots approved by later homepage/Communications design.

Existing schedule fields remain queryable for a future Communications Calendar. A future publication type adopts the shared contract plus typed invariants. No calendar-only or Package model is created now.

## Consequences

- Approval and public output are reproducible and auditable.
- Public reads are simpler, safer, and cacheable.
- Snapshot storage is intentionally denormalized and immutable; a new publication replaces the active pointer rather than mutating history.
- Relations/authorship/media are frozen into a snapshot, so later upstream edits do not alter approved output.
- Shared infrastructure needs disciplined discriminator/type constraints and referential integrity.
- Preview renders the selected revision through the same renderer but is authenticated and never placed in public cache/search.

## Rejected alternatives

- **One large generic Content table/JSON record:** weakens typed invariants and invites a page-builder CMS.
- **Independent Story and News engines:** duplicates high-risk workflow and scheduling logic.
- **Mutable published row:** cannot prove what was approved or prevent post-approval drift.
- **Boolean `isFeatured` on each domain:** does not model slots, windows, competition, ordering, or future curated subjects.
- **Permanent deletion on News expiration:** destroys institutional and audit history.

## Validation

Before publication implementation, define the canonical hash algorithm/version, transition table, optimistic concurrency, transaction boundaries, slug/history rules, UTC/editorial-timezone behavior, public eligibility query, cache invalidation, and snapshot schema migration strategy. Tests must cover edit-after-approval, self-approval denial, duplicate scheduler runs, DST/window boundaries, withdrawal/expiration, stale cache, and placement eligibility.
