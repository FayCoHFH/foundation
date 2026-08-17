# Foundation threat model

Status: Accepted baseline; update at each implementation slice
Method: asset/trust-boundary review informed by OWASP ASVS and cheat sheets
Last reviewed: 2026-08-14

## Scope and security objectives

This model covers the public/admin Next.js application, PostgreSQL, object storage, Better Auth/Google OIDC, DonorView destinations/imports, Stripe Checkout/webhooks, publication scheduling, and future private Grant Administration and applicant/casework boundaries.

Security objectives, in order:

1. Prevent private applicant, participant, donor/volunteer, grant, administrative, and secret data from becoming public.
2. Prevent unauthorized access, approval, publication, placement, order fulfillment, integration changes, and sensitive exports.
3. Preserve the exact authorship/approval/publication record and an attributable audit history.
4. Prevent payment or external-event spoofing, duplicate side effects, and source-of-truth corruption.
5. Maintain an accessible, truthful public site and recoverable administrative service.

## Assets

- Admin identities, sessions, invitations, capability grants, and audit events.
- Drafts, revisions, approval hashes, publication snapshots, schedules, and curated placements.
- Public media plus private grant/applicant documents and consent/license evidence.
- Applicant/household/eligibility/case data when that future domain exists.
- Private grant proposals, agreements, budgets, reports, deadlines, and notes.
- Product/order/fulfillment and minimum buyer/shipping data.
- DonorView destinations, approved exports, external mappings, and aggregate impact provenance.
- Stripe event receipts and payment/order reconciliation state.
- OAuth, database, object-storage, Stripe, DonorView, and signing secrets.
- Availability, backups, redirects, and domain/DNS control.

## Trust boundaries and entry points

| Boundary/entry | Untrusted input or risk |
| --- | --- |
| Browser -> public routes/search/forms | URLs, query/body data, crawlers, abuse, injection, cache poisoning |
| Browser -> admin routes/server actions | CSRF, stale/revoked session, IDOR, forged fields, concurrency |
| Google -> OAuth callback | forged/replayed flow, wrong account/domain, account-link confusion |
| Browser/server -> upload path -> object storage | malware, polyglots, decompression bombs, oversized files, private/public misclassification |
| Stripe -> webhook | forged/replayed/duplicate/out-of-order events |
| DonorView link/embed/import -> platform | open redirect, untrusted HTML, stale/tampered CSV, PII overcollection, SSRF during link checks |
| Scheduler -> publication/maintenance command | forged invocation, duplicate runs, clock/window errors |
| Application -> PostgreSQL/object storage | credential theft, excessive privileges, injection, accidental public object |
| Build/CI/dependency chain -> deployment | malicious dependency/action, leaked secret, compromised artifact |

## Threat actors

- Opportunistic internet attackers and automated abuse.
- A valid but underprivileged or suspended administrator.
- A compromised administrator Google account/session/browser.
- An editor attempting to bypass separation of duties, intentionally or accidentally.
- A malicious upload or external link supplied by a legitimate editor.
- A forged or replayed provider event.
- A compromised dependency, CI credential, integration key, or third-party provider.
- Accidental staff disclosure, misclassification, or destructive edit remains a primary realistic threat.

## Threats and required controls

### Confidential Story Submission lifecycle correction

Spam restoration is a narrow higher-authority operation, not a generic status
override. The service requires an active administrator with both
`communications.submissions.review` and
`communications.submissions.restore_spam`, checks the current version and
`SPAM` state, updates `RECEIVED`/actor/time/version transactionally, preserves
the confidential record, and writes `public_story_submission.spam_restored`
without content in the audit summary. Stale or failed-audit restores must leave
status, actor, time, version, and audit state unchanged. Ordinary reviewers see
no restore control, and public intake remains disabled pending the privacy,
retention, abuse, rights, and future private-media gates.

### Identity and session compromise

**Threats:** OAuth account-link takeover; email-domain checks used as authorization; stolen session; session surviving suspension; login CSRF; secret leakage.

