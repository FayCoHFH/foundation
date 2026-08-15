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

The homepage is code-composed: optional Hero, Featured Story, Featured News,
derived Latest News, and the established participation invitation. It has no
page builder, arbitrary placement keys, Project/Campaign placeholders, or
automatic content fallback. `HOME_FEATURED_PROJECT` and
`HOME_FEATURED_CAMPAIGN` remain future catalog extensions until their typed
domains exist.
