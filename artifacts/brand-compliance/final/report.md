# Fayette County Habitat brand-compliance report

## 1. Executive summary

The June 2025 brand-compliance package centralizes typography, color, logo usage, static copy rules, runtime browser checks, accessibility checks, rendered link integrity, and responsive screenshots. Automated brand checks are **PASS**. The overall delivery result is **PASS**. The production build and guarded focused Playwright suite completed successfully against disposable local PostgreSQL.

## 2. Guide authority

The normative source is the supplied **Habitat for Humanity Brand User Guide, June 2025**, an 85-page guide that replaces previous brand guidance. The supplied Fayette County logo archive, HFHI Neue Haas Grotesk archive, and Minion Pro webfont archive were used.

## 3. Repository / branch / commit

- Branch: `codex/public-visual-system-refinement-v4`
- Commit observed during report generation: `abb4f6d3158131cd3caebbb7531caba71ee07d54`

## 3A. Verification gap provenance

The original verification attempt was not rewritten: the first production build compiled/type-checked but stopped when /campaigns had no permitted database connection, and the first Playwright attempt was refused by the destructive-test database guard. The final evidence records those prior states separately from the completed build and guarded suite.

## 4-5. Baseline counts and major findings

| Measure                           |               Baseline |                   Final |
| --------------------------------- | ---------------------: | ----------------------: |
| Public route definitions          |                     12 |                      12 |
| Static findings                   |                     62 |                       4 |
| FAIL findings                     |                     58 |                       0 |
| PASS findings                     |                      1 |                       1 |
| MANUAL REVIEW                     |                      0 |                       0 |
| NOT APPLICABLE                    |                      3 |                       3 |
| Registered font-face declarations |                      0 |                      11 |
| Logo references                   | 2 two-color references | 2 controlled references |

Baseline major findings were the obsolete Source Sans 3/Zilla Slab typography, prior palette and surface vocabulary, two-color logo references, and absence of centralized enforcement.

## 6. Route coverage

22 public route targets were crawled from http://127.0.0.1:3200; the route inventory covers 12 implemented public route definitions including dynamic, 404, and error states.

## 7-13. Architecture, typography, color, logo, content, and imagery

- **Architecture/design system:** semantic token roles live in `src/styles/tokens.css`; public CSS owns typography, surfaces, focus, controls, and reduced-motion behavior.
- **Typography:** Neue Haas Grotesk Display/Text and Minion Pro use supplied local webfonts. Display headings use Display; navigation, controls, metadata, captions, and short copy use Text; `.type-article-body` uses Minion Pro.
- **Color:** canonical June 2025 palette is centralized; no public gradient, obsolete surface token, or unknown static color remains.
- **Logo:** `HabitatLogo` uses official horizontal extended black/white artwork, preserves trademark artwork, and exposes the 10px digital minimum contract.
- **Programs/events:** no named program/event identity is in the current shell; no mini-brand was introduced.
- **ReStore:** NOT APPLICABLE for the current shell; May 2024 source remains required for future checks.
- **Copy/narrative:** static copy checks pass with no concrete banned-phrase finding; subjective voice remains manual review.
- **Imagery:** no public photographic assets were available; no AI/fabricated imagery was added.

## 14-22. Accessibility, links, enforcement, and visual evidence

- Accessibility: **PASS**, 0 axe violations across 7 core routes; responsive overflow checks passed.
- Rendered links: **PASS**, 30 unique links (28 internal, 2 external), 0 failures.
- Static brand lint: **PASS**; copy rules run inside the static audit.
- Runtime typography/logo/color/reflow: **PASS**; zero runtime machine failures were recorded.
- Production build: **PASS**, 33/33 static pages generated against the disposable migrated/seeded database.
- Focused Playwright: **PASS**, 6/6 Chromium tests passed with 0 failures and 0 skips; the guard was not bypassed.
- Visual regression support: **PASS**, routes /, /projects, /news, /campaigns, viewports 390x844, 1440x900; screenshots are recorded in the final visual-regression JSON artifact.

## 23-25. Remaining manual review and licensing notes

