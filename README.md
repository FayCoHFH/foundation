# Fayette County Habitat for Humanity Digital Platform

This repository contains the accepted product and architecture foundation plus
the executable Slice 1 application scaffold for Fayette County Habitat for
Humanity. The implementation is a modular Next.js application with a public
shell, a protected administration boundary, invitation-only Google Workspace
authentication, local capability authorization, PostgreSQL/Prisma persistence,
an append-only audit foundation, publishing contracts, and provider-neutral
storage ports.

The public shell deliberately contains no migrated or invented production
content. It is marked `noindex` until verified content and an approved launch
replace the scaffold.

Current public routes include `/`, `/stories/[slug]`, `/news`, `/news/[slug]`,
`/projects`, `/projects/[slug]`, `/campaigns`, and `/campaigns/[slug]`; authorized curation is available at
`/admin/communications`, `/admin/communications/queue`, and
`/admin/communications/homepage`, and the capability-protected Story
Submission inbox at `/admin/communications/submissions`, including the nested
media review route at `/admin/communications/submissions/[id]/media/[mediaId]`.
The public `/share-your-story` intake is implemented but gated and unavailable
by default. The C4 placement surface is limited to its implemented Story/News
keys and does not add Project/Campaign placements.

The submission inbox is an authorized confidential review surface; the public
form remains disabled until its approved configuration is explicitly enabled.
Browser and accessibility evidence
is recorded in the [C6B-2B validation record](docs/development/c6b2b-public-story-submission-inbox-validation.md),
with policy alignment and controlled spam restoration documented in the
[C6B-2C record](docs/development/c6b2c-submission-policy-alignment.md).

## Start locally

Requirements: Node.js 22.22.3, pnpm 10.13.1, and PostgreSQL 16 or later.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:migrate:status
pnpm db:seed
pnpm dev
```

Set the database URLs and development-only secrets in `.env.local` before
running migrations. `DIRECT_DATABASE_URL` must include an explicit database
role, and `SHADOW_DATABASE_URL` is a separate disposable database for migration
authoring and drift checks. Google sign-in additionally requires an approved Workspace
domain and a Google OAuth client whose callback is
`http://localhost:3000/api/auth/callback/google`. See the
[local setup guide](docs/development/local-setup.md) and
[authentication spike record](docs/development/auth-spike.md).

The public Story Submission intake is disabled by default. Its
server-only `PUBLIC_STORY_SUBMISSIONS_ENABLED`, dedicated secret, and approved
privacy-notice version must be configured before an isolated test or approved
deployment may enable the boundary. See the
[C6B-1B intake-security record](docs/development/c6b1b-public-story-intake-security.md).

Projects administration is available at `/admin/projects` for authorized
Project authors, reviewers, and publishers. See the [Projects P2 UI record](docs/development/p2-projects-ui.md).

Campaigns administration is available at `/admin/campaigns` for authorized
Campaign authors, reviewers, approvers, and publishers. Campaign Donate and
Volunteer actions are outbound HTTPS handoffs; DonorView remains the current
external system of record for donation and volunteer management. See the
[Campaigns C2 UI record](docs/development/campaigns-c2-ui.md).

DonorView handoff destinations are governed at `/admin/engagement` by
authorized administrators. The public shell exposes only active, verified
canonical Donate and Volunteer destinations; no local donation or volunteer
records are created. See the [G1 handoff record](docs/development/g1-donorview-handoff.md).

The public Giving and Volunteer experience is available at `/give` and
`/volunteer`. These pages provide local Habitat context and hand off donation
and volunteer execution to the currently verified DonorView destinations. The
homepage also presents current Projects, Campaigns, and ways to help. See the
[G2 public experience record](docs/development/g2-public-giving-volunteer-experience.md).

## Validate the foundation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

The integration and end-to-end suites need an isolated migrated PostgreSQL
database whose name matches the documented disposable-test allowlist, plus the
exact `ALLOW_DESTRUCTIVE_TEST_DATABASE=true` opt-in. The end-to-end suite uses a
narrowly guarded test-session endpoint; that endpoint refuses to operate outside
local/CI `APP_ENV=test` and is never a production authentication path. See
[testing](docs/testing/README.md). Run the enabled Share Your Story and
submission-media admin suites only with separate disposable test configuration;
the repository/default browser run keeps public intake disabled.

## Foundation map

- [Slice 1 implementation record](docs/development/slice-1-foundation.md)
- [C1 Story persistence record](docs/development/c1-story-persistence.md)
- [C2 Story publication release record](docs/development/c2-story-publication-release.md)
- [Public Communications Experience](docs/design/public-communications-experience.md)
- [Product vision](docs/product/vision.md),
  [specification](docs/product/specification.md), and
  [information architecture](docs/product/information-architecture.md)
- [Architecture](docs/architecture/architecture.md),
  [Communications architecture](docs/architecture/communications.md),
  [domain model](docs/architecture/domain-model.md), and
  [permissions](docs/architecture/permissions.md)
- [Design principles](docs/design/principles.md),
  [content design](docs/design/content-design.md), and
  [accessibility standard](docs/design/accessibility.md)
- [Threat model](docs/security/threat-model.md),
  [Slice 1 security review](docs/security/slice-1-security-review.md), and
  [data classification/retention](docs/privacy/data-classification-retention.md)
- [Architecture decision records](docs/adr/README.md)
- [Legacy migration ledgers](docs/migration/README.md)
- [Decision register](docs/foundation/decision-register.md),
  [delivery roadmap](docs/foundation/implementation-roadmap.md), and
  [open gates](docs/foundation/open-gates.md)

## Product and integration boundaries

The Wix site is migration evidence, not the new product blueprint. DonorView
remains the system of record for donor, gift, pledge, registration, and
volunteer records where its supported account capabilities fit. Stripe remains
the accepted merchandise checkout provider. This slice does not introduce a
competing donor ledger, commerce implementation, content-management feature, or
private applicant/grants system.

Read [AGENTS.md](AGENTS.md) before changing the repository. Consequential
technical decisions belong in ADRs, while product requirements and data
ownership remain in their dedicated documents.
