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

## Discoverability and preview protection

Application discoverability is fail-closed. The existing `APP_ENV` value is the
only environment classification used by the discoverability policy. Missing,
malformed, development, test, preview, staging, or other non-production values
produce all of the following:

- `noindex, nofollow` robots metadata, including Googlebot directives;
- `X-Robots-Tag: noindex, nofollow` on responses;
- `User-agent: *` and `Disallow: /` in `robots.txt`;
- no sitemap publication; and
- no preview or non-production canonical URL.

The centralized Next.js header rule applies the crawler directive to `/:path*`,
including HTML, static assets, and framework responses. It is an advisory
header and does not block asset delivery or replace authentication.

The current release keeps indexing disabled even when `APP_ENV=production`.
That is intentional: production indexing requires an explicit release decision
and a reviewed change to the policy. An absent or malformed environment can
never make the site indexable.

Before creating or connecting a Vercel project, enable Preview Deployment
Protection. The preferred baseline is:

`Project Settings → Deployment Protection → Vercel Authentication → protect Preview Deployments`

Use Standard Protection when it fits the selected Vercel plan and review
workflow. Do not assume Password Protection is available unless the selected
plan explicitly supports it; Vercel Authentication is the baseline and does
not require that paid feature.

Vercel normally adds `X-Robots-Tag: noindex` to Preview Deployments, but that
automatic behavior may not apply when a custom domain is assigned to a
non-production branch. Never assign `fchfh.org` or another public custom domain
to a preview or branch deployment. If a custom staging domain is later needed,
retain the application-level noindex/nofollow policy and Deployment Protection.

Vercel Shareable Links or deliberate automation bypasses may later be used for
reviewers or E2E automation. They must not be advertised as ordinary public
URLs, and bypass secrets must never be generated, hardcoded, or committed in
this repository.

Better Auth rate limiting is explicitly enabled with database storage. IP
resolution begins from Vercel’s platform-overwritten
`x-vercel-forwarded-for`, but the application replaces it with a keyed
pseudonymous address before every route or direct Better Auth API call. Better
Auth trusts only that internal value. Other runtimes remove the internal header
and therefore use a shared fail-closed bucket per auth path. Persisted session
IP and user-agent fields remain null. Rate-limit rows contain the pseudonym plus
auth path and need a defined cleanup/retention job before production because the
table has no expiry column.

## Provider identity guard

Provider mutations for this repository are allowed only under the Habitat
identities below:

- GitHub repository and write identity: `FayCoHFH/foundation` and `FayCoHFH`.
- Vercel user: `tech-9723` (`tech@fchfh.org`).
- Forbidden Vercel scope: `elconejodiablos-projects` / `elconejodiablo`.

Before any Vercel project, GitHub connection, database integration, environment
variable, or deployment mutation, run `pnpm deploy:preflight`. It fails closed
unless the origin and GitHub identity match the values above, `vercel whoami`
returns exactly `tech-9723`, and no local `.vercel/project.json` linkage exists.
Do not replace this guard with a personal token, personal scope, or stale local
linkage. The only exception is the one-time GitHub connection step, which may
run `ALLOW_VERIFIED_HABITAT_LINK=true pnpm deploy:preflight` after `vercel link`
has created a link whose project name is `faycohfh-foundation` and whose team ID
is the verified Habitat team; remove that local link immediately afterward. If
the check fails, stop and correct the authenticated Habitat account before
continuing. The guard does not delete cloud resources; cloud cleanup requires
separate explicit authorization for the exact resource.

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

## Remaining production provider sequence

The Habitat-owned Vercel project and Preview Neon resource are provisioned for
this foundation pass. Production provider setup remains intentionally pending.
When explicitly authorized and after `pnpm deploy:preflight` passes, the
remaining release sequence is:

1. Configure separate Production variables, PostgreSQL database, storage,
   secret custody, backups/PITR, observability, and migration ownership.
2. Apply committed migrations with the controlled direct credential; verify
   status and safe bootstrap data without importing protected records.
3. Deploy and review a protected Production candidate, then verify routes,
   database-backed reads, links, crawler headers, logs, and failure states.
4. Only after those checks, perform the explicitly authorized `fchfh.org`
   DNS/domain cutover.

See the [safe environment reference](environment-reference.md) for the complete
variable inventory.
