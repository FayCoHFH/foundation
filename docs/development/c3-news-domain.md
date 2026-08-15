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

## C3.1 validation closure

Completed 2026-08-15.

- Browser coverage verifies the public index/detail, latest ordering, Featured
  News configuration and intentional no-feature fallback, immutable public
  projection behavior during a draft successor, expiration, withdrawal, the
  representative create/review/approve/release workflow, placement capability,
  and denied News creation.
- Axe scans pass for `/news`, `/news/{slug}`, and the representative News
  creation page. The checks wait for the bounded editorial entrance transition
  to settle before measuring rendered contrast.
- Public News detail renders truthful `NewsArticle` JSON-LD from the immutable
  public projection: headline, description, publication time, and canonical
  page only. Optional author, image, and modified-date fields are omitted when
  no approved public data exists.
- Manual rendered-browser QA covered `/news` and `/news/{slug}` at 375×812,
  768×1024, 1440×1100, and 1920×1200, including a configured Featured News
  state. Editorial hierarchy, mobile stacking, reading width, metadata,
  navigation, footer, and horizontal overflow were reviewed.
- The protected Playwright suite runs on dedicated loopback port 3100 with
  `APP_ENV=test`, guarded test authentication, no server reuse, and one worker
  because its test-auth/database fixtures share one explicitly disposable
  database.

The C3.1 implementation adds no schema migration. The local Prisma schema
engine returned `Schema engine error` for `db:migrate:status` and
`db:migrate:deploy` before connection; `db:validate` passed and the previously
validated C3 migration was applied to the disposable database from its checked
in SQL for this validation run. Recheck that local engine condition before the
next schema-changing slice.
