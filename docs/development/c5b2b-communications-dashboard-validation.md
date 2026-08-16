# C5B-2B — Communications Dashboard browser, accessibility, and visual validation

Status: **complete locally on 2026-08-16**

## Scope and isolation

Validation ran on `codex/c5b2b-communications-dashboard-validation` with the
Next.js production server on port 3100, `APP_ENV=test`, safe test
authentication, and disposable PostgreSQL databases. The visual-preview
server on port 3200 and `habitat_visual_preview`/`habitat_visual_shadow` were
not used or changed. The test-only authentication fixtures add Dashboard
Contributor and Dashboard-only personas without changing production
authorization behavior.

## Browser coverage

The focused suite covers anonymous sign-in protection; authorized navigation;
Editor, Dashboard Contributor, Dashboard-only, Communications Manager,
platform-admin, and forbidden personas; safe counts and bounded previews;
typed Story/News links; Upcoming placement activations and News expirations;
all four placement keys; current, upcoming, empty, and configured-but-not-
currently-effective curation; allowlisted Recent Activity; actor privacy;
empty/error states; and the absence of inline workflow or placement mutation
controls. It also verifies server-rendered content before interaction.

Focused Dashboard browser validation passed **7/7** tests. The complete
Chromium browser suite passed **29/29** tests.

## Accessibility and responsive review

The focused suite ran axe scans across the authorized, limited, denied,
empty/error, ineffective-curation, and narrow-mobile states: **0 violations**.
Manual review confirmed one H1, labelled sections, ordered headings, semantic
lists, descriptive typed links, visible focus treatment, text status labels,
no color-only meaning, keyboard-safe navigation, and no horizontal overflow.

Full-page screenshots were captured at **375x812, 768x1024, 1440x1100, and
1920x1200** for populated and ineffective-curation states. The layouts remain
readable from the single-column mobile flow through the wider curation grids.
Screenshots are test artifacts and are intentionally not committed.

## Regression and validation

- Focused unit coverage: 24/24.
- Full unit suite: 117/117.
- Focused Dashboard PostgreSQL coverage: 6/6.
- Full PostgreSQL integration suite: 145 passed, 1 intentionally skipped.
- Full browser suite: 29/29.
- Static, type, build, migration, and diff checks are recorded in the final
  delivery report.

The Dashboard remains a summary and routing surface. Scheduling, concurrency,
rollback, migration-upgrade, Site Notices, and public Story Submissions are
outside C5B-2B and were not started.
