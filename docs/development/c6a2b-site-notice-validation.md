# C6A-2B — Site Notice browser, accessibility, responsive, and visual validation

Status: **complete locally on 2026-08-16**.

## Scope and environment

This slice validates the C6A-2A Site Notice administration and public
presentation without adding scheduling, dismissal, archive, submission, or
other product behavior. The focused browser run used an isolated disposable
PostgreSQL database (`habitat_c6a2b_test`) and the existing safe `APP_ENV=test`
test-auth fixtures on port 3100. The existing human-review preview on port
3200 and its `habitat_visual_preview`/`habitat_visual_shadow` databases were
not used or changed.

## Browser personas and journeys

The manager persona used the existing `news-manager` fixture, which resolves
to the Communications Manager capability set including
`communications.notices.manage`. The denied persona used `story-editor`, and
the anonymous journey used a fresh context. The nine focused tests cover:

- authorized list/create/detail navigation and capability-filtered navigation;
- anonymous sign-in redirect and denied access without notice data leakage;
- draft, upcoming, active, expired, withdrawn, and multiple-order list states;
- safe field rendering with no actor email, audit action, lifecycle controls,
  or arbitrary query-string status injection;
- create/update validation, retained safe values, associated errors, and
  focus return after repeated failures;
- stale optimistic-concurrency rejection while retaining the entered value;
- publish and withdraw lifecycle truth, record preservation, and no delete,
  restore, or republish controls;
- SITE_WIDE and HOMEPAGE target filtering, severity/order, internal and
  external CTA behavior, end-time context, and projection-only public fields;
- homepage, News index/detail, and Story detail dynamic rendering, empty
  state, CSP, console, and visible-overlay checks.

## Accessibility and visual review

All focused pages passed axe with zero violations. Manual review confirmed
landmarks and heading hierarchy, keyboard-visible focus, form labels and
error associations, repeated-error focus return, semantic list/aside structure,
safe external-link treatment, no visible error overlay, no horizontal overflow,
and truthful withdrawn/empty states. Responsive screenshots were captured and
reviewed for 375x812, 768x1024, 1440x1100, and 1920x1200 on public homepage
notices and administrative list/create/draft/withdrawn states.

The focused public run verified that the production `next start` response is
dynamic and that its CSP excludes `'unsafe-eval'`; no public route produced a
React/Next error overlay or browser console error.

## Validation results

Focused browser validation:

```text
pnpm exec playwright test tests/e2e/site-notice.spec.ts
9 passed
```

Full browser regression:

```text
pnpm test:e2e
38 passed
```

Unit and PostgreSQL integration regression:

```text
pnpm test:unit
21 files passed; 131 tests passed

pnpm test:integration
9 files passed; 155 tests passed; 1 migration-wrapper test skipped by design
```

The focused suite writes review screenshots under `output/playwright/` and
the disposable C6A-2B databases are removed after validation. No assignment
database or human-review preview database is retained.

## Defects found and corrected

- Moved pure notice default formatting into the server-safe form contract so
  the detail route does not call a client module from the server.
- Made repeated server-action errors refocus the accessible error summary.
- Corrected public translucent-header text colors where axe found sub-AA
  contrast, without changing layout, copy, placement, or product behavior.
- Corrected browser fixture context creation, validation-stage assertions,
  concurrency wording, public limit fixtures, and framework route-announcer
  filtering in the focused harness.

C6A-2B closes the local browser/accessibility/responsive/visual validation
assignment. Public Story Submissions remain the separate C6B assignment.
