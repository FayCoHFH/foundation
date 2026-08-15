# Local development setup

## Prerequisites

- Node.js 22.22.3 (`.node-version` and `.nvmrc`)
- pnpm 10.13.1 through Corepack
- PostgreSQL 16 or later

Do not reuse preview or production databases, OAuth clients, secrets, or object
stores for local work.

## Configure

```bash
corepack enable
cp .env.example .env.local
pnpm install --frozen-lockfile
```

Replace example values in `.env.local`. `DATABASE_URL` is the pooled/runtime
connection and `DIRECT_DATABASE_URL` is the direct migration connection. A
local PostgreSQL installation may use the same direct URL for both. Prisma,
seed, initial-bootstrap, and auth-schema commands keep existing process
environment values first, then load `.env.local`, then `.env`.

`pnpm db:validate`, `pnpm db:generate`, and
`pnpm auth:schema:generate` do not connect to PostgreSQL and require no direct
database credential. Migration commands fail closed unless
`DIRECT_DATABASE_URL` is explicitly available. Seed and initial bootstrap use
`DATABASE_URL` first and fall back to `DIRECT_DATABASE_URL` only when the
runtime URL is absent.

For live local Google sign-in, configure exactly this authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

`BETTER_AUTH_URL` must exactly equal `APP_BASE_URL`; this single-origin
monolith rejects a foreign or downgraded callback origin.

Use the organization-approved Workspace domain. An email suffix is not treated
as identity evidence: the callback must carry Google’s verified `hd` and
`email_verified` claims, the identity must match a pending invitation, and a
local active principal must exist before a session can be issued.

## Prepare the database

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Use `pnpm db:migrate:dev -- --name <name>` only when intentionally authoring a
new development migration. Review generated SQL; application invariants that
Prisma cannot express must be represented deliberately in the migration.

## Run and check

```bash
pnpm dev
pnpm check
```

The public scaffold is at `/`; administration is at `/admin`. A user cannot be
created merely by visiting the sign-in page. Normal onboarding begins with an
authorized administrator creating an invitation and sending its one-time URL
through an approved channel.

## Initial Super Admin

The initial Super Admin is established by an explicit operator command
after the role seed:

```bash
BOOTSTRAP_SUPER_ADMIN_EMAIL=operator@example.org \
BOOTSTRAP_CONFIRMATION='CREATE INITIAL SUPER ADMIN' \
pnpm admin:bootstrap-super-admin
```

The script prints the invitation URL once. It stores only a digest, refuses to
run after any Super Admin holder exists, and cannot be replaced by the normal
invitation UI. It marks stale pending bootstrap invitations expired before
checking for a live pending invitation, so an operator may safely retry after
expiry. A current holder may promote another active administrator through the
fresh-authenticated, reasoned, audited application service; promotion adds a
holder and does not replace the existing one. A holder cannot be suspended
until a separately reviewed demotion or recovery procedure explicitly removes
the Super Admin grant. That procedure is not supplied by this slice. Treat the
printed URL as a secret.

## Disposable test authentication

Never use the Playwright test-session route as a manual shortcut. It is
documented in [test-auth.md](../testing/test-auth.md) and refuses deployment,
preview, production, non-loopback, wrong-origin, and missing-secret requests.
Playwright creates a cryptographically random secret for each run unless a
private secret is explicitly injected. Run integration or end-to-end tests only
against a disposable PostgreSQL target with the repository’s explicit
destructive-test opt-in; the guard must pass before migrations, seed, or tests
may mutate that database.
