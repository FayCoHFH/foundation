# C6B-3C Story Submission image rights and clearance domain

## Scope

C6B-3C adds the confidential PostgreSQL rights boundary for images attached to
a Public Story Submission. It records versioned rights declarations, consent
facts, bounded subject labels, per-image clearance applicability, explicit use
permissions, expiration/revocation, confidential restrictions, and a safe
derived eligibility result. It does not add a public upload form, evidence
file storage, MediaAsset promotion, public URLs, Story conversion, email, UI,
browser validation, or visual design.

The submission, its image quarantine rows, subjects, clearances, applicability
joins, restrictions, and revocation requests remain outside Publications,
MediaAsset, MediaUsage, projections, and public caches. A subject is a bounded
label scoped to one submission; it is not a constituent, applicant, household,
case, or CRM person record.

## Rights facts and declarations

The submission stores the accepted rights-declaration version/time and the
submitter-likeness consent version/time as explicit facts. Submitter likeness
consent is scoped only to the submitter subject. It does not grant permission
for another person, a minor, a homeowner/applicant, a private residence, or
sensitive circumstances.

The seven closed clearance types are `IMAGE_RIGHTS`, `IDENTIFIABLE_ADULT`,
`MINOR_GUARDIAN`, `HOMEOWNER_APPLICANT`, `PRIVATE_RESIDENCE`,
`SENSITIVE_CIRCUMSTANCES`, and `SUBMITTER_LIKENESS`. Evidence is represented
only as a bounded type and reference/version: `EXISTING_HABITAT_RELEASE`,
`NEW_RELEASE`, `OTHER_APPROVED_AUTHORIZATION`,
`SUBMITTER_LIKENESS_CONSENT`, or `STAFF_PRIVACY_REVIEW`. No evidence file,
PDF, upload, OCR, or derivatives are introduced by this slice. An existing
Habitat release must carry a non-empty existing-reference value.

Clearances begin `PENDING` and may be verified, rejected, or revoked by any
active administrator with `communications.submissions.review`. `EXPIRED` is a
derived effective status when a verified clearance's `expiresAt` has passed;
no background job is needed to mutate history. Every edit uses the clearance
version. Verification, rejection, revocation, applicability changes, and
declaration recording are audited atomically with their writes.

## Applicability and eligibility

Both subject-to-image and clearance-to-image joins are exact and many-to-many.
The evaluator requires `IMAGE_RIGHTS`, then derives additional requirements
from image flags and applicable scoped subjects. A minor requires
`MINOR_GUARDIAN`; a non-submitter identifiable adult requires
`IDENTIFIABLE_ADULT`; an explicitly represented submitter requires
`SUBMITTER_LIKENESS`. The image flags independently require homeowner/applicant,
private-residence, and sensitive-circumstances clearances where applicable.

For each proposed use—`WEBSITE_PUBLICATION`, `SOCIAL_MEDIA`, `PRINT`,
`FUNDRAISING_PROMOTIONAL`, or `PAID_ADVERTISING`—eligibility requires:

- technical image status `READY`;
- no active media restriction;
- a verified, non-expired, non-revoked clearance for every derived requirement;
- explicit permission for the proposed use on every applicable verified
  clearance; and
- no active clearance restriction.

The evaluator returns only `{ mediaId, proposedUse, eligible, reasons,
restrictionState }`. Reasons are closed safe codes; notes, subject names,
email, storage keys, hashes, evidence contents, and audit rows never cross the
eligibility boundary.

## Restrictions and authority

An active reviewer may restrict an image with a closed reason such as
`CLEARANCE_EXPIRED`, `CLEARANCE_REVOKED`, `CLEARANCE_INSUFFICIENT`,
`PRIVACY_CONCERN`, `SUBJECT_REVOCATION_REQUEST`, or
`STAFF_REVIEW_REQUIRED`. A subject revocation request is a bounded confidential
record and immediately creates the matching active restriction in one
transaction. Restrictions are versioned; restoration changes the historical
row to `RESTORED` and preserves its reason, note, and audit history.

The request blocks new use only. It does not make a legal determination or
rewrite an existing public use; future C6B-3E promotion/restriction integration
must surface existing MediaUsage records for review.

Restoration requires both `communications.submissions.review` and the separate
`communications.media.restore_eligibility` capability. The latter is seeded to
Super Admin only; the Communications Manager preset explicitly excludes it.
Restoration also re-evaluates the requested use with the restriction ignored
so a stale or incomplete clearance cannot be restored by authority alone.

## Migration and validation record

The slice uses one intentional Prisma migration:
`20260818001229_c6b3c_image_rights_clearance`. Fresh deployment, migration
status, seed twice, and migration diff are required. Disposable PostgreSQL
databases are `habitat_c6b3c_test` and `habitat_c6b3c_shadow_test`; neither
visual-preview database is in scope.

Focused unit coverage validates the closed type/evidence/use catalogs,
declaration validation, evidence references, and derived requirements.
PostgreSQL integration coverage exercises authorization, subject scoping,
declaration versioning, exact applicability, every clearance type, evidence
reference rules, verification/rejection/revocation, derived expiration,
per-use permissions, technical readiness, active restrictions, revocation
requests, restore authority, optimistic concurrency, safe DTOs, and audit
rollback. Playwright, axe, browser, visual, scheduling, concurrency stress,
rollback migration, upgrade, and C5 work remain out of scope.

Separate malware scanning is not required for the initial image pipeline; it
remains an optional future defense-in-depth enhancement.
