# C6B-4A Public Share Your Story intake form

Status: **implemented locally; browser, accessibility, responsive, and visual validation deferred to C6B-4B**

## Boundary

`/share-your-story` is a public, feature-gated route. `PUBLIC_STORY_SUBMISSIONS_ENABLED=false` remains the default. When disabled, the page renders only the safe unavailable message and does not issue an intake token, create an attempt, accept an upload, or create a domain row. No navigation link is added while disabled.

When enabled, the route uses the existing signed same-origin intake server action and the existing C6B-3A/B private upload and processing services. It creates no Story, Publication, snapshot, MediaAsset, MediaUsage, queue, dashboard, or email record. There is no CAPTCHA, third-party uploader, admin media UI, or public media URL.

## Public experience

The form states that submissions enter a confidential administrative inbox reviewed by authorized Habitat administrators; staff may contact the submitter; receipt is not a publication guarantee; publication interest is not publication consent; and additional permission is needed for minors, homeowners, applicants, identifiable people, private residences, and sensitive circumstances. It warns against SSNs, financial/medical/password information, and exact private addresses. The configured privacy-notice version is recorded; no fabricated policy URL is shown because no approved canonical policy route exists yet.

Name, email, relationship, optional suggested title, and plain-text story fields reuse the C6B limits (120, 254, 160, 160, and 50–12,000 characters). Contact consent, editorial-review acknowledgment, sensitive-data warning, and privacy acknowledgment are separate required controls. Publication interest and submitter-likeness consent are separate optional controls.

Images are optional: zero to ten images, ten MB per image, sixty MB total, JPG/JPEG, PNG, WebP, or HEIC/HEIF. Selecting a file immediately creates an attempt slot and uploads to private quarantine, then processes it through the existing secure image pipeline. The browser sees only Uploading, Processing, Ready, or Rejected and safe rejection messages. A 24-hour opaque recovery token and minimal UI state live in `sessionStorage`; story/contact/acknowledgment/declaration values never enter browser storage.

Each retained image has private description (300 characters), suggested credit (160 characters), five sensitivity declarations, initial order, keyboard/touch move earlier/later controls, and actual removal with order compaction and binary cleanup. The five image declarations are review metadata, not publication consent. Retained images require a separate rights declaration scoped to confidential review and no automatic publication. The optional likeness consent applies only to the submitter and does not reject a false response.

Final submission requires every retained image to be `READY`, the image rights declaration when at least one image remains, valid attempt ownership/version, and all existing intake security/rate/token checks. Text-only submissions are valid. Final receive, ready-media association, attempt retirement, replay-token consumption, and audit are one transaction. Rejected/removed images do not block submission; a duplicate image does not consume a retained slot.

## Validation

Focused unit coverage checks the route/content/limits/formats/privacy/acknowledgment/rejection matrix and final READY gate. PostgreSQL coverage checks the final media gate, atomic rollback, ready-media association, text-only intake, and absence of public editorial/media records. Existing intake, media, processing, clearance, and promotion suites remain part of the regression set. Browser automation, axe, and formal visual QA are intentionally C6B-4B work.
