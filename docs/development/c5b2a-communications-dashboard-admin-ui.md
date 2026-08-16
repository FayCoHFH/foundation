# C5B-2A — Communications Dashboard admin UI

Status: **complete locally on 2026-08-16**

## Delivered surface

The protected, server-rendered Communications Dashboard is available at
`/admin/communications` with the page title **Communications Dashboard**.
Authorized Communications navigation shows the Dashboard before the Queue,
Story, News, and Homepage entries. The route itself remains authoritative: an
unauthenticated request is sent to sign-in and an inactive, denied, or
capability-missing administrator is sent to the access-denied surface.

The page makes one call to the C5B-1 `getCommunicationsDashboard` read model.
It renders the safe DTO directly and does not use a client fetch, internal API,
ORM query in the component, polling, or administrator-specific caching.

## Modules and visibility

Modules render in this order:

1. **Needs Attention** — non-empty, capability-filtered Queue groups for Needs
   Review, Needs Approval, and Approved, Not Released. Each group shows its
   full authorized count, bounded DTO preview, relevant timestamp, owner or
   approval-blocked context, typed Story/News administration links, and a
   Queue link with the matching view parameter. The UI does not recalculate
   Queue counts or classification.
2. **Upcoming** — the C5B-1 chronological list of placement activations and
   News expirations. The visible window is calculated from the DTO's explicit
   evaluation and end instants; the default is fourteen days. Placement items
   link to Homepage curation and their typed target where available. News
   expiration items link to News administration.
3. **Current Curation** — omitted unless the administrator has
   `communications.placements.manage`. When visible, it summarizes all four
   implemented placement slots, current/upcoming assignments, derived status
   language, eligibility warning text, and the existing Homepage curation
   management route. It does not expose future Project or Campaign slots.
4. **Recent Activity** — the C5B-1 allowlisted, capability-filtered activity
   list with safe human-readable action labels, actor display names, times,
   subjects, and typed links. It does not render actor email, raw audit
   metadata, credentials, hashes, or request data.

Unauthorized groups and modules are omitted without zero-value organization-
wide counts. Module-specific empty states are used for no actionable work,
no current-window deadlines, no recent activity, and empty placement slots.
Read failures and invalid `days` query values produce safe messages without
SQL, Prisma errors, stack traces, or hidden data.

## Responsive and accessibility behavior

The Dashboard uses one semantic DOM structure that flows from a single column
to wider responsive grids. It has one H1, labelled section landmarks and H2s,
nested list semantics for groups and activity, descriptive typed links, and
machine-readable `time` elements. Status text does not rely on color, links
have existing visible-focus behavior, and there are no hover-only details or
horizontal-scroll requirements.

The Dashboard is a summary and routing surface only. It adds no inline review,
approval, release, submission, scheduling, assignment, clearing, cancellation,
or other workflow/placement mutation controls.

## Validation and deferred scope

Focused render coverage is in
`tests/unit/communications/dashboard-ui.test.tsx`, including module order,
navigation capability/current state, group visibility/counts/links, typed
Story/News routes, Upcoming ordering and kind labels, all curation statuses,
activity redaction and labels, empty/error states, responsive structure, and
the no-inline-mutation boundary. C5B-1 Dashboard and Queue PostgreSQL
regressions remain required validation for this slice.

Playwright, axe browser scans, formal visual QA, publication scheduling, Media
Library, Newsletter, categories, authors, Projects, Campaigns, and inline
workflow actions remain intentionally deferred to their bounded assignments.
