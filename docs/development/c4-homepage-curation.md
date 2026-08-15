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

The homepage is code-composed: optional Hero, Featured Story, Featured News,
derived Latest News, and the established participation invitation. It has no
page builder, arbitrary placement keys, Project/Campaign placeholders, or
automatic content fallback. `HOME_FEATURED_PROJECT` and
`HOME_FEATURED_CAMPAIGN` remain future catalog extensions until their typed
domains exist.