- **MANUAL REVIEW** — Narrative quality, people-centered tone, dignity/respect, photography authenticity, provenance, consent, and local/DAN approval remain editorial review items.
- **MANUAL REVIEW** — Keyboard-only traversal, screen-reader reading order, 400% zoom/reflow, and reduced-motion human review remain required beyond automated axe/reflow checks.
- **MANUAL REVIEW** — Formal Minion Pro license provenance/documentation is pending delivery; supplied webfont assets are not included in evidence artifacts.
- **MANUAL REVIEW** — ReStore-specific rules beyond the June 2025 guide require the May 2024 ReStore Style Guide when a ReStore experience is implemented.

Verification notes:

- The original build attempt was blocked by unavailable database access; the final build completed against habitat_brand_test after committed migrations and seed.
- The original Playwright attempt was refused by the destructive-test database guard; the final focused suite ran against a fresh disposable database with the guard satisfied and not bypassed.

## 25A. Four final findings verified individually

- `IMAGE-001` — **NOT APPLICABLE**; category: Imagery; scope: public/ non-logo image assets.
  Rationale: No non-logo public photographic asset exists in the implemented shell, so there is no image provenance, consent, dignity, or contextual-alt-text claim to approve yet.
  Evidence: final/imagery-audit.json reports an empty non-logo asset list.
  Future applicability: Becomes applicable when an approved non-logo image is added to public/ or a public route renders one.
- `RESTORE-001` — **NOT APPLICABLE**; category: ReStore identity; scope: public ReStore routes and content.
  Rationale: No ReStore route, identifier, or public content is implemented in the current scaffold; the guide exception is not being exercised.
  Evidence: final/restore-audit.json reports no ReStore public route or content.
  Future applicability: Becomes applicable when a verified ReStore route, identifier, logo relationship, or public content is introduced; the May 2024 ReStore source must then be obtained for remaining rules.
- `PROGRAM-001` — **NOT APPLICABLE**; category: Programs/events; scope: named program or event identity in public source.
  Rationale: No named program or event identity is present in the implemented public shell, so no separate lockup, ownership language, or mini-brand claim is being published.
  Evidence: final/program-event-audit.json reports no named program/event identity.
  Future applicability: Becomes applicable when verified program or event content is published in a public route or component.
- `LINK-001` — **PASS**; category: Rendered link integrity; scope: static and rendered public links.
  Rationale: This is the fourth final finding, but it is PASS rather than NOT APPLICABLE: static and rendered public-link checks completed with no reserved-host or destination failures.
  Evidence: final/link-audit.json reports 30 rendered links and 0 failures.
  Future applicability: A future invalid, stale, empty, fabricated, or otherwise ungoverned public destination would create a new failure finding.

## 26. Exact commands executed

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `APP_ENV=test with disposable habitat_brand_test database pnpm build:clean (completed)`
- `pnpm db:test:assert-migration-environment`
- `pnpm db:migrate:deploy`
- `pnpm db:migrate:status`
- `pnpm db:migrate:diff`
- `pnpm db:seed`
- `pnpm exec tsx scripts/brand-compliance-audit.ts baseline`
- `pnpm exec tsx scripts/brand-compliance-audit.ts final`
- `pnpm exec tsx scripts/brand-compliance-runtime.ts final`
- `pnpm exec playwright test tests/e2e/public-shell.spec.ts tests/e2e/public-link-integrity.spec.ts --project=chromium`
- `pnpm verify:public`
- `pnpm format:check`

## 27-29. Overall result, evidence, and worktree

- Automated brand compliance: **PASS**.
- Overall delivery result: **PASS**.
- Evidence: `artifacts/brand-compliance/baseline/report.md`, `artifacts/brand-compliance/baseline/report.json`, `artifacts/brand-compliance/baseline/static-audit.json`, `artifacts/brand-compliance/baseline/route-inventory.json`, `artifacts/brand-compliance/final/report.md`, `artifacts/brand-compliance/final/report.json`, `artifacts/brand-compliance/final/static-audit.json`, `artifacts/brand-compliance/final/runtime-brand-audit.json`, `artifacts/brand-compliance/final/accessibility-results.json`, `artifacts/brand-compliance/final/link-audit.json`, `artifacts/brand-compliance/final/visual-regression-summary.json`, `artifacts/brand-compliance/final/production-build.json`, `artifacts/brand-compliance/final/playwright-results.json`.
- Worktree and final commit state must be confirmed after the delivery commit; no licensed font binaries are included in evidence.
