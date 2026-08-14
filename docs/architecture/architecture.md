# Platform architecture

Status: Accepted foundation baseline
Last reviewed: 2026-08-14

## Purpose

This document defines the architecture boundary for the Fayette County Habitat for Humanity digital platform. It is a greenfield public website and administrative platform, not a port of the Wix site. Legacy pages influence only factual research, selected content and media migration, and redirect/SEO preservation. They do not define the new navigation, taxonomy, domains, workflows, URLs, or code structure.

## Architectural baseline

The platform is a modular full-stack application:

| Concern | Baseline |
| --- | --- |
| Web runtime | Next.js App Router with TypeScript |
| Deployment | Vercel |
| Persistence | PostgreSQL; Neon is the preferred managed host |
| Data access | Prisma, unless the scaffold-stage compatibility checks reveal a material blocker |
| UI | Tailwind CSS and shadcn/ui primitives; neither dictates the visual identity |
| Authentication | Better Auth with Google OpenID Connect and database-backed sessions |
| Authorization | Application-owned capability grants checked server-side |
| Media and documents | Object storage behind an application adapter, with separate public and private stores |
| Commerce | Stripe-hosted Checkout for merchandise |
| Constituents, donations, and volunteer operations | DonorView, through an anti-corruption adapter |
| Rich text | Schema-versioned Tiptap/ProseMirror JSON, rendered through an allowlisted server renderer |
| End-to-end testing | Playwright |

The system remains one deployable unit and one primary relational database until measured operational needs justify another deployment boundary. Internal modules expose use cases and typed ports; they do not reach through one another's tables from route handlers.

## System context

Four kinds of actors or systems interact with the platform:

1. Public visitors read published material, discover programs and projects, register or volunteer through approved DonorView destinations, donate through an approved donation destination, subscribe to communications, and buy merchandise through Stripe Checkout.
2. Authorized staff use the administrative application. Google establishes identity; the local access model determines what each identity may do.
3. External systems provide bounded capabilities: Google for identity, DonorView for constituent/donor/volunteer records, Stripe for commerce payments, and object storage for file bytes.
4. Scheduled invocations run idempotent publication and maintenance commands. The scheduling provider is an infrastructure detail; it may not bypass the same validation, audit, and state-transition rules used by staff actions.

## Domain boundaries

The following map describes product ownership, not final navigation or directory names.

### Communications

- Stories: long-form, evergreen, narrative and rich-media editorial work.
- News: timely, concise announcements with optional expiration and archive behavior.
- Newsletter: authored newsletter content and coordination; DonorView owns subscriber consent, suppression, and mailing-list membership under the accepted current boundary, while the configured sending workflow still requires account verification.
- Media, authors, categories, publication workflow, publication queue, and the Communications Dashboard.
- Homepage and other curated placements.

Stories and News use shared revision, authorship, review, approval, scheduling, snapshot, SEO, relationship, and audit infrastructure. They retain typed records and typed validation. The design is neither a generic CMS blob nor two duplicate editorial engines.

The Communications Dashboard is a read model over authoritative domain state. It may summarize drafts, reviews, approvals, scheduled and recent publications, active placements, expiring News, accessibility issues, broken links, and newsletter work. Dashboard widgets are not separate sources of truth.

### Projects and programs

- Programs, Projects, partners, attributable impact, public grant acknowledgment, and project media.
- Public relationships to Stories, News, Campaigns, Events, and Grants.
- Participant presentation only through explicit, consented public projections.

### Community engagement

- Public event marketing and Habitat-owned Campaign narratives.
- Public calls to volunteer and approved external registration destinations.
- DonorView owns volunteer applications, waivers, registrations, attendance, and hours unless a later supported integration changes the mechanism, not the ownership.

### Development

- Donation destination selection, DonorView integration, public Grant Impact, and a future private Grant Administration module.
- A Habitat Campaign is a local storytelling and fundraising aggregate. It is not the same object as a DonorView campaign, appeal, fund, or designation.

### Leadership and governance

- Executive Director, public staff/person profiles, Board positions and memberships, committees, and memberships.
- Administrative users are separate identities from public Person records, even when they refer to the same human.

### Operations

- ReStore public content, merchandise catalog, local artist relationships, local order/fulfillment state, Users & Access, Site Settings, and Audit Log.

### Future sensitive casework

Homeowner and assistance applications are a deliberately deferred private domain. Applicant, household, eligibility, supporting documents, internal notes, and case workflow must be isolated from public Projects, Programs, Stories, and News. No Social Security numbers will be collected. A later design must define a dedicated private module, private object store, restricted capabilities, retention rules, and an explicit consented projection path before implementation.

Private Grant Administration is also deferred. Internal grant applications, agreements, budgets, reports, deadlines, and notes are confidential records. Public grant acknowledgment and impact are deliberate projections, never automatic views over private records.

## Runtime and dependency rules

- App Router route handlers and server actions are transport adapters. They authenticate, parse input, call a domain use case, and shape a response.
- Domain use cases enforce transitions and capabilities. UI visibility is never an authorization control.
- Database access is centralized behind module repositories or services. Public queries cannot fetch draft or private tables and filter them after the fact; they read an eligible publication snapshot or an explicit public projection.
- External SDKs are contained in integration adapters. Domain code consumes provider-neutral values and ports.
- Cross-domain references use stable local identifiers and intentional relationship services. A module may not duplicate another module's authoritative record merely for convenience.
- Outbound side effects use an outbox or equivalent durable, idempotent handoff when loss would create an inconsistent payment, publication, or integration state.
- Inbound external events are signature-verified where the provider supports signatures, stored with the provider event identifier, and processed idempotently.

