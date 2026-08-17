# C6B-2A Public Story Submission administrative inbox

Status: Complete locally on 2026-08-17. This slice adds the protected
administrative inbox and detail experience over the C6B-1A domain services and
C6B-1B intake boundary. It does not add a public form, public route, email,
uploads, CAPTCHA, Queue/Dashboard integration, Story conversion, deletion,
export, or retention cleanup.

## Routes and authorization

The capability-filtered Communications navigation includes **Story
Submissions** for administrators with `communications.submissions.review`:

- `/admin/communications/submissions`
- `/admin/communications/submissions/[id]`

Both routes resolve the active local administrator and capability before any
submission read. Direct access without the capability redirects to the safe
access-denied boundary. The server actions repeat the same capability check;
navigation visibility is not authorization.

## Confidential rendering and cache policy

Both pages export `dynamic = "force-dynamic"` and `revalidate = 0`. They use no
static generation or shared response caching and do not write submission data
to browser storage, metadata, analytics, or query strings. Detail links use
`prefetch={false}` so confidential detail data is not hydrated before an
administrator intentionally opens it.

## Inbox

The inbox uses the C6B-1A list DTO and authoritative `receivedAt DESC, id ASC`
ordering. Rows show submitter name, relationship, optional suggested title,
status, received/updated/status-changed times, safe sensitivity indicators, and
a typed detail link. Email, story text, review notes, privacy metadata,
acknowledgments, audit records, actor IDs, and security artifacts are excluded.

The GET status filter supports All, Received, In Review, Follow Up, Accepted,
Declined, and Spam. Invalid values fall back safely and produce static
feedback. Page and page-size parameters remain bounded; pagination preserves
the status filter and filter changes reset to page one. Empty states are
status-specific and do not imply organizational inactivity.

## Detail

The detail page is titled **Review Story Submission** and is explicitly marked
confidential. It presents contact, submission, acknowledgment, sensitivity,
and administrative sections from the safe detail DTO. Email is shown only here
with a normal `mailto:` link. Story text is escaped plain text with paragraph
and line-break preservation; HTML and `dangerouslySetInnerHTML` are not used.

Publication interest is rendered as “Open to discussing publication — this is
not publication consent.” Contact consent remains a separate fact. Privacy
notice version and acceptance time are evidence only and are not editable.
Sensitivity indicators are textual and restrained; no declaration is never
described as proof that a submission is safe.

## Lifecycle and review notes

The UI exposes only the explicit C6B-1A commands valid for the current state:
begin/resume review, mark follow-up, accept, decline, and mark spam. Accepted,
declined, and spam states expose no further transition controls. There is no
generic status dropdown, reopen/restore/unspam action, conversion, deletion,
export, or bulk action.

The internal review-note form is private, labelled, limited to 2,000
characters, and submits the current expected version. Note validation retains
a bounded entered value and associates the error with the field. A stale write
returns safe conflict feedback without overwriting persisted state. All
successful mutations use allowlisted status codes after the domain transaction
commits; arbitrary query messages are ignored.

## Responsive and accessibility semantics

The inbox uses one semantic list structure across viewports. Detail sections
use one H1, logical H2/H3 headings, definition lists, labelled forms, visible
focus-compatible links and buttons, textual statuses and sensitivity cues, an
accessible filter form, status feedback, and keyboard-reachable pagination and
actions. No confidential content is duplicated for mobile/desktop layouts.

## Validation and deferred work

Focused render/action tests cover capability-filtered navigation, route-safe
query parsing, list exclusions, empty states, detail presentation, lifecycle
closure, note validation, stale conflicts, expected versions, and allowlisted
feedback. Existing PostgreSQL domain and intake-security suites remain the
authoritative regression coverage for authorization, lifecycle, concurrency,
atomic audit behavior, and intake security.

Formal browser, axe, responsive, visual, and manual accessibility validation is
recorded in the [C6B-2B validation record](./c6b2b-public-story-submission-inbox-validation.md).
The administrative inbox and detail work is complete. Approved privacy wording,
final content retention, public form exposure, email/uploads, and Story
conversion remain separate gates and are not blockers for this bounded
administrative slice.
