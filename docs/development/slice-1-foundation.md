# Slice 1 application foundation

Status: implemented and locally verified on 2026-08-14. This record describes
the executable foundation; it does not close infrastructure, content, legal, or
live-provider gates.

## Delivered boundaries

The slice establishes:

- a pinned Node.js/pnpm/Next.js/React/TypeScript/Tailwind toolchain and lockfile;
- an App Router public shell with shared site chrome, error/not-found surfaces,
  global tokens, responsive behavior, and launch-safe `noindex` policy;
- a protected administration shell with sign-in, access-denied, invitation
  acceptance, invitation creation, sign-out, and capability-checked server
  actions;
- Better Auth with Google as the only provider, PostgreSQL database sessions,
  Google `sub` as the provider subject, verified Workspace-domain enforcement,
  local invitation activation, no implicit account linking, and an explicitly
  enabled database-backed rate limiter with keyed pseudonymous Vercel client
  identity and fail-closed shared buckets elsewhere;
- Prisma 7 with a committed PostgreSQL migration, a code-defined capability and
  role seed, a constrained initial Super Admin bootstrap, explicit audited
  multi-holder Super Admin promotion, and append-only audit events;
- centralized fresh-auth and capability guards for future sensitive actions;
- typed publishing contracts for Story and News revision, approval, scheduling,
  immutable snapshots, expiry, archive, withdrawal, and successor behavior.
  Immutable state uses canonical UTC ISO strings; public snapshot payloads are
  deliberate projections without internal administrator/revision IDs; public
  News availability derives from the active snapshot; command idempotency binds
  a key to an operation-and-payload fingerprint; and canonical hash key order is
  locale-independent;
- separate public/private storage ports plus a development/test filesystem
  adapter with opaque immutable keys and short-lived private grants; the
  consumer-facing private port exposes no raw read or metadata-read bypass;
- Vitest unit and PostgreSQL integration suites, Playwright/axe smoke coverage,
  and a PostgreSQL-backed GitHub Actions pipeline with a disposable-target
  opt-in guard;
- Vercel-oriented build configuration without deploying, binding accounts, or
  using production credentials.

## Deliberately absent

This is a foundation slice. It does not implement the Communications editor or
database aggregate, migrate Wix content, publish real public copy, add DonorView
or Stripe flows, provide production object storage, introduce applicant or
private-grant data, or create provider infrastructure.

## Architecture shape

The application remains a modular monolith. `src/app` owns HTTP/UI composition;
`src/platform` owns identity, configuration, persistence, logging, and storage
adapters; and `src/modules` owns domain contracts. Protected pages and mutations
resolve the database-backed local principal and capabilities at the server
boundary. The proxy is only an optimistic redirect and is never the security
boundary.

## Evidence and residual acceptance

Automated evidence covers schema generation and validation, migration from an
empty PostgreSQL database, idempotent seeding, database constraints, invitation
activation races, session denial/revocation, append-only audit behavior,
publishing/storage invariants, production build, security headers, responsive
layout, keyboard landmarks, and axe smoke checks. Invitation creation now
returns field-specific errors, focuses and announces an error summary, links the
summary to invalid fields, retains submitted values, and explicitly rejects
nonexistent or repeated `America/Chicago` wall times across daylight-saving
transitions.

The publishing contract denies self-approval by default. Its narrow exception
binds the authorizer to the self-approving administrator and records an explicit
Super Admin override reason; a persistence slice must supply fresh,
database-backed Super Admin authorization and append the matching audit event.

No organization-owned Google OAuth client, exact Workspace tenant, Vercel
project, managed PostgreSQL instance, or production object store was available
in this slice. Consequently, a real Google callback, provider state/CSRF round
trip, production Secure-cookie observation, cross-instance managed-database
session exercise, and Vercel preview deployment remain environment acceptance
work under G-02/G-05. Cryptographic callback-profile verifier unit tests do not
substitute for that real Google/Vercel operational spike. Authentication remains
disabled by default in previews.

## Next boundary

The smallest sensible successor is the first vertical Communications kernel
slice: persist one Story draft/revision with editorial ownership, capability-
checked create/read/edit, exact-hash approval, and audit events. Keep publication
UI, media promotion, homepage placement, migration, and News expiry out of that
first vertical slice.
