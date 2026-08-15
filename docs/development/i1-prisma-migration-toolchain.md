# I1 Prisma migration toolchain

Status: implemented and locally verified on 2026-08-15.

## Root cause and correction

The previous local `Schema engine error` was not a schema, migration, native
engine, or Prisma package defect. The migration URL used during the C3.1
validation omitted a database role and therefore depended on the shell's
inherited operating-system user. A clean shell cannot safely supply that
implicit state. With an explicit direct URL role, Prisma 7.9.1 on macOS ARM64
applied all committed migrations, reported status, and completed migration diff
normally against local PostgreSQL 14.17.

All operator URLs must now include an explicit role. `DIRECT_DATABASE_URL` is
the controlled unpooled migration target. `SHADOW_DATABASE_URL` must be a
different disposable database and is required by `db:migrate:dev` and
`db:migrate:diff`. Prisma configuration rejects a direct/shadow target match.
The test migration preflight additionally requires the destructive-test opt-in,
the repository's disposable `habitat*_test` naming rule, and distinct target
and shadow databases.

## Local disposable workflow

For an isolated test database and shadow database, both on loopback and both
with explicit roles:

```bash
pnpm install --frozen-lockfile
pnpm db:test:assert-migration-environment
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:seed
pnpm db:seed
pnpm db:migrate:diff
pnpm test:integration
```

The migration target and shadow target must never be the same database. Neither
may be development, preview, staging, production, or a personal database.
`ALLOW_DESTRUCTIVE_TEST_DATABASE=true` remains mandatory for test mutation.

## Future schema-changing slices

1. Configure an explicit-role `DIRECT_DATABASE_URL` for the development
   migration target and a separate disposable `SHADOW_DATABASE_URL`.
2. Run `pnpm db:migrate:dev -- --name <descriptive_name>`.
3. Review the generated SQL and commit it only with the intended schema change.
4. Run `pnpm db:migrate:diff`, integration tests, and the relevant regression
   suite.
5. In CI, deploy committed migrations and verify status/diff against its
   disposable PostgreSQL service.
6. In preview/production, an authorized migration operator runs only
   `pnpm db:migrate:deploy` and `pnpm db:migrate:status` with the controlled
   direct credential before traffic promotion. Never seed, reset, or run
   `migrate dev` there.

No Prisma, `@prisma/client`, `@prisma/adapter-pg`, `pg`, Node, or lockfile
change was needed. The existing non-failing pg 9 deprecation notice comes from
the runtime adapter path and is unrelated to the migration schema-engine CLI.

## CI impact

CI now creates a fresh `habitat_shadow_test` PostgreSQL service database, runs
the migration-environment guard, and checks the committed migration history
against the schema before seeding. It retains frozen installation, isolated
PostgreSQL, seed validation, integration tests, build, and browser smoke tests.
