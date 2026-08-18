# Campaigns C1 — typed publishing domain

Status: **complete locally on 2026-08-18**

## Scope

C1 establishes the Habitat-owned Campaign domain without public routes, admin
UI, media upload, giving checkout, donor records, Stripe, volunteer signup,
email, homepage placement, browser validation, or visual QA.

A Campaign is a public engagement initiative around a defined purpose. It is
not a Project, Story, News item, DonorView campaign/appeal, payment transaction,
donor record, volunteer schedule, or accounting ledger. Campaigns may support
zero, one, or multiple Projects, but do not copy Project operational data.

## Shared publication contract

Each Campaign has one typed `Campaign` root attached to a shared `Publication`
with `kind=CAMPAIGN`. Campaign revisions reuse the existing immutable
`PublicationRevision`, responsibility, workflow, exact-content-hash approval,
immutable snapshot, release-state, discovery-disposition, optimistic
concurrency, and audit records.

The candidate workflow remains separate from factual Campaign status:

- workflow: `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`,
  `APPROVED`;
- public status: `PLANNED`, `ACTIVE`, `COMPLETED`, `PAUSED`, `CANCELLED`;
- release: `UNPUBLISHED`, `PUBLISHED`, `WITHDRAWN`;
- discovery: `ACTIVE`, `ARCHIVED`.

Completed and cancelled Campaigns remain public historical material when
released. Status is never silently changed by a clock and an end date does not
automatically archive or withdraw a Campaign. Current read models are exactly
`PLANNED`, `ACTIVE`, and `PAUSED`; historical read models are exactly
`COMPLETED` and `CANCELLED`. Timing is informational and uses explicit
`startsAt`/`endsAt` validation; an end must not precede a start.

## Revision content

`CampaignRevision` contains code-owned `CampaignType` values:

- `FUNDRAISING`
- `MATCHING_GIFT`
- `VOLUNTEER`
- `AWARENESS`
- `SPONSORSHIP`
- `SPECIAL_INITIATIVE`
- `OTHER`

It also contains bounded title (160), summary (320), safe structured body,
optional goal statement (240), optional timing, and at most ten ordered
`CampaignFact` rows. Facts are editorial display information, not accounting
records.

Optional goal/progress values use integer cents in PostgreSQL `BIGINT`, are
validated as non-negative bounded safe integers, and currently require the
code-owned `USD` currency. Progress may exceed goal. These values are supplied
editorial facts and are never derived from donor, payment, Stripe, or DonorView
data.

## Campaign–Project relationship

`CampaignProject` is revision-scoped and ordered. It permits zero, one, or
multiple existing Project roots, rejects duplicate IDs/order, and never mutates
the Project. A successor Campaign revision can therefore change its linked
Projects without changing an earlier release.

At release, only Projects with an active published public projection contribute
a safe title/slug reference to the Campaign snapshot and
`PublicCampaignProjection`. Unpublished, withdrawn, or archived Projects stay
in the private Campaign revision but are omitted from public references. Public
read-model queries filter references against current Project eligibility, so a
later Project withdrawal cannot leak its title, slug, or existence through a
Campaign page.

Full Project bodies, owners, revision IDs, responsibility, private geography,
and operational fields are never copied into Campaign content or projections.

## Public and administrative read models

`PublicCampaignProjection` contains only released Campaign identity, slug,
title, summary, body, type/status, timing, bounded goal/progress display facts,
ordered facts, release timestamp, and safe linked Project references. It
contains no owner, approval, audit, workflow, donor, payment, or draft data.

The service exposes projection-only reads by slug plus bounded deterministic
lists, type/status filters, current Campaigns, and historical Campaigns.
Withdrawn and archived publications are excluded from ordinary public reads;
completed and cancelled statuses are not.

Administrative reads are body-light list items and authorized detail DTOs with
workflow/release state, responsibility owner, timing, goal display values, and
linked Project count/IDs. No UI or public route is included in C1.

## Authorization and workflow

Campaign operations use database-backed capabilities and active-admin checks:

`campaigns.create`, `campaigns.read.draft.own`, `campaigns.read.draft.any`,
`campaigns.edit.own`, `campaigns.edit.any`, `campaigns.submit_review`,
`campaigns.review`, `campaigns.approve`, `campaigns.release`,
`campaigns.archive`, and `campaigns.withdraw`.

Contributor, Editor, Publisher, and Communications Manager role presets receive
the appropriate own/review/release capabilities. UI visibility is not an
authorization boundary. A creator, owner, or material revision contributor may
not approve their own Campaign. Release requires the exact current approved
revision and content hash.

Every consequential Campaign mutation runs in one transaction with optimistic
publication-version checks, immutable revision/snapshot creation where
applicable, and redacted append-only audit metadata. Request-changes, approval,
release, withdrawal, archive, revision creation, and failed stale mutations do
not create false success audit rows.

## Deferred boundaries

C1 deliberately creates no donation, donor, payment, Stripe, receipt,
recurring-gift, checkout, volunteer-registration, email, media, CTA, homepage
placement, Story, News, or Project mutation. Giving later supplies a separately
approved provider-neutral destination/integration boundary; editorial goal and
progress facts remain non-authoritative until then.

## Migration and evidence

Migration `20260818084000_campaigns_c1_domain` adds the Campaign enums, typed
root/revision/fact tables, revision-scoped CampaignProject relation, public
Campaign projection/facts/references, and the `CAMPAIGN` Publication kind. It
uses foreign keys and indexes for slug lookup, publication/status/type lists,
relation ordering, and Project reverse lookup.

Focused unit coverage validates types/statuses, field bounds, timing, fact
ordering, integer USD amounts, progress-over-goal, Project IDs, slug/hash
inputs, current/historical semantics, and projection-safe content contracts.
Real PostgreSQL integration coverage validates authorization, responsibility,
active-admin enforcement, zero/multiple Project links, public-safe omission and
withdrawal filtering, exact-hash workflow, self-approval separation, release
snapshots/projections, successor privacy and identity stability, current and
historical reads, withdrawal/audit, Campaign boundaries, and independent
Project release/withdrawal.
