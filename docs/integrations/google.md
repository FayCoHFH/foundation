# Google administrator authentication

Status: Accepted
Last reviewed: 2026-08-14

## Decision

Use Better Auth with Google's OpenID Connect provider and PostgreSQL-backed sessions. Request only `openid`, `email`, and `profile`. Google proves identity; the Habitat platform's local invitation, access state, roles, and capabilities authorize administrative actions.

A successfully authenticated Google account has zero application access unless all of the following are true:

- the token and OAuth flow validate through Better Auth;
- `email_verified` is true;
- the immutable Google `sub` is linked to the intended local AdminUser (or is accepting a valid invitation);
- the signed `hd` claim matches an approved Fayette County Habitat Google Workspace domain;
- the local AdminUser is active and has the required capability.

Google documents `sub` as stable and warns that email can change and must not be the primary identifier. The signed `hd` claim, not the email suffix or `hd` request hint, is the Workspace-domain signal. Domain membership remains only an admission constraint, never authorization.

Better Auth's default same-verified-email implicit account linking is not compatible with this invariant. Configure `account.accountLinking.disableImplicitLinking` and disable user-initiated account linking initially. Disable implicit Google sign-up as well; only a server-verified invitation-acceptance path may create the auth account and local principal.

## Authentication library choice

Choose Better Auth for this greenfield project. In September 2025 the Auth.js and Better Auth maintainers announced that Auth.js joined Better Auth and explicitly recommended Better Auth for new projects unless a specific gap—historically stateless sessions—requires Auth.js. This platform requires database-backed revocation, so that exception does not apply. Auth.js remains an existing-project/security-maintenance option, not the greenfield default.

Better Auth has current first-party Next.js, Google, Prisma, PostgreSQL, session-revocation, cookie, and security documentation. Do not ask for a package-version preference: at scaffolding, select the current supported non-prerelease release, pin it in the lockfile, review current advisories, and capture the exact version in the implementation PR.

## Session strategy

- Store sessions in PostgreSQL through the Prisma adapter so suspension and revocation are authoritative across Vercel instances.
- Disable Better Auth session cookie caching initially; revocation must take effect on the next protected database-backed request. Reconsider only with measured latency and a documented maximum revocation delay.
- Configure a 12-hour, non-sliding maximum admin session for the initial release; verify exact library behavior in the spike.
- Require a fresh Google reauthentication for role/access changes, integration-secret changes, private exports/documents, and emergency approval/publication overrides.
- Use Secure, HttpOnly, host-only cookies with SameSite=Lax or stricter; keep CSRF and trusted-origin checks enabled.
- Revoke all sessions on local suspension/revocation and when the external identity link changes.
- Treat proxy/middleware cookie presence only as an optimistic redirect. Every protected use case performs a database session and local capability check.

## Invitation and account-linking controls

- Invitations are single use, expire, bind to an intended verified email/domain, and are stored hashed where they contain a bearer token.
- On first acceptance, persist the Google `sub`; subsequent sign-in links by `sub`, not mutable email.
- A changed verified email for an existing `sub` is reviewed against domain/access policy and audited.
- A matching email on a different `sub` never inherits the existing user's permissions automatically.
- General OAuth sign-up is denied. Enable the selected version's `disableImplicitSignUp` control for Google and require a server-side creation/acceptance hook to consume a valid pending invitation before creating or linking either the Better Auth account or local principal.
- Better Auth implicit linking and user-initiated linking are disabled. A different `sub` presenting an existing verified email is rejected before any link is persisted and is audited without recording token material.
- No email/password, magic-link, One Tap, or additional social-provider login is enabled in the initial release.

## OAuth and secret handling

- Separate Google OAuth clients for local development and production; use a controlled preview strategy rather than broad wildcard redirect URIs.
- Register exact HTTPS redirect URIs and trusted origins. Production base URL is explicit.
- Keep Google client secret and Better Auth secret only in managed server environment storage; rotate with a documented rollout.
- Do not request Drive, Gmail, Calendar, Admin SDK, offline, or other scopes for sign-in. If a later feature needs Google API access, it receives a separate consent, token-storage, and least-privilege design.
- Do not retain Google access, refresh, or ID tokens after identity establishment where the selected version supports discarding them. Inspect the generated account schema and live test records rather than assuming absence. If any token must persist, enable Better Auth OAuth-token encryption, classify it Restricted, use a versioned rotation/recovery procedure, minimize its lifetime, delete it on unlink/deactivation, and never expose it in session responses, logs, audit, analytics, fixtures, exports, or support data.

## Required scaffold-stage spike

The auth slice is accepted, but its exact version combination must pass this bounded spike before other admin work depends on it:

1. Pin current supported Next.js, Better Auth, Prisma adapter, Prisma, and PostgreSQL/Neon versions; review active security advisories.
2. Generate Better Auth's Prisma models into a scratch path, review the diff, integrate them into the project schema, and create the migration with Prisma. Better Auth documents Prisma schema generation but not direct Prisma migration.
3. Run local PostgreSQL and a production-build/server-mode flow for Google callback/base URL/cookie behavior. Define a safe preview callback strategy.
4. Prove implicit account linking, user-initiated linking, and implicit Google sign-up are disabled. Prove uninvited, wrong-`hd`, missing-`hd`, unverified-email, suspended, and revoked identities receive no admin access; prove a different `sub` presenting an existing email is rejected before any Better Auth account/local-principal link is persisted.
5. Inspect generated account fields and stored records. Prove unused access/refresh/ID tokens are not retained where supported; otherwise prove OAuth-token encryption, key rotation/recovery, Restricted handling, response/log/audit exclusion, and deletion behavior.
6. Prove invited activation, stable-`sub` relogin, database session persistence across stateless app instances, logout, suspension revocation on the next request, and 12-hour non-sliding expiry.
7. Prove route proxy checks are only optimistic and a centralized server data-access check enforces capabilities after session/user/role changes.
8. Prove CSRF/trusted-origin rejection, secure production cookie flags, fresh-session enforcement, secret redaction, and an install/build/deploy smoke test.
9. Capture schema diff, exact versions, test results, and operational setup in the implementation PR.

If a criterion fails, pause the authentication slice and record a superseding ADR. Do not silently fall back to Auth.js or custom OAuth/session code.

## Primary sources

- [Auth.js joins Better Auth and new-project recommendation](https://better-auth.com/blog/authjs-joins-better-auth)
- [Auth.js repository recommendation](https://github.com/nextauthjs/next-auth)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [Better Auth session management and revocation](https://better-auth.com/docs/concepts/session-management)
- [Better Auth users, accounts, and implicit linking](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth options and OAuth-token encryption](https://better-auth.com/docs/reference/options)
- [Better Auth cookie behavior](https://better-auth.com/docs/concepts/cookies)
- [Google OpenID Connect claims](https://developers.google.com/identity/openid-connect/reference)
- [Next.js authentication and authorization guidance](https://nextjs.org/docs/app/guides/authentication)
