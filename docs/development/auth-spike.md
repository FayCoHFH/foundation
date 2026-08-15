# Slice 1 authentication spike record

Status: implementation selected; local executable criteria passed; live Google
and Vercel environment acceptance remains open.

## Decision and supported shape

The accepted identity implementation is Better Auth 1.6.29 with its Prisma
adapter, Prisma 7.9.1, PostgreSQL database sessions, and Google OIDC only. The
application requests only Google’s default `openid`, `email`, and `profile`
scopes. Better Auth’s adapter transaction option is explicitly enabled.
Better Auth’s rate limiter is also explicitly enabled with
`storage: "database"`, so throttling state is shared across application
instances rather than held in one process.

The provider configuration:

- uses the signed Google `sub` as `Account.accountId` and duplicates the stable
  association in `ExternalIdentity(provider, subject)`;
- enforces the exact signed Workspace `hd` claim and `email_verified`;
- disables implicit sign-up, ID-token sign-in, account linking, and implicit
  same-email linking;
- initiates signup only from the invitation acceptance journey;
- uses `prompt=login` so a newly created session represents a provider login;
- stores neither access, refresh, nor ID tokens: hooks null token-shaped fields
  and PostgreSQL checks reject retention;
- leaves Better Auth’s CSRF and origin validation enabled and accepts only exact
  configured HTTP(S) origins. Wildcards, credentials, non-HTTP schemes, paths,
  queries, and fragments are rejected during environment validation.

Source inspection found that Better Auth 1.6.29’s stock Google
authorization-code profile path decodes the returned ID token, while its built-in
signature verifier is used by the separately disabled direct-ID-token path. The
scaffold therefore supplies a `getUserInfo` override that cryptographically
verifies callback-token signature, Google issuer, client audience, expiry, and
maximum age before validating `sub`, `email_verified`, and exact `hd`. Repeat
sign-ins also replace stored user claim fields from that newly verified result;
the session gate then rejects stale/unverified identity state.

## Invitation and activation sequence

1. An administrator creates a normalized-email invitation with intended local
   roles. Only the SHA-256 token digest is stored.
2. The acceptance endpoint checks the pending token and writes a signed,
   ten-minute, HttpOnly, SameSite=Lax proof cookie scoped to `/api/auth`.
3. Before Better Auth persists a new user, the hook requires the proof, exact
   invited email, verified Google email, and expected verified Workspace claim.
4. Before a database session is created, an idempotent application transaction
   conditionally consumes the invitation, links the Google subject, activates
   the local `AdminUser`, materializes intended roles, and appends an audit event.
5. Session creation is denied unless the resulting local principal is ACTIVE.

Moving finalization into the session-before hook is intentional. If Better Auth
commits its user/account transaction and application activation initially fails,
a retry can complete activation; an account-create-after-only design would leave
an unrecoverable orphan. An orphan without an active local identity remains
deny-only and may be removed through a future support cleanup procedure after
operator review.

## Sessions and revocation

Sessions are database-backed, fixed at 12 hours, non-sliding, and read without a
cookie cache. Cookie attributes are host-only, HttpOnly, SameSite=Lax, and Secure
in preview/production. IP resolution remains enabled for the database-backed
auth rate limiter. On Vercel, routes and every direct `auth.api` call replace
Vercel's platform-overwritten `x-vercel-forwarded-for` value with a keyed,
IPv6-shaped pseudonym. Better Auth trusts only that internal header, not a
caller-supplied generic forwarding header or raw platform value. Other runtimes
remove the internal header, so unresolved clients share a fail-closed limiter
bucket per auth path. The session-create hook still writes both IP address and
user agent as null, and PostgreSQL constrains both columns to remain null.
Suspension and revocation check the local principal on every protected request
and delete all database sessions in the same lifecycle operation.

The rate-limit table stores the pseudonym and auth path, not the raw address.
Because Better Auth 1.6.29 gives this table no expiry column, a bounded cleanup
and retention job remains an explicit pre-production requirement.

`assertFreshAuthentication` centrally requires a session created within five
minutes for sensitive actions. It does not refresh a timestamp or silently
reactivate an old session. Future reauthentication UX must perform the Google
login flow and then retry the guarded action.

## Schema reconciliation evidence

`pnpm auth:schema:generate` successfully generated the Better Auth schema into
ignored `tmp/` for review. The committed Prisma schema deliberately adds
application relations, indexes, `(providerId, accountId)` and
`(userId, providerId)` uniqueness, Google-only/token-null checks, and audit/admin
models. It also includes Better Auth’s database rate-limit table. Schema
generation and validation use a non-connecting placeholder and therefore need
no direct database credential; Prisma migrations—not Better Auth migration
commands—own deployment and fail closed unless `DIRECT_DATABASE_URL` is
provided.

## Executable evidence

Unit and PostgreSQL integration tests directly exercise the pinned Better Auth
option object plus the application hooks and database boundary: pre-persistence
invitation checks, atomic activation, mismatched email denial, concurrent
acceptance, OAuth-token rejection, session metadata rejection, audit
immutability, an executable PostgreSQL 429 threshold with a non-raw limiter key,
and suspension-driven role/session revocation. Negative service tests cover
missing capability, stale fresh-auth, non-Super-Admin promotion, stale versions,
and direct unauthorized invitation mutation without side effects. Unit tests
exercise the callback profile verifier with
cryptographically signed and tampered tokens, including issuer, audience,
expiry/age, verified-email, and exact-Workspace rejection cases. A production
build and protected-route Playwright checks run through the real principal
resolver. This is verifier and local-boundary evidence, not an executed Google
OAuth callback; only the live provider exercise below can prove current signed
claims and end-to-end library callback/cookie/state behavior.

## Environment acceptance still required

Before production auth is accepted, exercise an organization-controlled Google
client on exact local and production callback URLs and, if a preview auth test is
needed, a separate client/database on one stable exact preview domain. Observe
state/PKCE/origin behavior, invitation-only creation, different-`sub`/same-email
rejection, stored account/session rows, Secure/HttpOnly/SameSite cookies,
cross-instance revocation, suspension, and five-minute reauthentication. OAuth
remains off in ordinary previews; no production OAuth proxy or wildcard Vercel
origin is approved.

Primary references: [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma),
[Next.js integration](https://better-auth.com/docs/integrations/next),
[database concepts](https://better-auth.com/docs/concepts/database), and
[configuration options](https://better-auth.com/docs/reference/options).
