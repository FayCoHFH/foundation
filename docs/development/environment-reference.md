# Environment variable reference

This is a safe inventory of variable names and operating rules. It intentionally
contains no credentials, tokens, connection strings, or provider values. Keep
actual values in the local environment or the future provider's encrypted
configuration; never commit them.

## Provider identity and preflight

The approved deployment identities are GitHub `FayCoHFH/foundation` with write
identity `FayCoHFH` and Vercel user `tech-9723` (`tech@fchfh.org`). The personal
Vercel user/scope `elconejodiablo` / `elconejodiablos-projects` is forbidden for
this repository. The Preview project is `FCHFH / fchfh` project
`faycohfh-foundation` (`prj_9aYpfojsfQ47zvIo5fKvzsL4I6ZF`). Run
`pnpm deploy:preflight` before every provider mutation.
The command fails closed if the Git remote, GitHub identity, or Vercel identity
is wrong, or if local `.vercel/project.json` linkage exists. It prints no
credential, token, connection string, or provider secret.
The one-time GitHub connection step may use
`ALLOW_VERIFIED_HABITAT_LINK=true` only with the exact Habitat project link;
that local link must be removed immediately after connection.

## Current Preview provider state

The Habitat-owned Vercel project is connected to `FayCoHFH/foundation` and
protects Preview deployments with Vercel Authentication. Its stable branch
alias is the configured single origin for both `APP_BASE_URL` and
`BETTER_AUTH_URL`; the provider values are intentionally not recorded here.

