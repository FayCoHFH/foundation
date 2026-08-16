# C5A-2B Publication Queue browser validation

Completed 2026-08-16 on the isolated `codex/c5a2b-publication-queue-validation`
branch. This slice validates the C5A-2A Queue as a protected, server-rendered
read-and-navigation surface. It does not add workflow mutations, scheduling,
Dashboard behavior, Media Library, Newsletter, categories, authors, Projects,
Campaigns, or other C5B work.

## Browser harness and personas

The focused suite is
`tests/e2e/publication-queue.spec.ts`. It uses the repository Playwright
configuration on port 3100 with `APP_ENV=test`, isolated PostgreSQL, the
loopback-only test-auth seam, and `reuseExistingServer=false`. The visual
preview server on port 3200 and both visual-preview databases are not used.

The suite establishes real local principals through the existing test-auth
route and uses the capability-backed Contributor, Editor, Communications
Manager, and signed-in Platform Admin/no-Queue-access fixtures. Deterministic
Story and News rows cover owned and other-owner drafts, review and approval
states, approved successors, released/current and expired News, archived and
withdrawn records, self-approval blocking, typed detail relations, and more
than one page of authorized rows.

## Coverage

- Anonymous access redirects to sign-in; a signed-in administrator without
  `communications.queue.read` is denied and sees no Queue data or navigation.
- Contributor visibility is owner-scoped. My Drafts includes owned Story and
  News, excludes another owner, hides broader views and owner filtering, and
  rejects a direct unauthorized owner query.
- Editor review visibility is capability- and publication-kind-aware; both
  seeded Story and News review rows appear because the accepted Editor preset
  grants both review capabilities. The detail route does not expose approve or
  release controls to the Editor.
- Communications Manager coverage exercises My Drafts, Needs Review, Needs
  Approval, Approved, Not Released, Recently Published, Expired News,
  Archived, and All, including counts, self-approval messaging, current
  approved successors, expiration, archive, and withdrawn policy behavior.
- Story/News kind filtering, authorized owner options, owner persistence,
  invalid owner rejection, URL-addressable view changes, and page-size
  persistence/reset behavior are browser-proven.
- Pagination uses the accepted 25/50/100 contract, keeps view/kind/owner
  state, has deterministic adjacent pages, and has no duplicate rows.
- Rows expose only typed kind, headline, workflow/release/discovery or News
  availability, authorized owner name, applicable timestamp, expiration, and
  typed Story/News detail links. Body text, JSON, hashes, approval/audit data,
  email, and provider information are absent.
- All seven view-specific empty states and invalid view/kind/owner/page/page
  size handling are safe, navigable, and free of SQL, Prisma, stack-trace, or
  raw query echoing.

## Accessibility and visual review

The focused suite runs axe against Contributor My Drafts, Editor Needs Review,
Manager Needs Approval, Approved Not Released, Recently Published, Expired
News, Archived, active filtered/page-two, empty, and access-denied states.
All required scans pass without rule suppression.

Manual review confirmed one H1, Administration and Queue landmarks,
`aria-current` on the active route/view/page, associated filter labels,
semantic lists, descriptive typed links, text status independent of color,
pagination labels, visible focus styles, keyboard-sized controls, mobile
stacking, safe empty/error semantics, and no hover-only content or duplicate
mobile/desktop row trees. The suite checks no horizontal overflow at every
required viewport and captures Chromium screenshots at 375×812, 768×1024,
1440×1100, and 1920×1200 for Contributor My Drafts, Editor Needs Review,
Manager Needs Approval, populated filters, page two, and an empty view.
Screenshots remain test artifacts and are not committed.

The only defect exposed by the required axe/browser journey was the existing
Story workflow “Request changes” and “Withdraw public Story” secondary button
style: the shared Button base class left white text on the cream surface.
Adding the existing foreground token as an important override fixes the
contrast without changing workflow behavior or visual design.

## Server-rendering and regression evidence

The browser observes normal navigations for Queue filters and pagination, no
Queue API request, no client-side data-table/state library, and no body JSON in
the HTML. The full Playwright suite covers the existing Story, News, homepage,
public-shell, authentication-boundary, and Queue journeys. Unit, PostgreSQL
integration, formatting, lint, typecheck, production build, migration, and
diff validation are required before commit; results are recorded in the final
delivery report.
