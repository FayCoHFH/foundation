# C6B-2B Public Story Submission inbox validation

Status: Complete locally on 2026-08-17. This record closes browser,
accessibility, responsive, visual, confidentiality, and regression validation
for the C6B-2A administrative inbox. It does not enable or implement the
visible public Story Submission form.

## Browser personas and isolated environment

The focused Playwright suite uses four capability-based personas:

- an active submission reviewer with `communications.submissions.review`;
- a Super Admin with the separate spam-restore capability;
- an authenticated Dashboard-only user without submission-review capability;
- an anonymous visitor following the normal administrator sign-in boundary.

A second authorized reviewer is used for stale lifecycle and review-note
submissions. Fixtures use deterministic nonproduction data in disposable
`habitat_c6b2b_test` and `habitat_c6b2b_shadow_test` PostgreSQL databases. The
suite runs on port 3100 with `APP_ENV=test`, safe loopback test authentication,
and `reuseExistingServer=false`. The visual-preview databases and port 3200
were not used or modified.

## Route, authorization, and confidentiality coverage

The suite covers authorized inbox/detail access, capability-filtered
navigation, direct inbox/detail denial, anonymous sign-in redirect, and safe
denial output. Dashboard, Queue, Story, News, Homepage, and Site Notice
surfaces remain free of submission rows, counts, links, and fixture content.

The inbox proves the list DTO boundary: name, relationship, suggested title,
status, timestamps, textual sensitivity indicators, and an intentional detail
link are present; email, narrative, review note, acknowledgments, privacy
metadata, publication-interest detail, actor/audit data, token hashes,
rate-limit data, and request data are absent. The detail DTO presents the
approved review sections only. Story text remains escaped plain text with
paragraph and line-break preservation, and `<script>`-like fixture text does
not execute or create HTML.

Both routes remain dynamic server renders with `revalidate = 0`; confidential
detail links use `prefetch={false}`. Browser checks found no submission content
in storage, metadata, OpenGraph output, URLs, status feedback, console errors,
client fetches, or unrelated routes. The public `/share-your-story` path,
public form, token/receipt/success pages, sitemap entry, and public navigation
remain absent. The server-only C6B-1B intake boundary remains disabled by
default.

## Workflow coverage

The browser matrix covers All, Received, In Review, Follow Up, Accepted,
Declined, and Spam filters; direct reload, invalid status/page/page-size
normalization, bounded page size, stable received-time ordering, filter
preservation, page reset, keyboard pagination, and no adjacent-page overlap.
The empty-status query is treated as the All option rather than an invalid
filter.

Sensitivity indicators are textual, render independently for all three flags,
remain readable on mobile, and do not imply consent or alter lifecycle state.
Contact consent, editorial-review acknowledgment, sensitive-data warning,
privacy notice evidence, and publication interest are presented as separate
facts. Publication interest uses the approved distinction: “Open to discussing
publication — this is not publication consent.” Historical acknowledgment
facts are not editable.

Received, In Review, and Follow Up transitions are exercised through their
explicit allowlisted commands. Accepted and Declined remain readable terminal
states. Spam remains terminal for ordinary reviewers; only the dual-capability
restore path returns it to Received. Mark as Spam requires explicit accessible
confirmation. Review notes cover existing-note loading,
successful persistence, maximum-length and field-associated validation, safe
entered-value retention, allowlisted success feedback, and absence from list,
URLs, status messages, and console output.

Two authorized browser contexts prove optimistic concurrency for both lifecycle
status and review-note writes. A stale write is rejected without false success
or overwrite; the winning persisted value remains authoritative and a refresh
obtains current state.

## Accessibility and visual review

The focused suite runs axe against the inbox filters and page 2, empty and
filtered states, received/detail variants, sensitivity/publication-interest
variants, terminal states, validation/conflict feedback, access denial, and
mobile views. The run reported no violations.

Manual review confirmed one H1 per route, logical section headings, semantic
lists and definition lists, labelled filters/forms, descriptive detail links,
textual status/sensitivity meaning, visible focus-compatible controls,
keyboard order, associated note errors, readable feedback, terminal-state
clarity, and no duplicated confidential mobile/desktop content.

Chromium screenshots were reviewed at 375×812, 768×1024, 1440×1100, and
1920×1200 for populated/filtered/paginated inboxes, empty and denied states,
received and terminal details, all sensitivity flags, long multi-paragraph
text, review-note errors, concurrency feedback, and the existing homepage
curation boundary. No clipping, horizontal overflow, broken wrapping,
unusable mobile target, or material visual defect was found. Screenshot
artifacts remain disposable Playwright output and are not committed.

## Regression and deferred scope

Executed evidence on 2026-08-17:

- focused C6B-2B Playwright: 6 passed; full Playwright: 44 passed;
- full unit: 160 passed; focused submission integration: 12 passed;
  focused intake-security integration: 11 passed; full integration: 178
  passed and 1 intentionally skipped;
- migration environment, Prisma validate/generate/deploy/status/seed-twice/
  diff: passed with no migration difference;
- format check, lint, typecheck, production build, and `git diff --check`:
  passed;
- axe reported no violations in the focused C6B-2B matrix; browser diagnostics
  reported no unexpected console or page errors.

The shared Site Notice E2E axe helper also received the existing animation-settle
wait used by the other public visual suites; this corrected test timing only and
did not change product behavior. No public form, email,
uploads, CAPTCHA, Story conversion, AuthorProfile, publication consent,
retention cleanup, deletion, export, Queue/Dashboard integration, bulk action,
or new lifecycle behavior is included.

C6B-2A/2B administrative inbox work is complete, with the policy alignment in
the [C6B-2C record](./c6b2c-submission-policy-alignment.md). A Human Decision Checkpoint
must precede any visible public form decision, covering approved privacy text
and version, submission-content retention, named owner, minor/homeowner/
participant follow-up, abuse response, and whether public intake should be
enabled initially. C6B as a whole remains open until those decisions and later
implementation work are complete.
