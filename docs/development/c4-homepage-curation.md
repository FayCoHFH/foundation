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

C4.2B verifies the C3-to-current migration upgrade in
`tests/migrations/c3-to-c4-featured-news-upgrade.test.ts`, with a flag-gated
integration wrapper at `tests/integration/c3-to-c4-featured-news-upgrade.test.ts`.
The harness creates
fresh `habitat_c42b_upgrade_test` and `habitat_c42b_upgrade_shadow_test`
databases, deploys only the checked-in migrations through C3, inserts valid
News, released snapshot/projection, and legacy `FeaturedNewsPlacement` data,
then deploys the remaining checked-in migrations through Prisma. The migration
preserves the News publication identity, uses the legacy change timestamp as
the immediate open-ended `NEWS_FEATURED` start, creates exactly one shared
placement, and removes the obsolete table only after conversion. The test also
verifies the C3 foreign-key failure boundary, migration copy-before-drop
ordering, current migration status, public-projection-only shared placement
resolution, and News index Featured resolution. No migration correction was
required.

The homepage is code-composed: optional Hero, Featured Story, Featured News,
derived Latest News, and the established participation invitation. It has no
page builder, arbitrary placement keys, Project/Campaign placeholders, or
automatic content fallback. `HOME_FEATURED_PROJECT` and
`HOME_FEATURED_CAMPAIGN` remain future catalog extensions until their typed
domains exist.

## C4.3A browser, accessibility, and visual validation

C4.3A browser validation is covered by
`tests/e2e/homepage-curation.spec.ts`. The focused suite exercises configured
and empty homepage states, all three homepage assignment targets, replacement,
future scheduling, cancellation, clearing, unauthorized and capability-limited
administrators, expired and withdrawn eligibility exclusion, ended placement
resolution, stable Publication successor release, public Story and News routes,
and the public shell. The full Playwright suite passed 14/14 tests on isolated
`habitat_c43a_e2e_test` with `reuseExistingServer: false`, port 3100,
`APP_ENV=test`, and test-only authentication. The retained visual-preview
server and its databases were not used.

The focused suite ran axe checks on admin, configured, scheduled, empty,
Story, News index, and News detail states. It also checked keyboard skip-link
operation, labeled placement controls, required schedule validation, landmark
structure, no undefined output, and no horizontal overflow at 375x812,
768x1024, 1440x1100, and 1920x1200. Captured screenshots were manually
reviewed for responsive composition, readable hierarchy, footer/navigation
continuity, and absence of an error overlay. No visual redesign was made. The
homepage's Featured News label uses the existing primary text token so the
configured hero remains above the WCAG AA 4.5:1 contrast threshold.

The only workflow defect found was native validation on the shared Story
workflow form: a required withdrawal reason blocked unrelated successor
approval and release actions for an already-published Story. Non-withdrawal
workflow submits now opt out of that field validation; withdrawal remains
required. Homepage assignment notices are typed and allowlisted for assign,
schedule, clear, and cancel results.

The focused CSP regression remains green: development CSP includes
`'unsafe-eval'`, production CSP excludes it, and the `APP_ENV=test` matrix
follows `NODE_ENV` rather than APP_ENV. The existing local visual-preview
server on port 3200 was not restarted or altered by this slice.
