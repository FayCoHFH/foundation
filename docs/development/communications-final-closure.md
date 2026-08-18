# Communications platform foundation final closure

Status: **Engineering foundation complete locally on 2026-08-18**

This record closes the C1–C6 Communications implementation and validation
sequence. It reconciles current architecture and documentation; it does not
enable public Story collection or add a new product domain.

## Readiness classification

- **Communications engineering foundation complete: YES.** C1, C2, C3, C4,
  C5, C6A, and C6B functional implementation are migrated, authorized,
  projection-safe, regression-tested, and documented.
- **Public Story collection enabled: NO.** `PUBLIC_STORY_SUBMISSIONS_ENABLED`
  remains `false` by default. G-07 still requires the accountable owner to
  approve privacy wording, consent rules, collection ownership/contact, and the
  retention/records profile.
- **Communications production-enablement ready: YES for existing enabled
  features, subject to G-02/G-05 environment and authentication acceptance.**
  The gated Story intake may remain disabled without blocking the implemented
  Story, News, placement, Queue, Dashboard, Site Notice, and confidential
  administrative submission foundation.

## Architecture and boundary reconciliation

- Stories and News remain typed roots on the shared publication spine. Public
  reads use eligible immutable snapshots/projections only.
- C4 has four implemented typed placement keys: `HOME_HERO`,
  `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`. Project and
  Campaign keys remain reserved, not implemented.
- Queue and Dashboard are bounded read models; Site Notices remain a separate
  operational channel.
- Public Story Submission is confidential intake, not a Story draft. Only an
  `ACCEPTED` submission may be handed off, and the handoff requires both
  `communications.submissions.review` and `stories.create`. It creates one
  ordinary private Story draft, maps only suggested title/story text, records
  restricted provenance, and copies no submitter identity, consent, clearance,
  evidence, media, byline, or public credit.
- READY means technically processed, not cleared or publishable. Publication
  rights, identifiable-adult/minor/homeowner/private-residence/sensitive-
  circumstances review, usage-specific permissions, expiration, revocation,
  restrictions, and explicit public-credit treatment remain authoritative
  clearance/promotion decisions. Promotion copies only a sanitized derivative;
  it does not insert media into a Story or rewrite existing public uses.
- Public DTOs exclude submission narrative/contact/review notes, private
  media/evidence, storage keys, hashes, upload tokens, clearance notes, and
  audit internals. Original evidence access is authenticated, explicit, and
  audited; review uses private derivatives.

## Capability matrix

| Capability | Current protected scope |
| --- | --- |
| `communications.dashboard.read` | Dashboard read model and route |
| `communications.queue.read` | Publication Queue read model and route |
| `communications.placements.manage` | Typed placement assignment/replacement/clear/cancel |
| `communications.notices.manage` | Site Notice administrative commands and reads |
| `communications.submissions.review` | Confidential submission/media/clearance/evidence review and ordinary actions |
| `communications.submissions.restore_spam` | Higher-authority spam restoration, together with review capability |
| `communications.media.promote` | Sanitized submission-media promotion only; it does not grant confidential read access |
| `communications.media.restore_eligibility` | Higher-authority restriction restoration only |
| `stories.create` | Ordinary Story creation; required with submission review for conversion |

Every protected service also requires an active local administrator. Services
check capabilities rather than role names; navigation visibility is not the
authorization boundary.

## Flags, privacy, security, and dependency review

- `.env.example` and server configuration default
  `PUBLIC_STORY_SUBMISSIONS_ENABLED=false`. Enabling it requires the dedicated
  server-only secret and privacy-notice version; test enablement was isolated
  to disposable `APP_ENV=test` runs.
- Manual submission-content/evidence retention remains intentional under G-07;
  there is no invented automatic deletion duration. Abandoned unattached media
  cleanup, rejected technical-object cleanup, and security-artifact cleanup
  remain bounded implementation controls.
- Production CSP excludes `'unsafe-eval'`; development tooling adds it only
  when `NODE_ENV === "development"`, including `APP_ENV=test` development. The
  Story uploader does not require a production CSP relaxation.
