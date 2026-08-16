# C5A-2A Publication Queue admin UI

Completed 2026-08-16. C5A-2A adds the protected, server-rendered
Publication Queue route at `/admin/communications/queue` on top of the C5A-1
read model. It is a read/navigation surface only; workflow mutations remain in
the focused Story and News administration screens.

## Route and navigation

The route requires an authenticated active administrator with
`communications.queue.read`. Unauthenticated users are sent to admin sign-in;
denied users are sent to the existing access-denied page. The Communications
navigation entry is capability-filtered and the route performs its own
server-side authorization check.

Queue views are ordinary URL-addressable links with `aria-current="page"`:
My Drafts, Needs Review, Needs Approval, Approved, Not Released, Recently
Published, Expired News, Archived, and All when the read model exposes an
authorized view. Scheduled is intentionally absent because publication
scheduling does not exist.

## Filters and pagination

The page uses a GET form backed by the C5A-1 query contract. It supports
publication kind (`ALL`, `STORY`, `NEWS`), authorized editorial-owner options,
and page size 25/50/100. Applying filters resets to page 1. View and pagination
links preserve kind, owner, and page-size state; arbitrary query parameters are
ignored. Invalid view, kind, page, and page-size values render a safe validation
message without exposing internal details.

Owner options come from a narrow read-only PostgreSQL query over owners present
in the current administrator's authorized Queue rows. Contributors do not see
the owner control; broader readers see only safe display names and IDs needed
for the filter. The `ALL` count was added to the C5A-1 summary so every visible
Queue view can show a capability-filtered count.

## Row presentation

Rows use one responsive semantic list rather than separate desktop/mobile DOM
trees. Each row shows typed Story/News identity, headline, human-readable
workflow and release state, discovery/availability state where relevant,
editorial owner display name, the view-specific authoritative timestamp, and
News expiration where applicable. Story and News links use the typed paths from
the DTO. Self-approval visibility is presented only as the safe message
“Another qualified approver is required.”

No body, structured JSON, candidate hash, raw approval/audit record, email, or
OAuth/provider field is rendered. There are no inline submit, review, approve,
release, withdraw, archive, reassignment, or bulk actions.

## Responsive and accessibility semantics

The page uses the established admin shell and restrained operational styling.
It has one H1, a Queue-view navigation landmark, associated filter labels, a
semantic list, descriptive typed links, visible focus through the shared
globals, status text independent of color, accessible pagination labels and
current-page indication, view-specific empty states, and keyboard-sized
controls. No hover-only behavior or client-side data fetching is used.

## Implementation and tests

- Route and query parsing: `src/app/admin/communications/queue/`
- Queue presentation: `queue-ui.tsx`
- Shared capability-based Communications navigation:
  `src/components/admin-shell/communications-navigation.ts`
- Focused unit/render coverage:
  `tests/unit/communications/publication-queue-ui.test.tsx`
- Existing C5A-1 contracts and PostgreSQL regression, including owner options:
  `tests/integration/publication-queue.test.ts`

Focused browser, axe, and formal screenshot/visual validation are intentionally
deferred to C5A-2B. Dashboard, scheduling, Media Library, Newsletter,
categories, authors, Projects, Campaigns, and workflow mutations are outside
this slice.
