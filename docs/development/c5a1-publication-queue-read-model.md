# C5A-1 Publication Queue read model

Completed 2026-08-15. C5A-1 adds a PostgreSQL-backed derived read service for
the Communications administration. It combines typed Story and News records
without adding queue persistence or duplicating workflow state.

## Supported views

The supported views are `MY_DRAFTS`, `NEEDS_REVIEW`, `NEEDS_APPROVAL`,
`APPROVED_UNRELEASED`, `RECENTLY_PUBLISHED`, `EXPIRED_NEWS`, and `ARCHIVED`.
`ALL` is also available as the capability-filtered union of those views.
`SCHEDULED` is intentionally deferred: the current schema has no publication
scheduling state. Placement windows are not publication scheduling.

## Semantics and authorization

- `MY_DRAFTS` reads owned `DRAFT` and `CHANGES_REQUESTED` candidates. A user
  with the type-specific `*.read.draft.any` capability may see broader
  ownership; otherwise the existing own-draft capability limits rows to the
  current administrator.
- `NEEDS_REVIEW` reads `IN_REVIEW` candidates with the type-specific review
  capability and the existing draft-read policy.
- `NEEDS_APPROVAL` reads `PENDING_APPROVAL` candidates with the type-specific
  approval capability. Visibility does not perform approval. The DTO exposes a
  safe `SELF_APPROVAL` actionability code when existing separation-of-duties
  facts mean the current administrator cannot approve that item.
- `APPROVED_UNRELEASED` requires an exact approval ID and content hash for the
  current candidate, and excludes a candidate whose exact revision is already
  the active public snapshot. An approved revision 2 therefore remains visible
  when revision 1 is public.
- `RECENTLY_PUBLISHED` uses released, active Story projections and current
  News projections, ordered by public release time. Expired News, withdrawn
  records, and archived discovery records are excluded.
- `EXPIRED_NEWS` uses the current public News projection at the injected clock;
  withdrawn records have no active projection and are excluded.
- `ARCHIVED` uses archived discovery disposition while retaining the existing
  type-specific read capability model.

Every request first requires `communications.queue.read`, then applies the
existing Story/News capability rules. Role names are not consulted.

## DTO, filters, pagination, and counts

`PublicationQueueItem` contains typed publication identity, headline, workflow,
release and discovery state, News availability, editorial-owner display name,
current revision number, safe lifecycle timestamps, a typed admin detail path,
and the derived approval actionability fields. It does not contain body JSON,
raw approval or audit records, email, OAuth/provider data, or public snapshot
payloads.

The only filters are `ALL`/`STORY`/`NEWS` and editorial owner. Broader owner
filters require broader inspection capability. Page numbers are positive safe
integers; page size defaults to 25 and is capped at 100. Queries use database
`LIMIT`/`OFFSET` pagination and a stable ID tie-breaker. View ordering is:
updated descending for drafts/all; oldest submission or approval-wait timestamp
first for review/approval; oldest approval first for approved-unreleased; newest
public release first; newest expiration first; and newest archive transition
first.

Summary counts are calculated in the same capability-filtered SQL query as the
selected page, including the capability-filtered `ALL` union count used by the
admin Queue navigation. They are not persisted. Counts use the explicit request
clock, so News can move between `RECENTLY_PUBLISHED` and `EXPIRED_NEWS`
deterministically.

## Implementation and validation

The contracts are in `src/modules/communications/queue/queue-contracts.ts` and
the derived PostgreSQL service is in
`src/modules/communications/queue/queue-service.ts`. The query selects only
queue fields, uses one item query plus one grouped count query, and does not
load body JSON or perform per-row follow-up queries.

Focused unit coverage is in
`tests/unit/communications/publication-queue.test.ts`. Real PostgreSQL coverage
is in `tests/integration/publication-queue.test.ts`; it covers the Story/News
workflow, approval, release, expiration, archive, authorization, filtering,
pagination, counts, ordering, and DTO boundary matrix. Existing Story, News,
and ContentPlacement integration coverage remains unchanged and is run as the
full regression. No Queue UI, Dashboard, workflow mutation, scheduling,
Playwright, axe, or visual work is part of C5A-1.