**Controls:** Better Auth with Google OIDC; exact redirect/trusted origins; signed state/nonce/PKCE as library-supported defaults; validate `email_verified`, stable `sub`, and expected signed `hd`; disable implicit account linking, user-initiated linking, and implicit Google sign-up; create/link only through verified invitation acceptance; reject a different `sub` with an existing email before persistence; minimize OAuth-token storage and encrypt/classify/rotate/delete any token that must remain; local active-user/capability check on every protected use case; PostgreSQL sessions; initial cookie cache disabled; 12-hour non-sliding max; fresh reauthentication for sensitive actions; revoke all sessions on suspension; Secure/HttpOnly/SameSite cookies; rate-limit auth endpoints; redact tokens and secrets.

**Verification:** The ADR-0002 spike plus negative E2E tests for every rejection state. Review Better Auth advisories on each dependency update.

### Broken authorization and IDOR

**Threats:** guessing another record ID; hidden UI mistaken for authorization; broad admin roles accessing grants/applicants/secrets; background commands bypassing policy.

**Controls:** deny-by-default capability service in a server-only data-access layer; query scoping before fetch; capability checks per use case, not role strings; private-domain capabilities never bundled broadly; separation of duties; sensitive-read/export audit; service principals with narrow capabilities; no private data in public serializers/search/cache/analytics.

**Verification:** positive/negative/record-scope tests for each action; automated route/action inventory; future applicant/grant isolation tests.

### Unauthorized or corrupted publication

**Threats:** self-approval; edit after approval; scheduler publishes wrong revision; draft leaks through cache/search/API; permanent `isFeatured` bypasses eligibility; concurrent edits overwrite work.

**Controls:** immutable revisions; approval bound to canonical revision hash; any material edit invalidates approval; immutable snapshot activated atomically; public queries read active eligible snapshot only; optimistic concurrency; idempotent scheduler; Content Placement service checks definition, typed target, publication eligibility, active window, overlap, and capability; withdrawal, expiration, and archive preserve history.

**Verification:** state-transition/property tests, concurrency tests, scheduled boundary/time-zone tests, cache/search leakage tests, and E2E self-approval denial.

### Stored XSS, unsafe links, and rich content

**Threats:** script/event-handler or dangerous URL embedded in rich text, SVG, iframe, caption, alt text, imported HTML, or external embed; tabnabbing.

**Controls:** store schema-versioned Tiptap/ProseMirror JSON, not arbitrary HTML; allowlist nodes/marks/attributes and `https`/approved protocols; server-validate on every write and publish; renderer maps known nodes to components and escapes text; no raw-HTML node; sanitize any one-time legacy HTML conversion before schema parsing; apply a restrictive CSP appropriate to each public/admin rendering surface without blindly forcing a global nonce policy that defeats intended static delivery; use `rel="noopener noreferrer"` and an appropriate `nofollow` policy; make embeds typed provider components with allowlisted hosts; patch sanitizer/editor dependencies.

**Verification:** malicious JSON/HTML/link fixtures, CSP report review, renderer unit tests, and browser XSS tests. OWASP notes that rich-text HTML requires sanitization and that modifying sanitized output can invalidate protection.

### File upload and object exposure

**Threats:** executable/polyglot upload, MIME spoofing, decompression/image bomb, malware, filename/path traversal, overwrite, public URL for private data, EXIF leakage, unauthorized download, stale consent.

**Controls:** staff uploads require authenticated, capability-gated grants. An anonymous public Story Submission upload, if enabled, receives only a short-lived, non-enumerable, single-submission-scoped grant after origin/CSRF, rate-limit, abuse-challenge, declared-size, and declared-type checks; it can write only to private quarantine and cannot read, list, overwrite, promote, or publish objects. All paths use server-generated opaque immutable keys; size/type/dimension/duration allowlists; magic-byte inspection and decode/re-encode for supported images; unnecessary-metadata stripping; quarantine until scan/validation completes; checksums; separate public/private stores; fresh authorization and safe response headers for private downloads; no SVG/PDF inline by default; immutable versions; consent/license/publication-eligibility metadata; and no trust in an original filename for a path or content type.

**C6B-3A implemented subset:** a raw Story Submission image receives a
short-lived HMAC authorization that binds one opaque recovery attempt, one media
slot, nonce, declared allowed MIME type, and byte ceiling. The nonce and recovery
secret are stored only as hashes. The quarantine port permits server put,
processor read/stat, and cleanup delete only; it exposes no URL, list, or public
read. Transactional attempt/media versions, per-attempt limits, and exact
same-attempt checksum rejection prevent race or replay bypasses. Signature
inspection, decode/re-encode, dimensions, scan, and promotion remain blocked in
later work.

