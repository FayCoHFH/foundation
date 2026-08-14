# Communications Domain Review — Completed Record

Status: **Completed 2026-08-14**

This record closes Gate C, the Communications Domain Product & Architecture Review. It records product decisions that are ready to guide implementation; detailed aggregate, workflow, validation, and authorization mechanics belong in [Communications architecture](../architecture/communications.md). It does not authorize application scaffolding or reopen the greenfield, privacy, ownership, or legacy-independence foundation.

## Decisions confirmed

1. Communications is a first-class domain with typed Stories, News, Newsletter Editions, Media, Authors, Categories, Site Notices, Story Submissions, shared publishing infrastructure, a cross-type Publication Queue, a task-oriented Dashboard, and constrained content placements.
2. Stories are enduring, narrative, rich-media editorial work. News is timely, concise, announcement-oriented communication. They remain separate typed roots and public experiences; they never collapse into a generic Content record or duplicate publishing engines.
3. Shared publishing provides immutable revisions, exact-revision/hash approval, scheduling, immutable public snapshots, contextual media usage, SEO, public-safe relations, and meaningful audit events. Published snapshots never fall back to mutable drafts; a successor draft can coexist with the published revision.
4. A normal author cannot approve their own revision. A Super Admin can make an explicit, reasoned, audited override. Material post-submission content, relationship, media, or SEO changes invalidate approval; non-material administrative exceptions must be explicit and audited.
5. V1 uses six code-owned typed singleton placement definitions: `HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, `HOME_FEATURED_PROJECT`, `HOME_FEATURED_CAMPAIGN`, and `NEWS_FEATURED`. The first five are manual homepage slots; `NEWS_FEATURED` serves the News experience. Each validates its legal target and public eligibility, can have an active window, has audited history, and hides or uses its code-defined fallback when its domain is unavailable. `isFeatured` flags and a universal page builder are prohibited.
6. V1 homepage behavior is hybrid: Hero, Featured Story, Featured News, Featured Project, and Featured Campaign are manually curated; latest News and upcoming Events are derived; approved Impact measures and stable domain CTA/configuration sections remain hybrid. Other placement definitions require a demonstrated editorial need.
7. V1 has no generic tags. Categories are a controlled, flat editorial taxonomy with a governance owner, allowed content types, name, slug, description, ordering, and archive behavior. Domain links are preferred over taxonomy for real projects, programs, campaigns, events, grants, partners, and people.
8. An Author Profile is a public attribution profile independent of administrator identity. It can represent staff, Board, volunteers, community contributors, an organization byline, or a limited/pseudonymous participant identity where approved. It may link to Person or AdminUser but is not required to do so.
9. Site Notices are a minimal separate operational channel with title, message, severity, target area, start/end times, optional CTA, controlled publication, automatic expiry, and audit. They do not replace canonical operational records or normal News.
10. Public Story submissions are an isolated private intake: editor review, rejection/archive or conversion into a separate Story Draft, then normal workflow. They are not Story drafts, do not give the submitter an admin account, and may include only minimum data and private uploads under consent/rights controls. No public News submission exists in V1.
11. Newsletter Editions own curated order and edition context, referencing canonical public content rather than duplicating it. DonorView remains the mailing-list/subscriber-consent system of record. Sender selection, delivery implementation, and local archive are deferred; V1 preserves signup handoff and a provider-neutral Edition contract without subscriber replication, while Edition authoring/curation is V1.1.
12. Authoritative publication dates/schedules preserve a future derived editorial calendar. No Calendar UI, drag-to-reschedule, cross-type planning record, or Communications Package is V1. Projects, Programs, Campaigns, Events, and public Grant acknowledgments are current coverage anchors; a Package needs a demonstrated grouping lifecycle that those relationships cannot express.

## V1 product decisions

### Story

A Story has headline, optional deck, slug, excerpt, optional hero-media usage, versioned structured body, structured bylines, optional primary category, SEO/publication metadata, editorial owner, and optional meaningful public-safe domain relations. It is generally evergreen and can receive a successor revision without changing the published snapshot. V1 structured content supports paragraphs, headings, lists, blockquotes, attributed pull quotes, images, galleries, captions, contextual CTA, and divider. Related cards render from typed fields outside the body; approved-provider video embeds, callouts, and statistics are V1.1.

### News and its lifecycle

A News item has headline, short summary, slug, concise structured body, publication/effective/relevance date metadata, optional hero/thumbnail media usage, SEO metadata, optional relevance end time, and optional meaningful related public records. Its candidate workflow is `DRAFT` → `IN_REVIEW` → `CHANGES_REQUESTED` or `PENDING_APPROVAL` → `APPROVED`. Schedule, publish, cancellation, withdrawal, and supersession are release/snapshot behavior; archive is the shared Story/News discovery disposition; News expiration is derived availability.

At relevance end, a published News item automatically becomes **Expired**: it leaves current/latest lists and active placements but remains publicly addressable with a clear no-longer-current label. An authorized editor may **Archive** it to a historical archive that is still directly addressable and searchable by default. **Withdrawn** intentionally removes it from public availability and placements while preserving internal history. Restoration/republication returns through ordinary review/approval. Neither expiration nor archive deletes a record.

### Queue and Dashboard

The V1 Queue combines Story and News work while retaining type identity. It provides **My Drafts**, **Needs Review**, **Needs Approval**, **Approved**, **Scheduled**, **Recently Published**, **Expired News**, and **Archived** views; the first four reflect candidate workflow and the remaining views reflect release/public history. Filters cover type, candidate state, public author/editorial owner, assigned reviewer/approver, related Project/Program/Campaign, and scheduled/publication date. Inline operations are responsibility assignment and preview only; substantive changes and transitions occur in a typed editor with revision context. Queue state is derived from the workflow and release sources of truth.

The V1 Dashboard has four capability-filtered modules: **Needs Attention** (the viewer's review/approval work, blockers, release/scheduling failures, consent/rights gaps); **Upcoming** (approved candidates with scheduled releases and News expiring in 14 days); **Current Curation** (the five homepage slots); and **Recent Activity** (meaningful candidate workflow, release, placement, rights, and withdrawal events). Counts link to authoritative filtered views. Vanity metrics, broad freshness scoring, broken-link scans, and newsletter readiness are V1.1.

### Publication, media, and warnings

Publication is blocked by invalid structured content, missing required author/summary/slug/SEO metadata, absent required consent, unsafe/private relation, uncleared/unready media, contextual alt-text/decorative treatment gap, or a stale/missing approval. Warnings may cover optional SEO refinements, scheduled expiry, missing optional media, non-blocking link review, or placement ending soon. Informational notices never block publication. Only READY and CLEARED media assets/usages can enter public snapshots. Asset facts live on MediaAsset; crop/focal use, role, caption, credit, and contextual alternative live on the media usage.

## Public information architecture and discovery

Public Communications has distinct canonical spaces for Story collection/detail, News index/detail/archive, controlled category archives, approved Author Profiles, Newsletter archive/web editions when launched, a Site Notice surface, and isolated Story contribution. This does not fix the public Stories label, global navbar, final route wording, or page composition.

Story and News pages use accurate canonical, social, date, publisher, and author metadata. Use `Article` for Stories and `NewsArticle` only where it accurately represents the News item; use `ProfilePage` with `Person`/`Organization` main entity and `BreadcrumbList` only when visible approved public content supports them. Expired/archived pages can remain indexed when historically useful; a documented `noindex` decision excludes the record from sitemap, site search, and external-index eligibility. Drafts, previews, submissions, private media, and withdrawn content cannot be indexed. V1 search uses PostgreSQL full-text search over directly addressable, indexable public Story/News title, deck/summary, permitted body, Author name, category, and public related-record names. Discovery prioritizes real typed relations, controlled category browsing, explicit curated related items, then a deterministic shared-relation/category-plus-recency fallback. No external search, personalization, or algorithmic recommendations are V1.

## Scope boundary

| V1 | V1.1 / near term | Future |
| --- | --- | --- |
| Typed Stories and News; shared publication kernel; Story/News Queue; four Dashboard modules; five homepage slots plus News-feature selection; Authors, flat Categories, media readiness; Site Notices; isolated Story Submission intake; Newsletter signup handoff and provider-neutral Edition contract | Newsletter Edition authoring/curation, web archive, and delivery after operations confirmation; Calendar derived read view; additional typed placements; richer blocks and approved embeds; broken-link/freshness warnings | Generic placement/page-builder; drag-and-drop planning; Communications Package if justified; press releases; public News tips; subscriber storage; personalization, social automation, AI moderation |

## Genuine Sven questions

None block implementation. Before Newsletter delivery or a public archive is launched, staff must confirm the sending workflow/provider and intended archive/retention policy. Before publishing participant/minor submissions, staff must supply the required consent and review policy; the V1 model safely holds such material out of public workflow until then.

## Implementation readiness

**Communications Domain ready for application scaffold: YES.**

The next assignment is **Slice 1 — Application Foundation and Scaffold**. Treat the Communications architecture as frozen enough for implementation; later names, navbar placement, visual composition, category vocabulary, and verified content remain normal content/design work, not architecture blockers.
