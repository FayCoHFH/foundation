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
- News adds typed optional expiration behavior; Story and News share deliberate archival discovery behavior, while Stories do not inherit expiry. Urgency, pinning, and editorial priority are not V1 News fields: urgency belongs in a Site Notice where appropriate, recency is derived, and featured presentation is a placement.

Model featured content through `PlacementDefinition` plus `ContentPlacement`, with a named slot, closed eligible target set, optional active window, fallback, and audit. Do not scatter permanent `isFeatured` flags. V1 has six code-owned singleton definitions—five homepage slots plus `NEWS_FEATURED`—with no priority or ordering.

Existing schedule fields remain queryable for a future Communications Calendar. A future publication type adopts the shared contract plus typed invariants. No calendar-only or Package model is created now.

## Communications-review refinements

The accepted decision is refined, not reopened, as follows:

- `Publication` holds the candidate-revision workflow (`DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`, `APPROVED`) separately from public-release lifecycle/history. `SUBMITTED` is a transition/event selecting the candidate, not a workflow state. An active snapshot may coexist with a later working revision.
- `SCHEDULED` and `PUBLISHED` describe the approved release/snapshot lifecycle, not revision workflow. `WITHDRAWN` and `SUPERSEDED` are public-release history outcomes. Withdrawal requires a reason and promptly removes public availability; superseding preserves the prior snapshot while activating a later one.
- Story and News share a deliberate discovery disposition (`ACTIVE`/`ARCHIVED`); archive removes ordinary discovery/placement while preserving direct historical snapshot behavior. News alone owns an optional relevance end time and derived availability (`CURRENT`/`EXPIRED`). Expiration removes current/featured eligibility and adds an explicit no-longer-current public treatment without deleting a snapshot. It is not withdrawal and does not itself change archival disposition. Stories do not inherit expiry.
- Approval requirements are evaluated against the exact revision/hash. The standard independent approval rule can be extended by bounded requirement types such as consent clearance, second approval, or legal review. This is a policy evaluator and evidence record, not a general BPM engine. An override remains an explicit, reasoned, audited Super Admin action.
- Curated placement is `PlacementDefinition` plus `ContentPlacement`, not `FeaturePlacement` as an unconstrained relation. The definition owns a closed list of permitted target types and slot rules. Each placement uses one typed target join; arbitrary `targetType`/`targetId` storage is rejected. Target eligibility is validated on create, schedule, public read, and job recovery.
- The initial Calendar is derived from authoritative publication/newsletter/domain dates. It creates neither an independent schedule source nor a drag-to-reschedule contract. Communications Packages remain deferred until existing typed domain anchors cannot support a demonstrated grouping workflow.

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
- **Boolean `isFeatured` on each domain:** does not model slots, windows, competition, ordering, fallback, or future curated subjects.
- **Unconstrained polymorphic placement target:** permits illegal slot/target combinations and makes integrity/eligibility enforcement fragile; typed target joins guarded by definitions are safer.
- **One state machine that conflates candidate work, release lifecycle, shared discovery disposition, and News availability:** obscures coexistence of a published snapshot and a successor draft, and the difference between expiration, withdrawal, supersession, and archive.
- **Permanent deletion on News expiration:** destroys institutional and audit history.

## Validation

Before publication implementation, define the canonical hash algorithm/version, transition table, optimistic concurrency, transaction boundaries, slug/history rules, UTC/editorial-timezone behavior, public eligibility query, cache invalidation, and snapshot schema migration strategy. Tests must cover edit-after-approval, self-approval denial, duplicate scheduler runs, DST/window boundaries, withdrawal/expiration, stale cache, and placement eligibility.
