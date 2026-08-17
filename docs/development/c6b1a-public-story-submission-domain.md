# C6B-1A Public Story Submission domain foundation

Status: Complete locally on 2026-08-16. This record covers the confidential
text-only domain foundation only. It does not authorize a public route, intake
form, abuse controls, uploads, email, administration UI, or Story conversion.

## Boundary

`PublicStorySubmission` is a separate confidential aggregate. It is not a
Story, Publication, draft, public projection, search document, Queue item, or
Dashboard item. The receive service is a domain/application service and is not
exposed through a public route or server action in this slice. No media or
attachment relation exists.

## Stored contract

The aggregate stores normalized submitter email, bounded plain-text name,
relationship, optional suggested title, 50–12,000 character story text,
acknowledgement facts, privacy-notice version/time, optional publication
interest, three triage-only sensitivity declarations, lifecycle status,
internal note, optimistic version, receipt/status timestamps, and an optional
admin status changer. Database checks enforce required text, minimum story
length, all three receive acknowledgements, positive version, and receipt
versus administrative status actor consistency. Email normalization is trim and
lowercase; it is not an identity or authorization key.

Publication interest is an indication, not publication consent. Sensitivity
flags do not automatically reject or publish a submission. The text-only
contract does not accept rich text, HTML, uploads, or executable content.

## Workflow and authorization

The only statuses are `RECEIVED`, `IN_REVIEW`, `FOLLOW_UP`, `ACCEPTED`,
`DECLINED`, and `SPAM`. Active transitions are explicit: receipt can enter
review or a terminal state; review can request follow-up or enter a terminal
state; follow-up can return to review or enter a terminal state. Accepted and
declined remain terminal. Spam is terminal for ordinary operations and has one
dedicated higher-authority `SPAM -> RECEIVED` restoration path documented in
the [C6B-2C policy record](./c6b2c-submission-policy-alignment.md). Every
administrative operation checks the active local administrator and
`communications.submissions.review` at the service boundary; restoration also
requires `communications.submissions.restore_spam`.

Administrative list DTOs exclude email, story text, and review notes. Detail
DTOs contain the required confidential fields but exclude audit rows, provider
data, request metadata, and secrets. List reads use an allowlisted select,
status filtering, bounded pages, and `receivedAt DESC, id ASC` ordering.

Status and review-note writes require the expected version and increment it in
the same transaction as the redacted success audit event. Audit summaries carry
only identifiers, status direction, and version; logs redact submission field
names including `submitterEmail`, `storyText`, and `internalReviewNote`.
Audit failure rolls back the corresponding receive or administrative mutation.

## Retention and deferred boundaries

No final retention duration or cleanup job is introduced. Submission content
is manually retained until an approved policy exists. A named owner,
approved privacy/consent text, and retention profile remain launch gates before
real production collection. Declined/spam handling, accepted-to-Story
conversion, participant/minor consent review, public intake security controls,
rate limiting, CAPTCHA/honeypot/origin checks, uploads, email, and UI belong to
later bounded slices.

## Validation

The focused unit suite covers limits, acknowledgements, normalization,
transition closure, notes, and redaction. The PostgreSQL suite covers the
receive, authorization, lifecycle, terminal, note, concurrency, audit,
pagination, query-shape, transaction, and non-public-boundary cases from the
C6B-1A matrix. The migration is generated through Prisma and deployed as one
intentional migration after SQL review.
