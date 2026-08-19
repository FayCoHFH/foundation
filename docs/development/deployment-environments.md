# Deployment environments and Vercel readiness

## Isolation contract

Development, test, preview, and production are separate security boundaries.
They must not share PostgreSQL databases, Google OAuth clients, object stores,
Better Auth secrets, test-auth secrets, or operator bootstrap state.

| Environment       | `APP_ENV`     | Google auth                         | Database/storage rule                                                      |
| ----------------- | ------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Local development | `development` | Optional local client               | Local-only resources                                                       |
| CI/test           | `test`        | Disabled; guarded test session only | Disposable PostgreSQL and local adapter                                    |
| Preview           | `preview`     | Off by default                      | Isolated preview database/store; exact stable origin if explicitly enabled |
| Production        | `production`  | Required when deployed              | Production database, direct migration URL, durable private/public stores   |

`NEXT_PUBLIC_APP_ENV` contains classification only and never a credential.
`APP_ENV` is mandatory; a Vercel environment mismatch fails startup rather than
falling back to development secrets, databases, or cookie policy.
`AUTH_TRUSTED_ORIGINS` is a comma-separated set of exact origins; wildcard
`*.vercel.app` trust is prohibited, as are credentials, non-HTTP(S) schemes,
paths, queries, and fragments. Secret rotation may temporarily provide
`BETTER_AUTH_PREVIOUS_SECRET` while `BETTER_AUTH_SECRET` is current.

Better Auth rate limiting is explicitly enabled with database storage. IP
resolution begins from Vercel’s platform-overwritten
`x-vercel-forwarded-for`, but the application replaces it with a keyed
pseudonymous address before every route or direct Better Auth API call. Better
Auth trusts only that internal value. Other runtimes remove the internal header
and therefore use a shared fail-closed bucket per auth path. Persisted session
IP and user-agent fields remain null. Rate-limit rows contain the pseudonym plus
auth path and need a defined cleanup/retention job before production because the
table has no expiry column.

## Configuration and database credentials

Operator-facing Prisma, seed, bootstrap, and auth-schema commands preserve
existing process environment values, then load `.env.local`, then `.env`.
`DATABASE_URL` is the pooled/runtime connection. Seed and bootstrap prefer it
and may fall back to `DIRECT_DATABASE_URL`. Prisma schema generation and
validation do not connect and require neither database credential nor a direct
URL. Every migration script fails closed without `DIRECT_DATABASE_URL`, which
must be an unpooled/direct connection owned by the controlled migration
operator. Migration authoring and drift checks also fail closed without a
separate `SHADOW_DATABASE_URL`; all connection URLs must carry an explicit
database role rather than rely on an inherited shell user.

## Build and migration

`vercel.json` uses frozen pnpm installation and generates the Prisma client
before `next build`; those are the only build steps. It intentionally does not
migrate or seed a database during a Vercel build. Apply committed migrations
once through a separately controlled release job using the direct database URL,
confirm `pnpm db:migrate:status`, and only then promote traffic.

The Campaigns surface is statically generated from the public campaign
projection, so PostgreSQL must be reachable during a Preview or Production
build. The build database must already have the committed migrations and the
code-defined baseline seed data required by the public read model. Do not point
the build at a production database before the release migration has been
verified, and do not make a Vercel build responsible for migration or seeding.

Preview requires a persistent, isolated nonproduction PostgreSQL database. It
must not use Production PostgreSQL, a shared valuable development database, or
a disposable local database. The provider and region remain a later manual
decision; this repository does not select or provision one. `DIRECT_DATABASE_URL`
belongs only to the controlled migration operator, while `SHADOW_DATABASE_URL`
is for disposable migration authoring/drift checks and is not a Preview
runtime variable.

Production responses use host-only one-year HSTS. Do not add
`includeSubDomains` or submit the domain for preload until G-05 confirms
canonical DNS ownership and HTTPS coverage for every affected subdomain.

The checked-in GitHub Actions workflow creates a distinct disposable shadow
database, proves the migration and migration-to-schema diff after fail-closed
target checks and explicit destructive-test opt-in, then runs seed, static checks, unit, integration,
production build, and browser smoke tests. Local integration and end-to-end runs
have the same disposable-database and explicit-opt-in requirement; they must
never target a development, preview, or production database.

## Production prerequisites

G-05 remains open. Before deploying, Sven or the designated owner must confirm
GitHub/Vercel ownership, region and residency, managed PostgreSQL and object
storage, preview isolation, DNS, secrets and rotation custody, backup/PITR,
budget alerts, observability, incident contacts, and the migration operator.

The `vercel-blob` environment value reserves the accepted adapter boundary; a
production public/private object-store implementation and operational exercise
remain a later storage slice. Production validation rejects the local ephemeral
adapter.

## Future manual provider sequence

Provider setup is intentionally pending. When explicitly authorized, the
release sequence is:

1. Create/connect the fresh GitHub repository and preserve the reviewed history.
2. Create/connect a fresh Vercel project without importing stale `.vercel`
   linkage metadata.
3. Configure separate Preview and Production variables, PostgreSQL databases,
   storage, secret custody, backups/PITR, observability, and migration ownership.
4. Apply committed migrations with the controlled direct credential; verify
   status and the database-backed build.
5. Deploy and review a Vercel Preview, then verify the approved Production
   deployment.
6. Only after those checks, perform the explicitly authorized `fchfh.org`
   DNS/domain cutover.

No deployment, provider-side mutation, DNS change, GitHub connection, or Vercel
project linkage was performed in this readiness pass. See the [safe environment
reference](environment-reference.md) for the complete variable inventory.
