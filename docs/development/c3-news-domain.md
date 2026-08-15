# C3 — News domain

C3 adds News as the second typed Communications publication while reusing the
existing `Publication`, immutable `PublicationRevision`, approval, lifecycle,
snapshot, audit, and optimistic-versioning kernel.

`NewsItem` is the typed root. News-specific summary and optional expiration are
immutable revision fields, included in the content hash and copied into the
immutable release snapshot and `PublicNewsProjection`. Public `/news/[slug]`
reads only that projection. `/news` derives Latest from active, published,
non-expired projections; expiration is a deterministic timestamp comparison,
not a destructive job. Expired News remains directly addressable. Withdrawal
removes its projection and archive removes it from ordinary discovery.

The only placement in C3 is the singleton `NEWS_FEATURED` row. It is managed
with `communications.placements.manage`, audited, and is effective only when
its News target remains active, published, and unexpired. C3 deliberately does
not introduce homepage curation or any other placement definition.

News uses a narrower structured-text profile than Story: paragraphs, H2,
lists, and simple safe links/marks; no block quotes, galleries, pull quotes,
raw HTML, or layout nodes.