**Verification:** OWASP upload corpus, oversize/bomb/polyglot tests, private URL tests, object inventory scan, and media withdrawal/consent tests. Select malware and media-processing services before those upload types launch.

### Applicant/homeowner and participant privacy

**Threats:** recreating legacy PDF/email intake, SSN collection, public relationship traversal, address/photo disclosure, overbroad exports, private document indexing/backups/logging.

**Controls:** implementation blocked until the private-casework design and retention profile are approved; never collect SSNs; dedicated module/capabilities/private store; no public foreign-key traversal; minimum necessary fields; sensitive-read/export audit; malware scanning; consented public projection separate from case record; no participant home address in public Project/Media metadata; redacted support workflows.

**C6B-1A confidential submission foundation:** `PublicStorySubmission` is a
separate text-only aggregate. Required acknowledgements, field limits, active
local capability checks, optimistic versions, transaction-coupled redacted
audits, allowlisted list selects, and log redaction prevent accidental public,
search, Queue, Dashboard, provider, or telemetry exposure. The public intake
boundary, abuse controls, uploads, and retention profile remain launch gates.

**C6B-1B intake boundary:** the server-only intake is disabled by default and
requires a dedicated 32-byte secret plus configured privacy-notice version when
enabled. Exact origin, supplemental Fetch Metadata, bounded scalar form
shape/size, short-lived HMAC token, privacy-version binding, one-second
completion floor, honeypot, and PostgreSQL-backed network/email/global limits
protect the untrusted boundary. Rate and replay state stores only HMAC/hash
artifacts; unique token consumption, domain persistence, and receipt audit are
atomic. Security outcomes and logs do not reveal limiter, token, timing,
honeypot, request, IP, email, or narrative details. Public privacy wording,
content retention, owner, abuse response, CAPTCHA/provider, and uploads remain
launch decisions.

**C6B-2A/2B confidential administrative inbox:** list and detail routes are
dynamic, capability-authorized server renders with `revalidate = 0`; detail
links disable prefetch; list DTOs exclude email, narrative, acknowledgments,
publication interest, notes, and security artifacts; detail DTOs exclude audit,
provider, request, token, rate-limit, and IP data. Browser validation confirms
no submission data in storage, unrelated admin/public routes, query strings,
metadata, console diagnostics, or client fetches. This review surface does not
create a public intake route or change the unresolved collection/retention gate.

**Verification:** dedicated pre-implementation threat-model update, data-flow review, privacy tests proving public/search/cache/analytics isolation, and an incident exercise.

### Private grant disclosure

**Threats:** proposal/budget/agreement/internal notes exposed through public Grant pages, media URLs, search, reporting, or broad content roles.

**Controls:** private grant aggregate/store/capabilities; deliberate, reviewed public GrantImpact projection; field-level allowlist; no automatic projection; document access audit; contract-specific retention/hold.

**Verification:** projection allowlist tests and negative public/search/storage tests before private grant functionality launches.

### DonorView boundary failure

**Threats:** unsupported endpoint reverse-engineering; hostile/stale destination URL; untrusted embed; sensitive CSV retained or logged; duplicate constituents after person-level sync; fabricated progress.

**Controls:** manual hosted URLs are the default; HTTPS/host allowlist; typed embed providers only; safe link checker with SSRF protections; vendor-confirmed supported mechanisms only; private temporary imports; checksum/source/as-of; minimum fields; stable IDs and merge ownership required before person sync; stale status rather than invented data.

**Verification:** destination validation, failure/fallback tests, sample export privacy review, and signed vendor/account evidence before enabling API/webhook/automation.

### Stripe payment/event spoofing

**Threats:** client price manipulation; forged/replayed/duplicate/out-of-order webhook; success URL treated as payment; secret leakage; double fulfillment.

**Controls:** server-owned pricing; hosted Checkout; raw-body signature and timestamp verification; event allowlist; event-ID receipt plus idempotent order transition; retrieve authoritative Checkout state; asynchronous durable processing; no fulfillment from redirect alone; separate test/live secrets; reconciliation queue.

