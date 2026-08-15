# C4 Homepage curation and content placements

C4 adds four code-owned singleton placement keys: `HOME_HERO`,
`HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`. Assignments
use a real Publication foreign key, explicit UTC windows, optimistic versions,
and append-only audit evidence. The application validates the closed
Story/News target matrix; PostgreSQL rejects invalid windows and overlap.

Public resolution reads only released, active public projections. Expired News,
withdrawn content, archived content, and drafts remain historical/admin data but
are never effective placements. `NEWS_FEATURED` was migrated from its C3 table
without discarding configured data.

Cancelled future assignments retain their original scheduled window and record
`cancelledAt`. They are excluded from current, upcoming, public, and overlap
resolution. PostgreSQL coverage lives in
`tests/integration/content-placement.test.ts`.

C4.2A-1 completes PostgreSQL coverage for all eight Story/News target-kind
combinations, unreleased/withdrawn/archived/expired new-assignment rejection,
post-assignment expiry and withdrawal/archive ineligibility, retained placement
history, empty effective resolution, and continued resolution for eligible
released content. Effective public resolution returns only safe placement
metadata and `PublicStoryProjection`/`PublicNewsProjection` DTO fields; it does
not expose authoring, workflow, approval, audit, or internal ownership data.

C4.2A-2 completes PostgreSQL coverage for half-open immediate and future
windows, invalid-window rejection, exclusion-constraint overlap behavior,
adjacency, cancelled/history overlap exclusion, deterministic current/upcoming
resolution, replacement and clear behavior, future cancellation, persisted
optimistic concurrency, and bounded assignment/schedule/replacement/clear/
cancellation audit evidence. Replacement versions advance from the prior row;
cancelled rows are excluded from mutation selection; clear and cancellation
mutations are audited; stale writes and already-cancelled operations fail
without false success events. Focused coverage remains in
`tests/integration/content-placement.test.ts`.

C4.2A-3A completes PostgreSQL successor-release coverage in
`tests/integration/content-placement-successor-release.test.ts`. Story and
News successor revisions remain invisible to placed public output through
draft, submission, and approval; releasing the exact approved successor
updates every placement for the stable Publication identity without a
placement mutation or placement audit event. The slice also verifies failed
hash/approval releases preserve the prior output, immutable distinct release
snapshots remain queryable, `NEWS_FEATURED` and multi-slot News resolution use
the successor projection, and News expiration is evaluated from the successor
projection without rewriting placement history. Resolution assertions are
limited to the public projection DTO and safe placement window metadata.

C4.2A-3B completes PostgreSQL rollback coverage in
`tests/integration/content-placement-rollback.test.ts`. A narrow optional
audit-writer dependency defaults to the production transaction-scoped writer
and is supplied directly only by integration tests to throw after placement
work has begun. Immediate, bounded, future, replacement, clear/end, and
future-cancellation mutations roll back placement rows and required audit
evidence together; original windows, versions, cancellation state, target
Publication, current/upcoming resolution, and history remain intact after
failure. Retries using the original version succeed, and successful mutation
types retain one paired success audit. No production failure switch or schema
migration was added; placement-persistence failure injection remains
intentionally unintroduced because no safe existing repository seam supports
it without a production backdoor.

The homepage is code-composed: optional Hero, Featured Story, Featured News,
derived Latest News, and the established participation invitation. It has no
page builder, arbitrary placement keys, Project/Campaign placeholders, or
automatic content fallback. `HOME_FEATURED_PROJECT` and
`HOME_FEATURED_CAMPAIGN` remain future catalog extensions until their typed
domains exist.
