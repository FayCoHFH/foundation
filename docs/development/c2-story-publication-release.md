# C2 Story publication release

Status: implemented locally on 2026-08-15.

C2 adds the first deliberately narrow public publication path. A `stories.publish`
command first verifies an active local principal, capability, aggregate version,
current candidate hash, and approval record for that exact revision. In one
PostgreSQL transaction it creates an immutable `PublicationSnapshot`, upserts a
`PublicStoryProjection` copied from that snapshot-safe revision data, updates the
active snapshot/release pointers, and records release lifecycle and audit evidence.
The public `/stories/[slug]` route reads only `PublicStoryProjection`; it does not
query `PublicationRevision`, `Publication`, workflow, or draft data.

Slugs are lowercase canonical URL segments containing letters, numbers, and
hyphens. A successor release can replace the projection at the same or a new slug;
previous snapshots remain immutable evidence. This slice does not introduce slug
history or redirects.

Withdrawal requires `stories.withdraw` and a reason. It transactionally deletes
the public projection and clears the active pointer while retaining all revisions,
snapshots, lifecycle history, and audit records. The shared archive disposition is
persisted on `Publication` for later discovery work; no archive browse or restore
experience is introduced here.

No Story listing/search, News, media, placements, homepage curation, dashboard,
newsletter, or rich-editor work is included.