**Verification:** Stripe CLI fixtures for invalid signature, replay, duplicates, out-of-order and delayed methods; concurrency test that fulfills once.

### Scheduler and time-window abuse

**Threats:** public invocation of publish job, duplicate runs, incorrect local time/DST, publish-before-approval, expiration deletes history.

**Controls:** authenticated scheduler endpoint/service principal; UTC persistence with explicit editorial display timezone; idempotent compare-and-transition command; exact approved hash; database transaction/advisory lock where needed; expiration derives News ineligibility without archiving or deleting; audit actor identifies scheduler.

**Verification:** DST/boundary/duplicate/concurrency tests and manual recovery procedure.

### Secrets, logs, and integration configuration

**Threats:** secret in source, client bundle, audit, error, preview deployment, or support export; overprivileged database/storage keys.

**Controls:** managed environment secrets, separate environments, least-privilege credentials, rotation inventory, secret-value write-only admin UI, log/query redaction, no production data in previews, repository/CI secret scanning, database and storage network/platform controls.

**Verification:** build artifact search, secret scanning, environment access review, rotation drill, and redaction tests.

### Supply chain and availability

**Threats:** vulnerable or hijacked packages/actions, RSC/auth/editor/image vulnerabilities, provider outage, data loss, bot load.

**Controls:** lockfile, minimal dependencies, trusted pinned CI actions, automated vulnerability/advisory review, supported runtimes, protected production deployment, rate limits and bounded queries/uploads, PostgreSQL backups/PITR per plan, immutable object strategy, restore drills, provider status/runbooks, graceful DonorView/Stripe degradation.

**Verification:** clean install/build/test, dependency review, load/abuse tests for exposed endpoints, and documented restore exercise before launch.

## Priority risk register

| Risk | Inherent | Foundation response | Residual before launch |
| --- | --- | --- | --- |
| Private applicant/participant data exposed publicly | Critical | Separate deferred domain; no SSN; no intake until controls/retention exist | Block applicant slice until dedicated review passes |
| Stored XSS from editorial/uploads | High | Structured schema, typed renderer, CSP, quarantine/scan | Requires implementation tests and processor selection |
| Unauthorized publication/access | High | DB sessions, capabilities, approval hash, public snapshots | Requires auth and workflow spikes/tests |
| Payment spoofing/double fulfillment | High | Hosted Checkout, signed idempotent webhooks | Requires Stripe test-mode validation |
| Unsupported DonorView coupling/PII duplication | High | Manual/reference-first adapter; vendor confirmation | Person-level sync remains deferred |
| Private grant disclosure | High | Separate future module and deliberate projection | Block private grant slice until isolation tests pass |
| Secret leakage/supply-chain compromise | High | managed secrets, lockfile, scanning, least privilege | Ongoing operational risk |
| Data loss or unavailable providers | Medium/High | backups, immutable objects, recovery/degradation runbooks | Confirm vendor plans/RTO/RPO before launch |

## Security gates

No slice is complete until it has:

- a reviewed data flow and classification;
- server-side authentication/authorization tests;
- input, state-transition, concurrency, and audit tests proportional to risk;
- no secret/private data in logs, client bundles, caches, search, analytics, or fixtures;
- documented provider failure and reconciliation behavior;
- dependency/advisory review and production-build smoke test.

Applicant intake and private Grant Administration additionally require a dedicated updated threat model, approved retention schedule, private storage/download implementation, sensitive audit policy, and incident-response exercise before collecting real data.

## Incident foundations

- Maintain owners and rotation procedures for Google, Better Auth, database, storage, Stripe, and any DonorView credentials.
- On suspected compromise: contain/revoke, preserve restricted audit evidence, assess data categories/subjects, coordinate provider and legal/privacy obligations, restore/reconcile, and record corrective actions.
- Never put sensitive evidence into public issue trackers or ordinary chat. Use an approved restricted channel and redact test reproductions.

## References

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP XSS prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Next.js authentication/authorization guidance](https://nextjs.org/docs/app/guides/authentication)
- [Better Auth security reference](https://better-auth.com/docs/reference/security)
- [Stripe webhook security and delivery behavior](https://docs.stripe.com/webhooks)