Preview uses the owned Neon integration resource
`faycohfh-foundation-preview` in `iad1`, connected only to this project and only
to Preview. The integration-managed `DATABASE_*` values remain Sensitive.
`BETTER_AUTH_SECRET` is also Sensitive. The nonsecret application controls
`APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `APP_BASE_URL`, `BETTER_AUTH_URL`,
`AUTH_ENABLED`, `STORAGE_DRIVER`, `LOCAL_STORAGE_ROOT`,
`PUBLIC_STORY_SUBMISSIONS_ENABLED`, and `LOG_LEVEL` are ordinary
Preview-scoped configuration so their intent can be audited without revealing
credentials. Test-auth variables are absent.

## Application runtime

| Variable                                          | Classification                                                                  | Purpose and boundary                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                         | Required runtime; nonsecret; all environments                                   | Explicit `development`, `test`, `preview`, or `production` classification. Deployment values must not fall back to development.                                                        |
| `APP_BASE_URL`                                    | Required runtime/build; nonsecret; all environments                             | Canonical single origin. Preview and production must use HTTPS; it must not contain credentials, paths, or wildcards.                                                                  |
| `BETTER_AUTH_URL`                                 | Runtime; nonsecret; all environments                                            | Must exactly equal `APP_BASE_URL`.                                                                                                                                                     |
| `BETTER_AUTH_SECRET`                              | Required runtime; secret; preview/production and authenticated local use        | Better Auth session/signing secret. Generate and rotate under operator custody; never log or commit it.                                                                                |
| `BETTER_AUTH_PREVIOUS_SECRET`                     | Optional runtime; secret; rotation only                                         | Temporary prior secret during a planned rotation. Remove after the rotation window.                                                                                                    |
| `DATABASE_URL`                                    | Required runtime/build; secret; preview/production and local/test               | PostgreSQL runtime connection. A database must be reachable during builds that statically generate database-backed public surfaces. Keep preview and production databases separate.    |
| `GOOGLE_CLIENT_ID`                                | Required runtime when deployment auth is enabled; nonsecret provider identifier | Google Workspace OIDC client identifier.                                                                                                                                               |
| `GOOGLE_CLIENT_SECRET`                            | Required runtime when deployment auth is enabled; secret                        | Google Workspace OIDC client secret.                                                                                                                                                   |
| `GOOGLE_WORKSPACE_DOMAIN`                         | Required runtime when deployment auth is enabled; nonsecret policy value        | Expected Workspace domain; it does not grant application access.                                                                                                                       |
| `AUTH_ENABLED`                                    | Optional runtime; nonsecret; local/preview/production                           | Enables the configured authentication boundary. Preview defaults off; enabled deployments still require invitations and local authorization.                                           |
| `AUTH_TRUSTED_ORIGINS`                            | Runtime; nonsecret; local/preview/production                                    | Exact comma-separated HTTP(S) origins. No wildcard Vercel domains.                                                                                                                     |
| `STORAGE_DRIVER`                                  | Required by deployment policy; nonsecret; local/test/preview/production         | `local` is permitted in Preview only while upload and mutation features are disabled and its ephemeral behavior is explicit.                                                           |
| `LOCAL_STORAGE_ROOT`                              | Optional runtime; nonsecret path; development/test/ephemeral Preview            | Local object-store root. Preview function files can disappear between invocations or deployments and must never be presented as durable storage.                                       |
| `PUBLIC_STORAGE_BASE_URL`                         | Optional runtime; nonsecret; development/test or approved storage adapter       | Base URL used by the storage adapter. It must not be treated as private-object authorization.                                                                                          |
| `LOG_LEVEL`                                       | Optional runtime; nonsecret; all environments                                   | `debug`, `info`, `warn`, or `error`. Logs must remain redacted.                                                                                                                        |
| `PUBLIC_STORY_SUBMISSIONS_ENABLED`                | Optional runtime; nonsecret feature gate; default off                           | Enables the public Story Submission boundary only after its privacy and operational review.                                                                                            |
| `PUBLIC_STORY_SUBMISSIONS_SECRET`                 | Required when that intake is enabled; secret                                    | Dedicated intake token/signing secret; never expose as `NEXT_PUBLIC_*`.                                                                                                                |
| `PUBLIC_STORY_SUBMISSIONS_PRIVACY_NOTICE_VERSION` | Required when that intake is enabled; nonsecret approval reference              | Approved privacy-notice version required before intake enablement.                                                                                                                     |
| `DONORVIEW_APPROVED_HOSTS`                        | Optional runtime; nonsecret allowlist                                           | Additional organization-approved DonorView hostnames, comma-separated. Vendor/account confirmation remains required; no DonorView credentials or constituent data are configured here. |

`VERCEL`, `VERCEL_ENV`, `NODE_ENV`, and `NEXT_RUNTIME` are platform/framework
signals. They are not application secrets and should not be hand-authored as a
substitute for `APP_ENV`; mismatches are rejected where the runtime uses them.
`NEXT_PUBLIC_APP_ENV` is optional nonsecret deployment metadata only and is not
an authorization or credential channel.

## Discoverability policy

`APP_ENV` is the single source of truth for environment classification. The
application's discoverability policy fails closed: only the exact string
`production` is recognized as an explicit production classification, and the
current release still keeps indexing disabled until production release approval.
Missing or malformed values are treated as non-production for crawler safety.

Development, test, preview, staging, branch, and other non-production
deployments emit:

- robots metadata with `noindex, nofollow` (including Googlebot);
- `X-Robots-Tag: noindex, nofollow`;
- `robots.txt` with `User-agent: *` and `Disallow: /`; and
- no sitemap or preview-host canonical URL.

Production indexing, the exact production canonical origin, and any future
sitemap policy require an explicit release decision. `APP_BASE_URL` supplies a
canonical origin only for an explicitly classified production environment and
only when it is an exact HTTPS origin; it is never used to make a preview
hostname canonical. Run `pnpm production:readiness` before a future production
release; it is intentionally a blocking checklist until those decisions and
the other documented production gates close.

## Database and one-time operator commands

| Variable                              | Classification                                                                       | Purpose and boundary                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DIRECT_DATABASE_URL`                 | Required for migration commands; secret                                              | Unpooled/direct PostgreSQL target for committed migration operations. Seed prefers `DATABASE_URL` and only falls back to this value when the runtime URL is absent. In preview/production, use it only through the separately controlled migration operator; do not put it in a browser-visible environment. |
| `SHADOW_DATABASE_URL`                 | Required for migration authoring/drift checks; secret; disposable nonproduction only | Separate shadow database. Never point it at development, Preview, staging, or production data.                                                                                                                                                                                                               |
| `ALLOW_DESTRUCTIVE_TEST_DATABASE`     | Test-only explicit guard; nonsecret                                                  | Must be exactly `true` together with disposable `habitat*_test` targets. It is not a general bypass.                                                                                                                                                                                                         |
| `PRISMA_REQUIRE_DIRECT_DATABASE_URL`  | Internal command guard; nonsecret                                                    | Set by migration scripts to fail closed without `DIRECT_DATABASE_URL`.                                                                                                                                                                                                                                       |
| `PRISMA_REQUIRE_SHADOW_DATABASE_URL`  | Internal command guard; nonsecret                                                    | Set by migration authoring/drift scripts to fail closed without `SHADOW_DATABASE_URL`.                                                                                                                                                                                                                       |
| `CONTENT_SEED_AUTHOR_ADMIN_USER_ID`   | One-time content-seed input; confidential identifier                                 | Existing active author for the verified legacy Project History seed. Must differ from the approver.                                                                                                                                                                                                          |
| `CONTENT_SEED_APPROVER_ADMIN_USER_ID` | One-time content-seed input; confidential identifier                                 | Existing active approver for the verified legacy Project History seed. The seed does not create or grant access.                                                                                                                                                                                             |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL`         | One-time operator input; confidential                                                | Initial invited administrator email. Use only with the explicit bootstrap confirmation and approved account.                                                                                                                                                                                                 |
| `BOOTSTRAP_CONFIRMATION`              | One-time operator input; secret-like confirmation                                    | Exact confirmation phrase required by the bootstrap command; do not store it.                                                                                                                                                                                                                                |

## Test, CI, and verification controls

| Variable                                      | Classification                          | Purpose and boundary                                                                                   |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ENABLE_TEST_AUTH`                            | Test-only; nonsecret gate               | Local/CI only, loopback only, never Vercel or deployment environments.                                 |
| `TEST_AUTH_SECRET`                            | Test-only; secret                       | Ephemeral test-session secret. Never reuse an auth or provider secret.                                 |
| `CI`                                          | CI-provided; nonsecret                  | Selects CI reporters and Playwright behavior.                                                          |
| `NODE_VERSION` / `PNPM_VERSION`               | CI-only; nonsecret                      | Workflow setup values kept aligned with the pinned repository versions.                                |
| `BRAND_BASE_URL`                              | Local verification; nonsecret           | Optional base URL for the runtime brand audit; defaults to loopback port 3200.                         |
| `BRAND_AUDIT_STRICT` / `BRAND_RUNTIME_STRICT` | Verification-only; nonsecret            | Turns brand audit failures into nonzero exits.                                                         |
| `C42B_RUN_MIGRATION_UPGRADE`                  | Explicit migration-test gate; nonsecret | Enables the isolated historical C3-to-C4 upgrade test only when its disposable databases are prepared. |

No `STRIPE_*`, DonorView credential, SMTP, analytics, Vercel token, or GitHub
token variables are currently configured. Future provider integrations require
their own reviewed contract and secret-handling plan; do not invent values in
this repository.

## Environment separation

- Local development uses local resources only.
- CI/test uses disposable PostgreSQL and local storage, with the destructive
  test guard enabled only inside the isolated job.
- Preview uses its persistent, isolated Neon database and an explicitly
  ephemeral local storage adapter. Public Story Submission and upload mutation
  are disabled, so Preview does not promise file persistence. It must not use a
  shared valuable development database or a disposable local database.
- Production requires its own PostgreSQL, direct migration credential, durable
  public/private storage, secrets, backups/PITR, and operational ownership.

The repository does not store provider credentials. Preview schema changes use
committed migrations applied with `prisma migrate deploy`; `prisma migrate
status` is a read-only deployment gate. All 21 committed migrations were
applied before the protected Preview was validated.
