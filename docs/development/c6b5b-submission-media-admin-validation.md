# C6B-5B Story Submission media administration browser validation

Status: **complete locally on 2026-08-18**. This record validates the C6B-5A
confidential administrative media, clearance, evidence, restriction, and
promotion UI. It does not implement Story conversion, automatic Story media
insertion, bulk actions, public intake enablement, browser redesign, or later
C5 work.

## Boundary and environment

The focused suite is
`tests/e2e/c6b5b-submission-media-admin-validation.spec.ts`. It runs Chromium
serially through the isolated Next production server on `127.0.0.1:3100` with
`APP_ENV=test`, test authentication, disposable PostgreSQL databases, and
local private storage. `PUBLIC_STORY_SUBMISSIONS_ENABLED=true` was used only
inside this disposable run so the fixture could create real submission media
through the existing public issue/upload/process pipeline; production intake
remains disabled by default. The visual-preview databases and port 3200 were
not used, changed, or stopped.

The synthetic fixture is self-cleaning. It removes promoted assets, usages,
submission records, and the exact local storage directory after the suite.
The broader regression run used a separate fresh database with public intake
disabled and excluded only this assignment-owned focused spec because that
spec requires the isolated enabled fixture environment.

## Concrete defect fixed

Next.js rejected the nested media routes before the browser suite could start:
the existing submission detail route used `[id]`, while the nested route tree
used `[submissionId]` for the same dynamic segment. Next requires one segment
name for that path position. The nested routes now use `[id]` consistently and
derive the local `submissionId` value inside the page and delivery handlers.
The public URL shape is unchanged:
`/admin/communications/submissions/[id]/media/[mediaId]`.

## Focused browser coverage

All 6 focused tests passed:

- reviewer-only access renders the private review derivative, technical and
  contributor context, all five sensitivity declarations, authoritative
  clearance requirements, public-use eligibility, credit separation, strict
  CSP, zero axe violations, responsive no-overflow screenshots at 375, 768,
  and 1440 pixels, and no browser console/page errors or confidential browser
  storage;
- anonymous and dashboard-only users are denied submission and media access;
- a reviewer adds a bounded subject and clearance, verifies it, uploads JPEG
  evidence through the existing authenticated evidence action, reviews the
  sanitized derivative, and explicitly downloads the original with attachment
  semantics;
- a promoter verifies the final gate, selects final public credit, promotes
  exactly once, and leaves Publication/Story state unchanged;
- a reviewer restricts promoted media while existing use remains visible, and
  only a super-admin restorer can restore eligibility without deleting usage;
- a text-only submission shows a truthful empty media state.

The focused run used the real server-side services and asserted private
delivery headers (`private`, `no-store`), no public URL, no storage keys,
checksums, upload tokens, raw filenames, or confidential notes in the rendered
HTML.

## Regression and validation

- `pnpm format:check` — passed
- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test:unit` — 228/228 passed
- PostgreSQL `pnpm test:integration` on a fresh migrated/seeded database —
  228 passed, 1 intentional migration-wrapper skip
- `pnpm build` — passed; nested media and evidence routes compiled
- focused C6B-5B Playwright suite — 6/6 passed
- broader Playwright regression with public intake disabled and C6B-5B
  focused spec excluded — 45 passed, 10 intentionally skipped
- `git diff --check` — passed

The C6B-5B enabled fixture database, shadow database, and local storage were
disposable and removed after validation. The separate PostgreSQL regression
databases were also removed. No Story conversion, public Media Library
redesign, email, bulk operation, or browser screenshot artifact is committed.
