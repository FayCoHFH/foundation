# Legacy content migration report

Audit date: 2026-08-19
Branch at start: `codex/public-visual-system-refinement-v4`
HEAD at start: `b36b0e493674b3957f42914075c10edc35b541eb`

## Outcome

The existing Projects destination now has a reviewed seed path for twelve
selected historical Project History records. The implementation uses the
existing Project workflow and immutable public projection boundary. It does
not add routes, navigation, content models, sections, media, or a legacy-style
CMS.

The database seed was not executed in this workspace because no database URL
was configured. The seed is intentionally fail-closed and requires two
existing active admin IDs: one author and one independent approver. It never
creates users or grants access.

## Project History disposition

The legacy Project History page was inspected directly at
[fchfh.org/project-history](https://www.fchfh.org/project-history). It contains
32 dated/type/location records:

- 12 selected for the existing `/projects` destination;
- 19 retained as historical-only evidence to avoid over-seeding sparse or
  duplicate records;
- 1 marked `VERIFICATION_REQUIRED` because it identifies a household and
  children and needs current consent/privacy review;
- 0 conflicting and 0 rejected records in this page-level set.

Dates are preserved as month/year in titles, summaries, and structured body
copy. Exact days were not invented. No participant names, exact occupied-home
locations, metrics, or impact facts were added.

The full indexed legacy ledger was reviewed for coverage. Directly inspected
source areas included:

- [homepage](https://www.fchfh.org/), [Who We Are](https://www.fchfh.org/whoweare),
  and [Project History](https://www.fchfh.org/project-history);
- [Aging in Place](https://www.fchfh.org/aginginplace),
  [Rapid Response](https://www.fchfh.org/rapidresponse),
  [New Build](https://www.fchfh.org/potentialhomeowners), and
  [Home Repair](https://www.fchfh.org/homerepair);
- [Volunteer](https://www.fchfh.org/volunteer), volunteer FAQs, and
  committee copy;
- [Planned Giving](https://www.fchfh.org/plannedgiving),
  [Donate](https://www.fchfh.org/donate), and
  [ReStore](https://www.fchfh.org/restore);
- campaign/event/raffle pages including [Bourbon Blueprint Rules](https://www.fchfh.org/blueprintrules),
  [Bourbon Build Rules](https://www.fchfh.org/buildrules),
  [Casino Night](https://www.fchfh.org/casinonight), and
  [Schützenfest](https://www.fchfh.org/schutzenfest);
- selected posts including [Camp St. Cottages](https://www.fchfh.org/post/new-project-announcement-camp-st-cottages),
  [Wright Home Update](https://www.fchfh.org/post/wright-home-update),
  [the partner-family announcement](https://www.fchfh.org/post/fayette-county-habitat-for-humanity-selects-partner-family-for-new-home-build),
  and the [2020 housing survey](https://www.fchfh.org/post/fayette-county-habitat-housing-survey-2020).

Detailed evidence and exact source URLs are in `source-inventory.json`.

## Explicit non-migration decisions

Program eligibility and repayment details remain verification-required. The
legacy assistance PDF that requests Social Security Numbers and email intake is
blocked and was not migrated. Planned-giving legal/tax language, leadership
rosters, volunteer operations, ReStore facts, research metrics, and participant
stories remain gated or have no current destination. Raffle pages contain
conflicting drawing times, editions, and placeholder prize values, so no raffle
or incomplete event content was published.

Legacy images were not copied. Four HEIC-origin project-history associations
remain candidate evidence only; rights, consent, metadata, quality, and
contextual alt text are unresolved, and the current Project public projection
does not have a media destination in this slice.

All seeded copy is substantially rewritten through the current structured rich
text contract. Legacy typography, colors, layout, navigation, page hierarchy,
participant language, and visual styling were not imported.

## Validation

Passed: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (39 test
files / 263 tests), the focused migration unit test (3 tests), `pnpm db:validate`,
and `pnpm brand:audit:strict` (0 failures).

`APP_ENV=development pnpm build` compiled and type-checked successfully but
stopped during page generation because PostgreSQL was unavailable. The guarded
database-environment test refused to run without its explicit disposable-test
flag. The content seed likewise refused to run without a configured database.
The runtime browser audit timed out against the unavailable local
database-backed app, so Playwright and visual review were not rerun in this
workspace. Existing brand evidence was preserved unchanged.

## Model telemetry

The task prompt specifies user-selected `GPT-5.6 Luna` with `Extra High` effort.
The generic runtime label is `Codex/GPT-5`; explicit active-model telemetry was
not exposed. No subagents were used, and Sol was not invoked.