## Publication architecture

Every publishable Story or News item has a typed aggregate and participates in shared publication infrastructure:

1. An authoring save produces a new immutable working revision; later saves produce successors rather than mutating persisted history.
2. Submission designates one exact revision for review; subsequent edits create another revision.
3. Approval records the exact revision identifier and a canonical hash covering the structured document, publication metadata, authors, relationships, SEO, and referenced media.
4. Scheduling references the approved hash. Any material change invalidates approval and returns the work to the appropriate review state.
5. Publishing creates an immutable publication snapshot and atomically makes it the active public snapshot.
6. Public reads resolve only an active snapshot that satisfies the shared scheduled-publication invariant and any typed eligibility rule, including an approved News expiration/archive policy.
7. Withdrawal, expiration, archival, or superseding publication preserves history and audit records; it never silently deletes the item.

News adds typed optional expiration/archive behavior and placement eligibility. Gate C decides whether urgency, pinning, or priority exists and what it means. Story adds typed narrative and long-form presentation concerns. A future publication type must adopt the shared contract and add its own invariants rather than expanding a universal content record indefinitely.

`FeaturePlacement` is preserved as the direction for homepage Featured Story, Featured News, Campaign, Project, Event, ReStore, Shop, and future slots. A placement names a controlled slot, points to an eligible typed subject, and may have an active window and ordering. A permanent `isFeatured` flag on every domain record is rejected. The first implementation should add only placements required by an approved design.

Shared scheduled-publication metadata and typed News expiration data should remain queryable for a future Communications Calendar. No calendar-specific table is required now. Cross-domain relationships should allow a future Communications or Story Package without selecting its name or aggregate during foundation work.

## Public, administrative, and private read paths

| Read path | Permitted source |
| --- | --- |
| Public Story/News | Active immutable publication snapshot only |
| Public project/program/impact/grant | Explicit public fields or a public projection |
| Admin authoring | Current typed aggregate and revisions, capability filtered |
| Communications Dashboard | Derived query/read model over publication and quality state |
| Private grant administration | Future restricted private module only |
| Applicant/casework | Future restricted private module only |
| Donor/gift/volunteer detail | DonorView; do not mirror by default |

Public cache invalidation occurs after the database transaction that activates a snapshot or placement. A cache miss or stale CDN response may delay visibility, but it must never expose an unapproved revision.

## Integration boundaries

### DonorView

DonorView is the system of record for constituents, donors, gifts, pledges, recurring gifts, receipts, newsletter subscribers/consent/suppression and mailing-list membership, volunteer applications and waivers, volunteer registrations, attendance, hours, and event registrants. The initial integration is a local reference to an administrator-configured hosted URL or approved embed. Public evidence does not establish an API, webhooks, or Zapier integration; those mechanisms remain vendor/account-confirmation questions. No undocumented endpoint may be reverse-engineered.

### Stripe

Stripe owns payment method and payment-network data. The application owns products, variants, orders, line-item snapshots, and fulfillment. Order fulfillment follows verified webhooks and idempotent reconciliation, never a browser redirect alone. Stripe is not the default donation system while DonorView can provide the required designated donation flow.

### Google

Google proves identity using OpenID Connect. The local database owns invitations, access state, roles, capabilities, suspension, and audit. A valid Google login without an active local authorization record receives no administrative access.

### Object storage

Published media bytes live in a public store only after validation and publication eligibility. Draft assets and all confidential documents live in a private store and are streamed through an authenticated, authorized server path. Object keys are opaque and immutable; database metadata governs classification and lifecycle.

## Security and operability baseline

- Deny by default, enforce capabilities at the use-case/data-access boundary, and audit sensitive reads and mutations.
- Validate all rich-text JSON and file uploads against explicit allowlists.
- Treat authorization, publication, upload, integration-secret, payment, and private-document actions as high-risk test paths.
- Keep secrets in managed environment secret storage; never place secrets, tokens, or private URLs in content, source control, logs, or client bundles.
- Use structured logs with correlation identifiers and redaction. Select an error/telemetry vendor at scaffolding only if operational need and budget support it.
- Back up PostgreSQL and document restore drills before production launch. Object retention and recovery must match the data classification policy.
- Keep framework, authentication, editor, image-processing, and webhook libraries on supported security releases.

## Explicit non-goals for the foundation

- No microservices, event bus, headless-CMS product, or separate CMS per publication type.
- No donor, volunteer, payment-card, accounting, or email-marketing reimplementation.
- No applicant intake or private grant-management implementation.
- No final public navigation, homepage composition, newsletter delivery configuration, editorial calendar, or Communications Package model.
- No legacy Wix-derived domain or URL architecture.

## Deferred checks that do not block architecture

- Confirm Neon region, plan, connection strategy, backups, and recovery targets before production.
- Confirm Vercel Blob or another object provider against cost, processing, retention, private-delivery, and data-processing requirements. The public/private adapter decision remains valid regardless of vendor.
- Execute the authentication spike defined in ADR-0002 against the scaffold's exact Next.js, Better Auth, Prisma, and PostgreSQL versions.
- Confirm DonorView account capabilities and the targeted donation-destination workflow.
- Select image/video processing and malware-scanning services before accepting relevant upload types.

## Primary references

- [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Vercel Blob public and private storage](https://vercel.com/docs/vercel-blob)
- [Stripe Checkout](https://docs.stripe.com/payments/checkout)
- [Tiptap schema model](https://tiptap.dev/docs/editor/core-concepts/schema)
