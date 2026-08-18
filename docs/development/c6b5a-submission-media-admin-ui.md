# C6B-5A — Administrative Story Submission media, clearance, evidence, and promotion UI

Status: **implemented locally on 2026-08-17**. This slice adds the authorized
administrative composition over the completed C6B-3A through C6B-3E services.
It does not enable public intake, create Stories, insert media into editorial
content, add bulk operations, redesign the public Media Library, or add browser
or screenshot validation.

## Routes and authorization

The existing confidential submission detail at
`/admin/communications/submissions/[id]` now includes a Media review summary.
Deep review is available at
`/admin/communications/submissions/[submissionId]/media/[mediaId]`.
Both surfaces require the active administrator and
`communications.submissions.review`; every server action repeats that check.
Promotion additionally requires `communications.media.promote`. Restriction
restoration additionally requires `communications.media.restore_eligibility`.

Private image review derivatives are delivered through a dynamic, no-store
route. Evidence review pages use separately authorized sanitized derivatives;
original evidence is available only through an explicit audited attachment
download. Neither path exposes storage keys, permanent URLs, originals by
default, or confidential values in metadata.

## Administrative workflow

The media-detail surface presents technical readiness, contributor context,
all five sensitivity declarations, scoped subjects, authoritative clearance
requirements, exact image applicability, clearance state, structured usage
permissions, existing Habitat release references, private evidence status and
replacement/removal controls, per-use eligibility, active restrictions and
restoration, public-credit treatment, promotion preconditions, promotion state,
and existing public uses.

The UI does not duplicate eligibility logic. It calls the C6B-3C evaluator for
Website/publication, Social media, Print, Fundraising/promotional, and Paid
advertising. The server remains authoritative for verification, rejection,
revocation, evidence processing, restriction, restoration, and promotion.

Evidence uploads reuse the authenticated C6B-3D authorization and processing
services. The UI communicates the ten-document, 10 MB image, 15 MB PDF, and
25-page limits. Existing release references do not require a duplicate upload.
Promotion uses only the sanitized private review derivative and does not
create a Story or attach the image to editorial content.

## Validation and deferred scope

Focused render/action coverage and the existing C6B-3C/C6B-3D/C6B-3E
PostgreSQL suites cover the bounded UI/service boundary. Static checks,
unit/integration regression, and production build remain required delivery
validation. Playwright, axe browser scans, formal screenshot QA, public intake
enablement, Story conversion, automatic Story image insertion, bulk clearance,
bulk promotion, and public Media Library redesign remain deferred.
