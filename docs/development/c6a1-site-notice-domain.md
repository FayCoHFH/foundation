# C6A-1 — Site Notice domain foundation

Status: **complete locally on 2026-08-16**

## Boundary

Site Notices are small, temporary operational Communications messages. They
are a distinct typed aggregate, not a Publication subtype, Story, News item,
placement, page-builder block, or permanent public archive. This slice covers
persistence, lifecycle, authorization, scheduling/effectiveness, safe public
and administrative read models, audit, concurrency, migration, and tests.
Site Notice UI and public rendering were delivered in C6A-2A; their browser,
accessibility, responsive, and visual validation is complete in
[C6A-2B](c6a2b-site-notice-validation.md). Public Story Submissions remain a
later C6B slice.

## Domain contract

Each notice has a bounded plain-text title and message, INFO/IMPORTANT/URGENT
severity, and one code-owned target area: `SITE_WIDE` or `HOMEPAGE`. A notice
may have one CTA label/URL pair. Internal relative URLs and HTTPS URLs without
credentials are allowed; `javascript:`, `data:`, protocol-relative,
credential-bearing, and other unsafe URLs are rejected.

The lifecycle is `DRAFT`, `PUBLISHED`, or `WITHDRAWN`. Publishing requires a
non-empty title/message, valid severity and target area, a `startsAt` before an
`endsAt`, and a valid CTA pair. Published effectiveness is derived using the
half-open interval `[startsAt, endsAt)`: start is inclusive and end is
exclusive. Expired notices remain persisted; withdrawal removes effectiveness
without deletion. Already-withdrawn withdrawal is a domain error.

Mutable edits, publication, and withdrawal require the current optimistic
version and `communications.notices.manage`. Stale writes fail with a
concurrency conflict. Consequential mutations and bounded audit evidence run
in one transaction.

## Read models

`getEffectiveSiteNotices` accepts a target area, explicit evaluation time, and
bounded limit. It returns only the minimal public DTO: ID, title, message,
severity, target area, bounded window, and optional CTA. Multiple notices are
ordered URGENT, IMPORTANT, INFO, then newest start time and stable ID.

Administrative list/detail reads require `communications.notices.manage`, are
bounded and deterministically ordered by updated time and ID, and derive
`DRAFT`, `UPCOMING`, `ACTIVE`, `EXPIRED`, or `WITHDRAWN` from lifecycle/window
and the injected evaluation time. They expose safe display names but no audit
rows, emails, raw metadata, or credentials.

## Persistence and audit

The `site_notice` table stores actor references for creation, update,
publication, and withdrawal, lifecycle timestamps, windows, CTA fields, and a
positive version. PostgreSQL checks enforce valid windows for published or
withdrawn rows, CTA pair completeness, lifecycle actor/timestamp combinations,
and positive versions. Indexes support target-area effectiveness and bounded
administrative ordering.

Audited actions are `site_notice.created`, `site_notice.updated`,
`site_notice.published`, and `site_notice.withdrawn`. Summaries include only
severity, target area, window, CTA presence, lifecycle, and version metadata;
they do not copy message text, credentials, private email, or request bodies.

## Validation

Focused unit tests cover input limits, severity/target validation, CTA safety,
half-open boundaries, derived status, ordering, and limit bounds. The real
PostgreSQL matrix covers create/update/publish/withdraw authorization,
concurrency, rollback on audit failure, public target/effectiveness/filter/
ordering/DTO behavior, administrative status/list safety, database checks, and
non-mutating reads. Existing Story, News, placement, Queue, and Dashboard
regressions remain required and are run separately from this domain slice.
