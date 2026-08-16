# C5B-1 Communications Dashboard read model

Status: **complete locally on 2026-08-16**

C5B-1 implements the derived Communications Dashboard read model. It is a
capability-filtered administrative action center, not a source of truth and
not a reporting or analytics product.

## V1 modules

The root `CommunicationsDashboard` DTO contains four bounded modules:

- **Needs Attention** reuses the Publication Queue's `NEEDS_REVIEW`,
  `NEEDS_APPROVAL`, and `APPROVED_UNRELEASED` classification, counts, exact
  current-candidate approval rules, capability-filtered visibility, and
  deterministic previews. The default preview is five items per group and
  the maximum is ten.
- **Upcoming** combines only future ContentPlacement activations and released,
  active News projections whose authoritative `expiresAt` falls inside the
  requested window. It does not imply a publication scheduler. The default
  horizon is fourteen days and the maximum is ninety days; the item limit is
  twenty by default and fifty maximum.
- **Current Curation** reads the four implemented code-owned keys:
  `HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`.
  It derives `ACTIVE`, `EMPTY`, `UPCOMING_ONLY`,
  `CONFIGURED_BUT_INEFFECTIVE`, and `CURRENT_AND_UPCOMING` without adding a
  persisted Dashboard status. Target details use projection headline/slug
  fields only and never load body JSON.
- **Recent Activity** is a safe projection over an allowlist of existing
  Story, News, and placement audit actions. It is not raw Audit Log access.
  It reads actor display names without email, batches subject hydration, maps
  to structured summary codes, and omits unreadable subjects. The default
  limit is twenty and the maximum is fifty.

## Boundaries and authorization

The service requires `communications.dashboard.read` and an active local
administrator. Module and row visibility remains capability-based:

- Queue-derived Needs Attention requires `communications.queue.read` and
  retains the Queue's Story/News draft, review, approval, release, ownership,
  and self-approval semantics.
- Placement Upcoming and Current Curation require
  `communications.placements.manage`. Placement activity uses that same
  existing capability; no new permission was introduced.
- News expiration and publication activity require the existing typed News
  inspection/publication capabilities. Story and News draft activity is
  additionally restricted to any-scope or the current editorial owner.

Dashboard access does not grant access to a publication, placement, draft,
approval, or audit record. All checks happen in the server-side read model.

## Clock, DTO, and source-of-truth rules

`evaluationTime` and `upcomingUntil` are explicit normalized instants. The
service default is a fourteen-day window, while tests inject both instants.
Windows must be forward and no longer than ninety days. Generated time is the
single evaluated instant returned in the root DTO.

The DTO uses explicit safe shapes rather than Prisma records. It contains no
Story or News body, revision JSON, approval row, raw audit summary, candidate
hash, actor email, OAuth/provider data, credentials, or private request data.
Public paths are built from typed Story/News projection slugs; administrative
paths are typed by the Story/News root ID. Placement state, workflow state,
release state, discovery disposition, expiration, and audit history remain in
their authoritative domain records.

## Query and performance design

Needs Attention calls the existing Queue read model for each of its three
views, preserving database-backed counts and Queue ordering. Upcoming and
Current Curation use bounded reads over the fixed placement catalog and select
projection metadata without bodies. News expiration filtering is indexed by
the existing projection expiration index and verifies the active snapshot.
Recent Activity applies an allowlist, time/order bound, and conservative
over-fetch before three batched Story/News/placement subject reads; it does
not perform per-row hydration or select raw audit metadata.

No Dashboard table, materialized count, duplicate workflow/placement state,
cache, or migration was added. Dashboard reads are side-effect free.

## Deferred scope

The Dashboard route, UI/cards, inline actions, browser/axe/visual validation,
publication scheduling, Events, Campaigns, Media Library, Newsletter,
categories, authors, Projects, and C5B-2 remain intentionally deferred.

## Evidence

Focused unit coverage validates input/window rules, bounded limits, module
visibility, curation status derivation, action allowlisting, summary-code
mapping, and redaction boundaries. Focused PostgreSQL coverage validates
Dashboard authorization, all four modules, Queue count/preview reuse, News
expiration behavior, placement cancellation/window behavior, target
eligibility, activity authorization/redaction/order/limits, typed paths, DTO
privacy, and no mutation of Queue/placement/audit state. The full unit,
integration, format, lint, typecheck, build, Prisma safety, and migration
regression commands are recorded in the C5B-1 delivery response.
