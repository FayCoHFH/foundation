# C6B-6 Story Submission conversion handoff

Status: complete locally on 2026-08-18.

## Scope

C6B-6 adds a controlled administrative handoff from an `ACCEPTED`
`PublicStorySubmission` to one ordinary private Story draft. The existing
submission detail remains the entry point. The handoff does not enable public
intake, send email, create a public projection, publish a Story, or insert
submission media.

## Authorization and ownership

The service requires an active administrator with both
`communications.submissions.review` and `stories.create`. The UI is capability
filtered, but the service repeats both checks for direct requests. A reviewer
with only submission review cannot convert, and a Story author without
submission review cannot read or convert confidential intake.

The converter is the default editorial owner through the existing Story
responsibility model. No role name grants access, and no alternate owner is
selected by the conversion UI.

## Mapping and confidentiality boundary

The conversion creates a normal `Publication`/`Story` root, responsibility,
validated revision, `DRAFT_CREATED` lifecycle evidence, and ordinary Story
audit. The suggested title becomes the draft headline, with a safe fallback
when absent. Submission story text becomes validated structured plain-text
body content and a bounded excerpt. The source email, submitter identity,
review note, acknowledgments, privacy facts, sensitivity declarations, rights,
consent, clearance, evidence, media, and contributor-suggested credit are not
copied. The Story has no byline or public credit until editorial work selects
one through the ordinary Story workflow.

`PublicStorySubmissionStoryConversion` is a restricted one-to-one provenance
record keyed by submission and Story. It records the source submission version,
converter, time, and correlation ID without joining the source into public
projections. The source submission remains unchanged and confidential. Later
source changes do not rewrite the independent Story draft.

## State, concurrency, and failure behavior

Only `ACCEPTED` submissions are eligible. The expected submission version is
checked in the same transaction that creates the Story and provenance record.
The unique submission/story/correlation constraints and idempotent retry path
ensure that repeated or concurrent requests return the one existing Story
rather than creating a second draft. A stale version fails without creating a
Story. Story creation, provenance, and the handoff audit event commit or roll
back together.

The resulting Story is `DRAFT`, `UNPUBLISHED`, has no approval, snapshot,
public projection, placement, media attachment, or automatic clearance. It
continues through the existing Story editor, review, approval, and release
workflow. The source is retained under the unresolved G-07 retention profile;
this slice does not add deletion, export, or retention automation.

## UI and validation

The existing confidential submission detail now has a concise Story handoff
section. It explains that source material is not publishable content, requires
an explicit confirmation, links to the created private Story draft, and
removes the action after conversion. The server action uses the expected
version and the domain service; it never manufactures eligibility in React.

Focused evidence:

- unit render/action coverage: Story handoff visibility, confirmation,
  capability-gated UI, typed Story link, and idempotent success messaging;
- PostgreSQL conversion integration: 6 tests passed, covering accepted-only
  status, dual capability and active-admin checks, stale versions, concurrent
  one-time conversion, provenance/audit, draft-only state, confidential-field
  exclusion, no media/public projection, source retention, and independence;
- Playwright/axe: 2 tests passed at 375, 768, 1440, and 1920 pixel widths;
  no axe violations, horizontal overflow, console errors, or page errors;
- Prisma migration deployment/status, seed twice, and migration drift check
  passed on disposable `habitat_c6b6_migration_test` and
  `habitat_c6b6_migration_shadow_test` databases.

The C6B-6 browser suite does not enable public intake and does not use the
visual-preview databases or port 3200.
