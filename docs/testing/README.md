# Testing the application foundation

## Test layers

- `pnpm test:unit` exercises pure environment, capability, invitation-proof,
  policy, publishing, and storage contracts without external services.
- `pnpm test:integration` exercises identity/access transactions and PostgreSQL
  constraints against an isolated, migrated database.
- `pnpm test:e2e` starts the production build and exercises public/admin browser
  boundaries with Chromium and axe.
- `pnpm test:e2e:smoke` is the CI-tagged subset.

The integration suite requires `APP_ENV=test`, valid 32-character test secrets,
`ALLOW_DESTRUCTIVE_TEST_DATABASE=true`, and matching
`DATABASE_URL`/`DIRECT_DATABASE_URL` values. The parsed PostgreSQL database name
must match `^habitat(?:_[a-z0-9]+)*_test$`; malformed, non-PostgreSQL,
production-looking, query-overridden, and mismatched host/port/database/schema
targets are rejected before Prisma loads.

Integration and E2E scenarios create uniquely named fixtures. They intentionally
do not delete append-only audit evidence, so row-level cleanup is not the test
lifecycle. Recreate the explicitly named disposable database between complete
local runs, then apply migrations and seed the capability catalog again. CI gets
a fresh `habitat_test` PostgreSQL service database for every job. Never use a
shared, preview, staging, or production database for these suites.

## Expected local sequence

```bash
pnpm install --frozen-lockfile
pnpm exec tsx tests/support/assert-destructive-test-database.ts
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

Accessibility coverage and the guarded browser fixture are described in
[accessibility-slice-1.md](accessibility-slice-1.md) and
[test-auth.md](test-auth.md). Browser automation is a regression signal, not a
replacement for manual keyboard, screen-reader, zoom/reflow, reduced-motion,
forced-colors, and content review before launch.
