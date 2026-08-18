# Projects P1 — typed publication domain

Status: **complete locally on 2026-08-18**

## Scope

P1 establishes the Fayette Habitat Project publication domain. It uses the
existing shared Publication revision, approval, release, immutable snapshot,
responsibility, workflow, audit, and optimistic-concurrency kernel. It does not
add routes or UI.

## Domain contract

Each `PROJECT` Publication has exactly one typed `Project` root. A revision is
immutable, hash-addressed, and contains:

- a title (160 characters), summary (320), community (120), county (120), and
  optional public-area label (160);
- one of `NEW_HOME`, `HOME_REPAIR`, `REHABILITATION`, `ACCESSIBILITY`,
  `COMMUNITY`, or `OTHER`;
- one of `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `PAUSED`, or `CANCELLED`;
- optional start/completion dates, with completion not before start;
- validated restricted rich text and at most ten deterministically ordered
  impact facts (label, value, optional unit).

P1 deliberately has no exact street address, latitude/longitude, homeowner or
applicant identity, household/case record, financial data, construction
scheduling, inventory, media upload, Project placement, Campaign, payment, or
volunteer-signup field.

Project status is independent of editorial workflow and release state. Paused
and cancelled projects remain informational when released; only
`PLANNED`/`IN_PROGRESS`/`PAUSED` are included in the current-project read model.

## Services and read models

`src/modules/communications/projects/project-service.ts` provides:

- capability- and active-admin-checked create, draft read/list, own/any edit,
  submit, review, approval, release, archive, and withdrawal;
- exact current-hash and expected-version checks on consequential mutations;
- self-approval prevention for creators, editorial owners, and material
  revision contributors;
- transactional immutable `PublicationSnapshot` creation and a detached
  `PublicProjectProjection` with ordered impact facts;
- public detail/list reads that select the active projection only, and a
  body-light admin list plus current editable admin detail.

Public Project DTOs contain only released safe fields. They exclude internal
owner, revision, approval, audit, workflow, and storage metadata. Archive
removes ordinary discovery while preserving the public snapshot; withdrawal
removes the public projection and retains the publication history.

## Authorization and audit

P1 adds the following database-backed capability vocabulary:

`projects.create`, `projects.read.draft.own`, `projects.read.draft.any`,
`projects.edit.own`, `projects.edit.any`, `projects.submit_review`,
`projects.review`, `projects.approve`, `projects.release`,
`projects.archive`, and `projects.withdraw`.

The service uses internal `PublicationResponsibility` for own/any scope. UI
visibility is not authorization. Project audit actions use `targetType=Project`
and bounded summaries without editorial body content.

## Migration and verification

Migration `20260818064041_p1_projects_domain` adds the closed Project
discriminator, Project type/status enums, typed root/revision/fact tables, and
public projection/fact tables. It does not alter existing Story, News, or
placement rows.

Focused unit coverage validates field bounds, status/type matrices, date rules,
fact ordering/limits, restricted rich text, deterministic hashes, and the
absence of prohibited operational/identity fields. PostgreSQL coverage
validates the 30 type/status combinations plus capability, ownership,
concurrency, workflow, exact approval/release, projection-only reads, public
status filtering, withdrawal, and audit redaction behavior.

Project routes, admin UI, browser/axe validation, media, placements, Campaign
relationships, operational construction workflows, and financial integrations
are intentionally deferred.
