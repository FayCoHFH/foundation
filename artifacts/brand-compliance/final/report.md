# Fayette County Habitat brand-compliance report

## 1. Executive summary

The June 2025 brand-compliance package centralizes typography, color, logo usage, static copy rules, runtime browser checks, accessibility checks, rendered link integrity, and responsive screenshots. Automated brand checks are **PASS**. The overall delivery result is **WARNING** because the production build is not conclusive in this shell: it compiled and type-checked, then database access was denied while prerendering a public route (currently `/campaigns`).

## 2. Guide authority

The normative source is the supplied **Habitat for Humanity Brand User Guide, June 2025**, an 85-page guide that replaces previous brand guidance. The supplied Fayette County logo archive, HFHI Neue Haas Grotesk archive, and Minion Pro webfont archive were used.

## 3. Repository / branch / commit

- Branch: `codex/public-visual-system-refinement-v4`
- Commit observed during report generation: `208953e2f95f8babcadba10e10735adcc74521b5`

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
- Visual regression support: **PASS**, routes /, /projects, /news, /campaigns, viewports 390x844, 1440x900; screenshots are recorded in the final visual-regression JSON artifact.

## 23-25. Remaining manual review and licensing notes

- **MANUAL REVIEW** — Narrative quality, people-centered tone, dignity/respect, photography authenticity, provenance, consent, and local/DAN approval remain editorial review items.
- **MANUAL REVIEW** — Keyboard-only traversal, screen-reader reading order, 400% zoom/reflow, and reduced-motion human review remain required beyond automated axe/reflow checks.
- **MANUAL REVIEW** — Formal Minion Pro license provenance/documentation is pending delivery; supplied webfont assets are not included in evidence artifacts.
- **MANUAL REVIEW** — ReStore-specific rules beyond the June 2025 guide require the May 2024 ReStore Style Guide when a ReStore experience is implemented.

Verification note: The focused Playwright public-shell suite was safely refused by the repository destructive-test database guard because ALLOW_DESTRUCTIVE_TEST_DATABASE=true was not explicitly authorized; no destructive-test override was used.

## 26. Exact commands executed

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `APP_ENV=development pnpm build (compiled/type-checked, then blocked by database access during /campaigns prerender)`
- `pnpm exec tsx scripts/brand-compliance-audit.ts baseline`
- `pnpm exec tsx scripts/brand-compliance-audit.ts final`
- `pnpm exec tsx scripts/brand-compliance-runtime.ts final`
- `pnpm exec playwright test tests/e2e/public-shell.spec.ts --project=chromium`
- `pnpm verify:public`
- `pnpm format:check`

## 27-29. Overall result, evidence, and worktree

- Automated brand compliance: **PASS**.
- Overall delivery result: **WARNING** due the documented database-access build blocker.
- Evidence: `artifacts/brand-compliance/baseline/report.md`, `artifacts/brand-compliance/baseline/report.json`, `artifacts/brand-compliance/baseline/static-audit.json`, `artifacts/brand-compliance/baseline/route-inventory.json`, `artifacts/brand-compliance/final/report.md`, `artifacts/brand-compliance/final/report.json`, `artifacts/brand-compliance/final/static-audit.json`, `artifacts/brand-compliance/final/runtime-brand-audit.json`, `artifacts/brand-compliance/final/accessibility-results.json`, `artifacts/brand-compliance/final/link-audit.json`, `artifacts/brand-compliance/final/visual-regression-summary.json`.
- Worktree and final commit state must be confirmed after the delivery commit; no licensed font binaries are included in evidence.
