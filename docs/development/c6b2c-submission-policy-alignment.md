# C6B-2C Public Story Submission policy alignment

Status: Complete locally on 2026-08-17. This bounded slice aligns the existing
confidential submission domain and inbox with the accepted operational policy.
It does not enable the public form, add media tables/uploads, convert a
submission into a Story, or build a clearance/promotion workflow.

## Current operational policy

- `RECEIVED`, `IN_REVIEW`, and `FOLLOW_UP` are ordinary triage states.
- `ACCEPTED` and `DECLINED` remain terminal. Accepted means worth following up
  on and accepted for editorial consideration; it does not approve publication,
  complete consent, clear rights, or create a Story.
- `SPAM` is terminal for ordinary reviewers. A dedicated `SPAM -> RECEIVED`
  restore command is the only restoration path; no generic status mutation or
  unspam action exists.
- `communications.submissions.restore_spam` is a separate capability. The
  initial role policy grants it to Super Admin and not to ordinary submission
  reviewers. Restoration requires both the review and restore capabilities,
  an active administrator, the current expected version, and an atomic audit.
- Restoration preserves all submission content, sensitivity declarations,
  acknowledgements, contact facts, and internal notes. Its audit summary is
  limited to `fromStatus`, `toStatus`, and the new version under
  `public_story_submission.spam_restored`.
- Submission review is initially a shared responsibility among active,
  locally authorized Fayette County Habitat administrators who hold
  `communications.submissions.review`. An `fchfh.org` Google Workspace account
  alone never grants access; local invitation, activation, and capability
  authorization remain mandatory.
- Mark as Spam requires an accessible in-page confirmation and explains that
  only the higher-authority restore capability can return the record to
  `Received`. No reason field is invented.
- Sensitive submissions remain acceptable for confidential review. Sensitivity
  indicators require additional review before any future public use; they do
  not imply rejection, unsafe status, or consent.
- Submission content has manual retention handling for now. No duration,
  automatic deletion job, or staff deletion control is introduced by this
  slice. Security artifacts such as intake tokens and rate-limit records keep
  their separate bounded cleanup rules.
- The public form remains disabled by default. Text and image intake should
  launch together only after the private media, rights, clearance, and abuse
  controls below are implemented and the G-07 decision is approved.

### Future privacy presentation

When public intake is eventually enabled, the form must present a plain-language
privacy summary, a link to the full privacy policy, and required acknowledgments
for privacy, contact consent, editorial review, and the sensitive-data warning.
It must explain that submissions enter confidential administrative review, are
not automatically published, may lead Habitat to contact the submitter, do not
guarantee publication, and treat publication interest as distinct from final
publication consent. It must call out that additional permission may be needed
for minors, homeowners/applicants, identifiable people, private residences, and
sensitive circumstances, and must tell submitters not to provide Social Security
numbers, financial or medical information, passwords, exact private addresses,
or similarly highly sensitive information.

## Future private media and clearance contract

This section is a documented future contract, not an implementation in C6B-2C.

### Intake and processing

- Accept at most 10 images per submission, 10 MB per image, and 60 MB total.
- Allow JPEG, PNG, WebP, HEIC, and HEIF only. Reject SVG, GIF, TIFF, BMP,
  PDF, RAW, video, arbitrary files, and extension-only claims.
- Verify signatures, MIME consistency, resource bounds, dimensions (maximum
  12,000 px on either axis and 80 megapixels), and decodeability; fail closed.
- Store originals in private quarantine. Generate a private derivative of
  approximately 2,400 px, correct orientation, strip sensitive metadata, and
  re-encode safely. Malware scanning is defense-in-depth, not the sole gate.
- Quarantine unattached or invalid attempts for 24 hours; retain valid
  submitted content under the approved manual submission-retention policy.
- Uploads require a bound authenticated submission grant, may not be listed,
  read, overwritten, or promoted across submissions, and must not use original
  filenames as object keys. All images must reach `READY` before final submit.
- An independently rejected image does not invalidate the story or other
  images. Support replace/remove, deterministic reorder, and a first-image
  lead role. Description is capped at 300 characters; do not accept
  contributor-supplied alt text. Staff `MediaUsage` supplies contextual alt
  text and credit.
- Recovery uses only an opaque attempt reference. Do not add cross-submission
  deduplication, perceptual matching, or facial recognition.

### Rights, privacy, and evidence

- Require an ownership/permission declaration and state that intake is for
  confidential review, not automatic publication. Direct submitters to contact
  Habitat for releases or other permissions.
- Track per-image flags for minor, homeowner/applicant, identifiable person,
  private residence, and sensitive/private context. Submitter likeness consent
  is separate from non-submitter consent; guardian verification is required
  for a minor; private residences require a privacy review.
- Technical validity never means public eligibility. Initial review may use the
  existing review capability, but clearance is evaluated per image and per
  intended use, not as one submission-wide boolean.
- Evidence is private and audited. A single evidence item may support multiple
  images, but never automatically clears the entire submission; multiple
  clearances may coexist. Future evidence accepts PDF, JPEG, PNG, WebP, HEIC,
  and HEIF in private storage, not the Media Library. Store references first;
  optional copies may be added later. Preserve the original privately.
- Future restrictions must be explicit for website, social, print,
  fundraising, paid use, expiry, and other channels. An unchecked channel is
  not authorized.

### Promotion and revocation

- Promotion is a deliberate audited action from private quarantine through
  safe processing, rights/privacy review, and sanitized derivative creation
  into the Media Library. Promote only the new sanitized asset, never the
  original; preserve provenance, clearance, and staff credit. Promotion never
  auto-creates a Story or public use.
- A rights or consent revocation blocks new use, identifies existing
  `MediaUsage` records, and triggers an explicit unpublish/review assessment.
  Preserve the restricted evidence, provenance, and immutable audit history
  under the approved retention/hold policy.

## Validation boundary

Focused unit, PostgreSQL integration, and browser coverage verify the new
capability separation, confirmation, restoration, optimistic concurrency,
preservation, and atomic audit behavior. Existing public routes, visual
preview databases, and port 3200 remain outside this slice.
