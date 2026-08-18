# C6B-4B Public Story Submission browser, accessibility, responsive, and visual validation

Status: **complete locally on 2026-08-17**. This record closes the browser and
visual validation half of C6B-4A. It does not enable production intake or close
all C6B work.

## Boundary and environment

The Chromium suite is `tests/e2e/public-story-submission-form.spec.ts` and runs
serially on isolated loopback port `3100` with `APP_ENV=test`, `NODE_ENV=production`,
test authentication enabled only for the local harness, an explicit disposable
PostgreSQL database, and local private storage under `.data/c6b4b-e2e`.
`PUBLIC_STORY_SUBMISSIONS_ENABLED=false` is tested separately and remains the
default. The existing visual-preview databases and port 3200 were not used or
changed.

The final enabled run passed 10 tests; the disabled-only assertion was skipped
as designed. The suite exercised the real Server Action, media issue/upload/
process/metadata/reorder/remove endpoints, PostgreSQL persistence, HEIC
conversion, and final submission path. No fixture bypass replaced the happy
path.

## Browser coverage

- Disabled route: safe unavailable state, no form, no attempt, no collection,
  no navigation entry, strict CSP, axe, and responsive shell.
- Enabled form: privacy summary, separate acknowledgments, optional publication
  interest, text-only submission, success, and replay-safe duplicate success.
- Validation/security: field-associated summary focus, preserved entered values,
  generic honeypot rejection, safe rejection wording, no sensitive diagnostics,
  and no public Story/Publication/MediaAsset/MediaUsage records.
- Media: JPEG, PNG, WebP, and HEIC/HEIF through the real browser upload and
  processing pipeline; Processing is observable, only READY media can submit,
  and corrupt/unsupported/mismatched/duplicate/oversized inputs remain
  removable and non-blocking to valid retained media.
- Metadata and lifecycle: private description, suggested credit, all five
  independent sensitivity declarations, suggested-lead order, move controls,
  removal, opaque same-browser recovery, and expired recovery state.
- Rights: image rights is a final gate; optional submitter-likeness consent is
  separate and does not apply to other people pictured.

## Privacy, storage, and network review

The browser storage snapshot found only the opaque recovery key in
`sessionStorage`; story text, name, email, descriptions, credits, checksums,
tokens, upload authorizations, and image bytes were absent from
`sessionStorage`, `localStorage`, and IndexedDB. Image previews use short-lived
local object URLs only. Network assertions found no third-party uploader,
analytics, CAPTCHA, email service, or sensitive query-string data; confidential
fields went only to first-party routes.

## Accessibility and visual review

The required axe scans reported zero violations across disabled, enabled-empty,
text-only, validation, honeypot, multi-ready, partial-failure, limits,
metadata, rights/final-submit, and recovery states. Manual review verified
landmark/heading structure, labels and field associations, keyboard-visible
focus, focused validation summary links, button names, status/alert semantics,
required acknowledgments, and usable recovery/removal controls.

Full-page screenshots were captured and reviewed at 375×812, 768×1024,
1440×1100, and 1920×1200. The form remains within the viewport at each size;
the mobile upload control, image cards, declarations, metadata fields, and
final rights gate remain usable without horizontal overflow.

## CSP and regression

The production runtime CSP excludes `unsafe-eval` and has no arbitrary
third-party script origin. Development-only `unsafe-eval` behavior remains
covered by the focused CSP unit matrix. Local object previews are permitted only
through the narrow `blob:` allowance in `img-src` and `connect-src`; no other
directive was broadly relaxed. The final browser run reported no console/page
errors or CSP violations.

Focused and full unit/integration/PostgreSQL/browser/build validation is
recorded with the delivery commit. The assignment-owned disposable databases
and local storage directory are removed after validation. C6B-5A remains the
next assignment; administrative media, clearance, evidence, and promotion UI
are intentionally outside this slice.
