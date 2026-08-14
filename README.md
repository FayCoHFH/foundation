# Fayette County Habitat for Humanity Digital Platform

This repository contains the approved foundation for a greenfield public website and administrative platform for Fayette County Habitat for Humanity. The decision runway and Communications Domain Product & Architecture Review are complete: implementation-ready documentation and migration evidence exist, but no application has been scaffolded.

## Product direction

The platform will support public communication, Stories, News, programs, projects, campaigns, events, leadership and governance, ReStore, merchandise, impact, and public grant acknowledgment. A capability-secured administration experience will manage Habitat-owned content and workflows.

Communications is a first-class product domain. Stories and News retain distinct editorial meaning while sharing revision, approval, scheduling, publication-snapshot, authorship, SEO, and media infrastructure. The homepage is intended to be curated by authorized staff rather than assembled solely from the newest rows.

DonorView remains the system of record for constituents, donors, gifts, pledges, recurring giving, donation receipts, volunteer applications, registrations, attendance, and hours where its supported capabilities fit. Stripe is approved for merchandise commerce. A custom Stripe donation flow is only an optional future path and must not create a competing gift ledger.

## Legacy independence

The current Wix site is migration evidence, not a product blueprint. It may supply verified facts, selected historical content, media, and URL/SEO history. It does not define the new navigation, information architecture, taxonomy, domain model, workflows, visual design, administration, routes, or feature set.

## Foundation map

- [Product vision](docs/product/vision.md), [specification](docs/product/specification.md), and [conceptual information architecture](docs/product/information-architecture.md)
- [Communications review runway](docs/product/communications-review-runway.md) and [content verification backlog](docs/product/content-verification.md)
- [Architecture](docs/architecture/architecture.md), [Communications architecture](docs/architecture/communications.md), [domain model](docs/architecture/domain-model.md), [data ownership](docs/architecture/data-ownership.md), and [permissions](docs/architecture/permissions.md)
- [Design principles](docs/design/principles.md), [content design](docs/design/content-design.md), and [accessibility](docs/design/accessibility.md)
- [DonorView](docs/integrations/donorview.md), [Stripe](docs/integrations/stripe.md), and [Google](docs/integrations/google.md) boundaries
- [Threat model](docs/security/threat-model.md) and [data classification/retention](docs/privacy/data-classification-retention.md)
- [Architecture decision records](docs/adr/README.md)
- [Legacy migration ledgers](docs/migration/README.md)
- [Accepted decision register](docs/foundation/decision-register.md), [delivery roadmap](docs/foundation/implementation-roadmap.md), and [open gates](docs/foundation/open-gates.md)

## Current phase boundary

Gate C, the **Communications Domain Product & Architecture Review**, is complete. Its typed models, lifecycle invariants, publication workflow, curated placements, administrative work surfaces, privacy boundaries, and V1/later split are recorded in the [accepted Communications architecture](docs/architecture/communications.md).

The recommended next assignment is **Slice 1 — Application Foundation and Scaffold**. Do not begin it or add a package manifest, framework files, dependency lockfile, Prisma schema, migrations, application routes, or components until Sven explicitly authorizes that implementation assignment.

## Working in this repository

Read [AGENTS.md](AGENTS.md) before making changes. ADRs record consequential technical decisions; product requirements and data-ownership boundaries live in their dedicated documents. Migration ledgers protect history and search equity but never define the new product.

At this revision, repository validation is documentation-only and requires no installed application toolchain.
