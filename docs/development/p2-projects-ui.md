# Projects P2 — administrative and public UI

P2 exposes the typed Projects publication domain from P1 without widening its
data model. Authorized staff use `/admin/projects` to create and review
body-light Project candidates. The editor contains only the approved public
fields: title, summary, type, work status, public geography, dates, restricted
body text, and up to ten ordered impact facts.

The workflow remains server-owned and explicit: submit, request changes, send
for approval, approve, release, withdraw, and archive are separate actions.
The public `/projects` index and `/projects/[slug]` detail route consume only
the immutable public Project projection. A published revision stays visible
while its successor is edited and reviewed.

## Authorization and privacy

Every administrative page and mutation resolves the active administrator and
uses the granular P1 Project capabilities. The public surface never receives
owner, workflow, revision, hash, or private editorial fields. Public geography
is intentionally limited to community, county, and optional public area; no
street address, coordinates, household data, media, map, or Project placement
is part of P2.

## Validation

Focused UI coverage is in `tests/unit/communications/project-ui.test.tsx`.
The existing PostgreSQL Project domain suite remains the authoritative
constraint and publishing regression. Browser validation should use the
isolated disposable database documented in `docs/testing/README.md`, with
test-auth fixtures `project-contributor`, `project-editor`,
`project-manager`, and `project-publisher`. Do not point the test suite at
`habitat_visual_preview`, `habitat_visual_shadow`, or port 3200.

The intended browser matrix is 375×812, 768×1024, 1440×1100, and 1920×1200;
capture responsive evidence under `output/playwright/`. Run axe against the
admin create/detail and public index/detail routes, and treat browser console
errors, error overlays, unauthorized access, and public draft leakage as
failures.
