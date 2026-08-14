# ADR-0001: Use a modular Next.js monolith

- Status: Accepted
- Date: 2026-08-14

## Context

The platform combines a public website, a role-based administrative application, editorial workflows, projects/programs, Campaigns/Events, ReStore, commerce, impact/grants, and adapters to DonorView, Google, Stripe, and object storage. The organization and expected engineering team do not need independently scaled services, while strong internal boundaries are essential to prevent a generic CMS and external-system coupling.

## Decision

Build one TypeScript application using Next.js App Router, deployed to Vercel, backed by one primary PostgreSQL database (Neon preferred) and Prisma. Organize it as domain modules with explicit use cases, repositories, and provider ports. Communications, Projects/Programs, Community Engagement, Development, Leadership/Governance, Operations, and Platform share a deployment but do not bypass one another's invariants.

Transport code is thin. Server-side use cases enforce capability and lifecycle rules. External SDKs live in adapters. Reliable side effects use an outbox/equivalent when loss would make state inconsistent.

## Consequences

- One build, deployment, observability surface, transaction boundary, and local development workflow reduce cost and operating burden.
- Cross-domain transactions are possible without distributed coordination.
- Module rules and tests must prevent the monolith from becoming tightly coupled.
- Scheduled/background work must be idempotent and may later move behind a queue without changing domain contracts.
- A module can be extracted only after measured scale, security, team ownership, or availability requirements justify the cost and an ADR defines the migration.

## Rejected alternatives

- **Microservices/event bus now:** disproportionate deployment, security, data-consistency, and support burden.
- **Wix-shaped page/CMS model:** legacy structures are migration evidence, not product architecture.
- **Independent CMS engines per content type:** duplicates workflow and weakens consistency.
- **External headless CMS as the domain owner:** conflicts with application-owned workflow, authorization, relationships, and public/private projections.

## Validation

The scaffold must demonstrate domain import rules, server-only data access, a production build on the target Vercel runtime, PostgreSQL/Prisma connectivity, and an adapter seam for external systems. Neon connection/region/backups are confirmed before production, not used to reopen the modular-monolith decision.
