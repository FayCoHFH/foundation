# C6B-1B Public Story Submission intake security

Status: Complete locally on 2026-08-17. This slice adds the server-only
unauthenticated intake boundary over the C6B-1A confidential domain. It does
not add a public page, visible form, CAPTCHA, uploads, email, administration
UI, Queue/Dashboard integration, or Story conversion.

## Boundary shape and feature gate

The boundary is:

`future same-origin form/server action -> submitPublicStorySubmission -> C6B-1A receive transaction`

`submitPublicStorySubmissionAction` is a thin server-action seam for future
progressive enhancement. No route or page imports it in this slice. The intake
is disabled unless `PUBLIC_STORY_SUBMISSIONS_ENABLED=true`; the flag is
server-only and is never exposed as `NEXT_PUBLIC_*`. Disabled mode returns a
generic unavailable outcome without parsing, logging, rate limiting, token
consumption, or domain persistence. Preview does not inherit production
enablement, and test must explicitly enable the feature.

Enabled intake requires `PUBLIC_STORY_SUBMISSIONS_SECRET` with at least 32
bytes and `PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION` with a nonempty
bounded value. Production also requires the existing HTTPS deployment
configuration. The secret is dedicated to this boundary and is not reused for
Google, Stripe, DonorView, storage, or public configuration.

## Signed token and completion control

The server-only issuer creates an HMAC-SHA-256 token containing only version,
purpose, issued-at, expiry, random nonce, and current privacy-notice version.
The token is bounded, short-lived for two hours, rejects tampering, wrong
purpose/version, stale privacy version, expiry, and future issuance beyond a
five-second clock-skew allowance. Signatures use constant-time comparison.

The boundary requires at least one second between signed issuance and receipt.
The threshold is intentionally small to avoid rejecting users who prepare or
paste a thoughtful story. The unsigned client cannot supply or override the
timestamp. Too-fast requests receive the same generic security outcome as
other security rejections and never reach the domain service.

## Request context and shape

The exact configured application origin is required. Missing, foreign,
credential-bearing, wildcard, or malformed origins are rejected. Production
origins must be HTTPS; local/test loopback HTTP follows the existing
environment policy. `Sec-Fetch-Site: same-origin` is required when present;
cross-site and other values are rejected. `Sec-Fetch-Mode` accepts only
`navigate` or `same-origin` when present. Fetch Metadata is supplemental, not
the origin control. No CORS or reflected-origin behavior exists.

Only bounded `multipart/form-data` or
`application/x-www-form-urlencoded` scalar fields are accepted. The boundary
requires a 48 KiB aggregate form limit, rejects file values, duplicate scalar
fields, unknown fields, nested values, and invalid boolean shapes. Token and
honeypot values are consumed at the boundary and never enter the domain
record. Domain validation remains authoritative for content and acknowledgments.

One bounded honeypot is expected to be empty. A filled honeypot produces a
generic security rejection, is never persisted/logged/audited, and does not
create Queue/Dashboard records. Network/global attempt accounting still counts
the request consistently; no email bucket is created for a honeypot or
too-fast rejection.

## Rate limiting and privacy-preserving fingerprints

Rate limiting is PostgreSQL-backed and race-safe through atomic
`INSERT ... ON CONFLICT ... count + 1` updates:

- network scope: 10 attempts per hour;
- normalized-email scope: 5 attempts per 24 hours;
- global scope: 200 attempts per hour.

Vercel's trusted `x-vercel-forwarded-for` value is HMAC-fingerprinted; outside
Vercel the boundary uses a shared local fallback rather than trusting an
unverified forwarded address. Normalized email is HMAC-fingerprinted with the
dedicated intake secret. Only fixed-length hashes are stored; raw IP, email,
user agent, and request identifiers are not persisted. Rate-limited requests
do not call the receive service and return the same generic public message.

## Replay, atomicity, and cleanup

`PublicStoryIntakeTokenUse` stores only a SHA-256 token hash, expiry, consumed
time, and optional confidential submission link. A successful transaction
inserts the token-use row, invokes the C6B-1A receive service inside the same
transaction, writes the receipt audit, and links the created submission. A
unique token hash makes successful retries duplicate-safe; concurrent replay
creates at most one submission and returns a safe duplicate-success class.
Validation failure does not consume the token. Token-use failure, domain/audit
failure, and submission failure roll back the entire successful-intake
transaction.

`PublicStoryIntakeRateLimitBucket` and token-use rows have explicit expiry and
indexes. The bounded cleanup function deletes at most 100 expired rows per
artifact type per invocation and never touches submission content. Intake
opportunistically invokes it; operations must also run this cleanup path
before or at launch if request volume makes opportunistic cleanup insufficient.
This is separate from the unresolved PublicStorySubmission content-retention
policy.

## Outcomes, logging, and deferred gates

Internal outcomes distinguish `ACCEPTED`, `DUPLICATE_ACCEPTED`,
`VALIDATION_FAILED`, `UNAVAILABLE`, `RATE_LIMITED`, and `SECURITY_REJECTED`.
Accepted and duplicate-success outcomes share the same safe message. Security
outcomes do not reveal token, limiter, honeypot, timing, origin, or database
details. Validation errors identify only a safe field and static correction
message; they never echo arbitrary input.

Logs contain only correlation ID, operation, and safe error class. Raw
body/FormData, token, nonce, honeypot, IP, user agent, email, name,
relationship, title, story text, and review note remain redacted. No security
rejection creates verbose attacker-controlled audit content.

The public privacy wording, final submission-content retention/deletion
profile, named owner, minor/homeowner/participant follow-up process, and abuse
response process remain launch gates. CAPTCHA/provider selection, email,
uploads, UI, conversion, browser validation, and Dashboard/Queue integration
are intentionally deferred.
