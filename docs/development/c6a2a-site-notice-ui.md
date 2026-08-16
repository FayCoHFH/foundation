# C6A-2A — Site Notice administration and public rendering

Status: **complete locally on 2026-08-16**.

## Boundary

Site Notices are temporary operational messages. They remain separate from
Stories, News, homepage ContentPlacements, the Publication Queue, and the
Communications Dashboard. This slice adds the protected administrative
interface and server-rendered public presentation; browser, axe, and visual
validation belong to C6A-2B.

## Administrative experience

The capability-filtered Communications navigation now includes Site Notices
for `communications.notices.manage` principals. The protected routes are:

- `/admin/communications/notices`
- `/admin/communications/notices/new`
- `/admin/communications/notices/[id]`

The list uses the C6A-1 administrative DTO and authoritative updated-time/ID
ordering. It shows title, severity, target area, lifecycle, derived status,
activation window, updated time, updater, and a typed detail link. The empty
state is concise and only exposes creation to an authorized principal.

Create and edit forms use typed severity/target selects, plain-text title and
message fields, Central Time (`America/Chicago`) local date/time inputs, and an
optional validated CTA pair. Create always produces a draft. Lifecycle, actor,
and version are not editable controls; edit forms carry the expected version
as a protected hidden value and the C6A-1 service enforces concurrency.

Publish is shown only for a complete draft valid for publication. Withdrawal
is shown only for published notices and explicitly removes public display
while preserving the record. Withdrawn notices do not present restore,
republish, or delete behavior.

Form errors retain safe submitted values, provide a focusable summary and
field-associated errors, and never expose raw validation objects. Post-action
messages use an allowlisted query status code only after a mutation commits.
Stale writes return a non-success conflict message.

## Public rendering

The public `SiteNoticeRegion` server component reads the bounded C6A-1 public
DTO at one request evaluation instant. Effective `SITE_WIDE` notices render
below the masthead across the existing public homepage, News, and Story routes.
Effective `HOMEPAGE` notices render near the top of the homepage before its
editorial content. Empty results render no region or frame.

The reusable notice markup is an identified `aside` containing a semantic
list. Severity is always textual and uses the existing editorial tokens:
restrained denim/sky for Info, oak/cream for Important, and a limited
paintbrush accent for Urgent. No static live alert, animation, dismissal,
tracking, archive, detail route, or client fetch is introduced. A complete CTA
renders one internal or HTTPS link; external HTTPS links use a new-tab,
`noopener noreferrer` treatment. The public component receives only the
minimal public DTO and does not render actor, lifecycle, version, audit, or
database metadata.

End-time context is formatted in Central Time and represented by a machine
readable `<time>`. Existing public routes are already force-dynamic, so the
time-sensitive read does not introduce stale static caching or polling.

## Validation and deferred work

Focused unit/render coverage covers navigation, list/form fields, protected
expected version, lifecycle action visibility, withdrawn boundaries, safe
status codes, field association, public DTO-only rendering, order, empty
state, severity, CTA safety, formatted time, static semantics, and the single
responsive DOM structure. The C6A-1 PostgreSQL suite and full integration
regression remain required. Playwright, axe, formal screenshot QA, Dashboard
integration, dismissal/preferences, and C6B work are intentionally deferred.
