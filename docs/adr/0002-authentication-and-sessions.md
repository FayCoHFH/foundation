# ADR-0002: Use Better Auth, Google OIDC, and database sessions

- Status: Accepted
- Date: 2026-08-14

## Context

Administrators use organization Google accounts, but Google identity must not grant application access automatically. The application needs invitation-gated access, immediate suspension/revocation, capability authorization, serverless deployment compatibility, and a supported library rather than custom OAuth/session cryptography.

Auth.js was an earlier candidate. In September 2025 the shared maintainers announced Auth.js had joined Better Auth and [recommended Better Auth for new projects](https://better-auth.com/blog/authjs-joins-better-auth) unless a specific gap—most notably stateless sessions at that time—required Auth.js. This platform deliberately needs database sessions, so that exception does not apply.

## Decision

Use the current supported non-prerelease Better Auth release, pinned at scaffolding, with:

- Google OIDC only, scopes `openid email profile`;
- the Prisma adapter and PostgreSQL-backed sessions;
- stable Google `sub` as the external identity key, plus validated `email_verified` and expected signed Workspace `hd` claim;
- invitation-gated account creation and an active local AdminUser requirement;
- Better Auth implicit account linking and user-initiated account linking disabled initially; a verified email match never links a different Google `sub`;
- implicit Google sign-up disabled, with principal creation allowed only through a server-verified, single-use invitation-acceptance path;
- application-owned roles/capabilities checked in a centralized server data-access layer;
- cookie cache disabled initially for revocation on the next protected request;
- initial 12-hour non-sliding session maximum and fresh Google reauthentication for sensitive actions;
- no retained Google OAuth access, refresh, or ID token after identity establishment where the selected version supports discarding it; if any token must persist, Better Auth OAuth-token encryption is enabled, the field is Restricted, key rotation is versioned, and token values are excluded from responses, logs, audit, and non-production data;
- Secure, HttpOnly, host-only, SameSite cookies and library CSRF/trusted-origin protections.

Proxy/middleware session presence is an optimistic redirect only. Every protected use case validates the database session, active local user, and capability.

## Consequences

- Account suspension and grant changes are locally enforceable regardless of Google account validity.
- Authentication tables join the project schema, but auth library models remain distinguishable from the Habitat AdminUser authorization aggregate.
- Google email changes do not transfer privileges because `sub` is stable; Better Auth's default same-email implicit linking is explicitly disabled, so a new `sub` with the same email cannot inherit or link automatically.
- Database session lookup adds latency. Security-sensitive immediate revocation is preferred; caching may be reconsidered only with measurements and an explicit revocation-delay bound.
- Drive, Gmail, Calendar, and Admin SDK scopes require a separate design; they are not inherited from login.

## Rejected alternatives

- **Auth.js for this greenfield build:** still maintained for security/urgent fixes, but its maintainers recommend Better Auth for new projects and no required feature gap favors it.
- **Stateless/JWT-only sessions:** harder immediate revocation and stale authorization.
- **Google Workspace domain as authorization:** domain membership is not a capability grant.
- **Custom OAuth/session code:** unnecessary high-risk security ownership.
- **Google One Tap or email/password initially:** broader surface without a requirement.

## Required scaffold-stage spike

1. Pin current Next.js, Better Auth, Prisma adapter, Prisma, and PostgreSQL/Neon versions and review advisories.
2. Generate Better Auth Prisma models to a scratch path, reconcile the reviewed diff into the schema, and create the migration through Prisma; Better Auth supports Prisma schema generation, not direct Prisma migration.
3. Prove local and production-build callback/base-URL/cookie behavior and define safe preview callbacks.
4. Configure and prove disabled implicit linking, disabled user-initiated linking, and disabled implicit Google sign-up. Prove invited activation and stable-`sub` relogin; reject uninvited, wrong/missing `hd`, unverified email, and a different `sub` presenting an existing email **before** any auth account or local-principal link is created.
5. Inspect the generated account schema and stored records after login. Prove unused Google access/refresh/ID tokens are not retained where supported; if any must persist, prove Better Auth OAuth-token encryption, versioned key rotation/recovery, Restricted handling, response/log/audit exclusion, and deletion on unlink/deactivation.
6. Prove sessions work across stateless app instances, suspension takes effect next request, expiry is non-sliding, capabilities are checked server-side, CSRF/origins/cookies are secure, and sensitive actions require freshness.

Failure pauses the auth slice and requires a superseding ADR; it does not authorize a silent Auth.js/custom fallback.

## Primary references

- [Auth.js joins Better Auth](https://better-auth.com/blog/authjs-joins-better-auth)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth users, accounts, and account linking](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth options, including OAuth-token encryption](https://better-auth.com/docs/reference/options)
- [Google OIDC claim reference](https://developers.google.com/identity/openid-connect/reference)
- [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication)
