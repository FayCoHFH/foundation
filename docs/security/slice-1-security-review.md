# Slice 1 security review

Review date: 2026-08-14. Scope: application scaffold, identity/access models,
database migration, admin boundaries, test support, storage ports, headers, and
CI. This supplements, and does not replace, the platform threat model.

## Controls established

- Google is the sole configured provider. Verified email plus an exact signed
  Workspace claim, a live invitation, a stable provider subject, an ACTIVE local
  principal, and server-side capabilities are all required independently.
- The configured Google authorization-code callback profile path uses an
  explicit cryptographic ID-token verifier because the installed Better Auth
  version’s default callback profile path only decodes those claims. Unit tests
  prove valid signed-token handling and fail-closed signature, issuer, audience,
  age/expiry, email-verification, and hosted-domain cases. They are not evidence
  that a live Google callback completed.
- Implicit signup/linking and direct ID-token sign-in are disabled. Provider
  subject uniqueness prevents a different Google identity from claiming an
  existing local identity by email.
- OAuth credentials are stripped before account writes and prohibited by
  PostgreSQL checks. Sessions are database-backed, non-sliding, immediately
  revocable, and uncached in cookies. Better Auth’s rate limiter is explicitly
  enabled with database storage and IP resolution. On Vercel, routes and direct
  Better Auth API calls replace the platform-overwritten
  `x-vercel-forwarded-for` value with a keyed pseudonymous address before the
  limiter sees it. Better Auth trusts only that internal header; other runtimes
  remove it and share a fail-closed bucket per auth path. Session hooks and
  database constraints still keep stored IP address and user agent null.
- Base, callback, and trusted origins are exact HTTP(S) origins. The callback
  origin must equal the monolith application origin. Environment validation
  rejects wildcards, credentials, non-HTTP schemes, paths, queries, and
  fragments before auth starts.
- Invitation tokens are random, stored as digests, single-use, expiring, and
  coupled to a short-lived signed HttpOnly callback proof. Concurrent
  consumption is fail-closed.
- Local capabilities are deny-by-default and seeded from an exact code catalog.
  Normal invitations cannot grant Super Admin. Initial bootstrap expires stale
  pending rows so it can be retried, but any existing holder or live pending
  bootstrap blocks it. A current, freshly authenticated holder can add another
  holder only through a reasoned, audited promotion. Any holder must first pass
  a separately reviewed demotion/recovery procedure before suspension.
- Audit events carry actor, action, target, outcome, correlation, and bounded
  summary data; a database trigger blocks update/delete. Invitation acceptance,
  login success, logout, suspension, role revocation, promotion, and guarded
  test-fixture creation have explicit event paths.
- Admin pages and mutations resolve the current database principal. The routing
  proxy improves navigation only and is not trusted for authorization.
- The browser baseline denies framing, MIME sniffing, referrer leakage, unused
  browser capabilities, foreign objects/resources, and cross-origin opener
  access. HSTS is production-only.
- Test authentication requires `APP_ENV=test`, an explicit secret, loopback,
  allowed origin, and a non-deployment runtime; it returns 404 elsewhere and is
  exercised through the normal principal resolver after session creation.
  Playwright generates a random per-run secret unless one is explicitly
  injected. Database-mutating integration and end-to-end runs additionally
  require a disposable PostgreSQL target and explicit destructive-test opt-in.
- Typed publication contracts require canonical UTC ISO strings in immutable
  state, project public snapshot payloads without internal administrator IDs,
  derive public News availability from the active snapshot, fingerprint each
  idempotent command’s operation and payload, and canonicalize hash object keys
  with locale-independent ordering.
- The private storage consumer port exposes only writes, short-lived
  subject-bound grants, and grant-authorized reads. Raw private `read`/`head`
  operations remain inside the unexported local adapter.
- Invitation creation exposes field-level errors, focuses and announces its
  linked error summary, retains submitted values, and rejects both skipped and
  repeated `America/Chicago` wall times at daylight-saving transitions.
- CI actions are commit-SHA pinned and credentials are not persisted. Dependency
  installation is frozen to the committed lockfile.

## Findings and disposition

No known critical or high-severity dependency advisory remains in the resolved
lockfile at this review. A targeted override upgrades the Better Auth CLI’s
schema parser dependency; the generated schema command and full test matrix are
rechecked with that override. pnpm still reports a deprecated transitive lodash
release selected by development tooling, so lockfile advisories and upstream
releases must remain monitored.

Database rate-limit keys contain only a keyed pseudonymous address plus the
auth path, never the raw client address. Better Auth's table has no expiry
column; an operational cleanup/retention job is therefore required before
production, even though the library opportunistically prunes stale rows during
later limiter activity. Failed-login/access-denial category auditing also
remains incomplete and must be designed with bounded cardinality and no PII.

The initial CSP retains `'unsafe-inline'` for framework bootstrap scripts and
styles. Resource origins remain self-only and no wildcard is present, but a
nonce/hash CSP is the next browser-hardening step before accepting rich content
or third-party browser integrations.

Production currently emits host-only one-year HSTS. Domain-wide
`includeSubDomains`/`preload` is deliberately withheld until G-05 confirms
canonical DNS ownership and HTTPS readiness for every affected subdomain.

DonorView is not broadly allowlisted. A future approved embed must add only its
observed exact `frame-src`/`form-action` origins (and any separately evidenced
resource origins) with regression tests; a normal hosted-link handoff needs no
such allowance.

The local object-store adapter is development/test only. It is not evidence of
production durability, malware inspection, quarantine processing, retention,
or signed-provider URL behavior. Public Story Submission uploads remain gated by
G-07 and their dedicated abuse/security implementation.

No live Google client or deployment was in scope. The cryptographic verifier
unit evidence does not close the real Google/Vercel callback, state, origin,
cookie, or multi-instance operational spike. The external checks recorded in
[auth-spike.md](../development/auth-spike.md) and
[deployment-environments.md](../development/deployment-environments.md) must pass
before production authentication or infrastructure is declared ready.

GitHub Actions are SHA-pinned and reject high-severity package advisories, but
the PostgreSQL service image is still selected by a floating major/alpine tag
rather than a reviewed digest. Pin that digest during pre-production CI
supply-chain hardening.

## Review conclusion

The repository is suitable as a feature-development foundation. It is not a
production-launch authorization. Feature slices must preserve the server-side
principal/capability boundary, append security-relevant audit events, use
private/public storage classification, and add tests for each new data or action
boundary.
