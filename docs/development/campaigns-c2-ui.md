# Campaigns C2 — public and administrative experience

Status: complete locally on 2026-08-18.

## Scope delivered

C2 adds first-class protected Campaign administration at:

- `/admin/campaigns`
- `/admin/campaigns/new`
- `/admin/campaigns/[id]`

The editor exposes the C1 typed title, summary, Campaign type/status, timing,
structured body, integer-dollar goal/progress UX, ordered facts, authorized
Project selection/order, and bounded ordered action handoffs. Workflow actions
remain explicit: save, submit, request changes, send for approval, approve,
release, withdraw, and archive. Released Campaigns use successor revisions, so
the current public snapshot remains unchanged while a successor is edited.

## Public experience

Public routes are:

- `/campaigns`
- `/campaigns/[slug]`

They read only `PublicCampaignProjection`, present current and historical
Campaigns distinctly, show Campaign purpose/type/status/timing, editorial
progress, facts, and currently eligible public Project references. Unavailable,
withdrawn, or archived Projects are omitted without changing the Campaign.

Campaign presentation is intentionally distinct from Projects: Campaigns lead
with purpose, participation/giving actions, timing, and progress; Projects lead
with the work and its public location/status.

## Action and DonorView boundary

C2 adds `CampaignActionType` values `DONATE`, `VOLUNTEER`, and `LEARN_MORE`.
Each action has a bounded label, order, and reviewed HTTPS destination. URLs
reject credentials and non-HTTPS schemes. Actions render as plain external
links; no iframe, third-party script, tracking injection, payment SDK, donor
form, volunteer form, transaction, or local constituent/volunteer record is
created.

Fayette County Habitat uses DonorView as the current external system of record
for donation management, donor/constituent management, and volunteer
management. C2 documents and tests the handoff boundary without guessing
DonorView URL structures, APIs, webhooks, SSO, or reconciliation behavior.

## Authorization and privacy

Admin routes use the C1 granular Campaign capabilities. Service-side
authorization remains authoritative; navigation visibility is not authorization.
Public DTOs exclude owner, workflow, revision, approval, audit, donor,
volunteer, and private Project data. Production CSP remains unchanged and C2
adds no external scripts or embedded origins.

## Validation evidence

Focused unit/render/action coverage, Campaign and Project PostgreSQL regression,
full integration, Campaign Playwright personas, axe scans, four-breakpoint
screenshots, no-overflow checks, console/CSP checks, format, lint, typecheck,
build, and migration drift checks are recorded in the delivery response.

## Deferred

Deep DonorView discovery/integration, payment/checkout, donor/volunteer records,
reconciliation, email/newsletter, Campaign media, homepage Campaign placement,
and broad Media Library work remain deferred. The next review is a human
Campaigns/Projects visual checkpoint followed by bounded DonorView integration
discovery before Giving implementation.