- No third-party uploader or CAPTCHA was introduced. Private media/evidence
  delivery is authenticated, storage keys are not rendered, and confidential
  values are not placed in browser storage or public projections.
- `pnpm audit --prod --json` still reports the pre-existing high advisory for
  `deepmerge-ts@7.1.5` (`CVE-2026-40345`, `GHSA-ggr8-5vv4-36mx`) through
  `.>@better-auth/prisma-adapter>prisma>@prisma/config>deepmerge-ts`. The
  advisory recommends `deepmerge-ts >=8.0.0`; it is not introduced by C6B.
  No compatible Prisma upgrade was established during closure, so this is a
  separate infrastructure dependency-maintenance item and is not suppressed.

## Migration and database evidence

The current chain contains 17 ordered Prisma migrations, ending with
`20260818053006_c6b6_story_conversion_handoff`. A fresh disposable database
deployed the complete chain; `migrate status` reported up to date, both seeds
were idempotent, and `migrate diff` reported no difference. The existing
C3 Featured News to C4 ContentPlacement upgrade test remains green (1/1).

Closure databases were disposable and removed after validation:

- `habitat_comms_closure_test` / `habitat_comms_closure_shadow_test`
- `habitat_comms_e2e_disabled_test` / `habitat_comms_e2e_disabled_shadow_test`
- `habitat_comms_e2e_enabled_test` / `habitat_comms_e2e_enabled_shadow_test`

`habitat_visual_preview`, `habitat_visual_shadow`, and the human-review server
on port 3200 were not modified or stopped.

## Validation evidence

- `pnpm install --frozen-lockfile` — passed.
- Migration safety preflight, `pnpm db:validate`, `pnpm db:generate`, fresh
  `pnpm db:migrate:deploy`, `pnpm db:migrate:status`, two seeds, and
  `pnpm db:migrate:diff` — passed.
- `pnpm test:unit` — 231/231 passed across 32 files.
- `pnpm test:integration` — 234 passed, 1 intentional migration-wrapper skip
  across 17 passed files. A cross-slice fixture teardown dependency was fixed
  by deleting promotion provenance before submission media; the clean rerun
  passed from a recreated database.
- Default isolated browser regression — 47 passed, 10 intentional skips with
  public intake disabled.
- Enabled `tests/e2e/public-story-submission-form.spec.ts` — 10 passed, 1
  disabled-state skip.
- Enabled `tests/e2e/c6b5b-submission-media-admin-validation.spec.ts` — 6/6
  passed.
- Representative browser axe coverage reported zero known violations in the
  exercised public and administrative Communications surfaces; no suppressions
  were added. Responsive checks covered 375×812, 768×1024, 1440×1100, and
  1920×1200 where defined by the suites.
- Focused CSP unit coverage — 5/5 passed: development includes
  `'unsafe-eval'`, production excludes it, `APP_ENV=test` follows `NODE_ENV`,
  and other directives remain unchanged.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, production `pnpm build`
  with intake disabled, and production `pnpm build` with valid intake-enabled
  configuration — passed.
- `git diff --check` and documentation link/stale-reference checks — passed.

The browser suite first encountered a non-clean reused local storage root in an
enabled upload run; the evidence above is from a fresh database and unique
storage root, where all enabled upload formats passed.

## Remaining gates and deferred work

G-02 (live Google/authentication environment), G-03/G-04 (DonorView contract
and destination demonstration), G-05 (infrastructure/environment acceptance),
G-06 (commerce policy), and G-08/G-09 (future grants/applicant products)
remain genuine external or future-product gates. G-07 remains the only gate
directly affecting public Story collection/upload and its retention policy.

Deferred post-foundation work includes broader navigation as new domains arrive,
Projects, Campaigns, Newsletter delivery, categories/authors/related-content
expansion, Find Your Place, richer public Media Library administration, email
acknowledgments/follow-up, automatic retention if later approved, automatic
Story media attachment, bulk operations, and broader human design refinement.

The Communications foundation is functionally complete; broader public visual
refinement remains subject to human design review as additional site domains are
developed.
