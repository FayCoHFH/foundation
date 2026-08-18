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

The Communications Dashboard is a read model over authoritative domain state. Its four V1 modules are **Needs Attention**, **Upcoming**, **Current Curation**, and **Recent Activity**; publication/media blockers and expiring News roll into the appropriate module instead of creating vanity tiles. Newsletter readiness appears only when Edition authoring is enabled. Dashboard widgets are not separate sources of truth.

The implementation-ready Communications decisions are maintained in [Communications architecture](communications.md). That document owns detailed field, UI, V1-versus-later, workflow-policy, queue, dashboard, and public-IA descriptions; this document records the cross-platform invariants below.

### Projects and programs

- Programs, Projects, partners, attributable impact, public grant acknowledgment, and project media.
- Public relationships to Stories, News, Campaigns, Events, and Grants.
- Participant presentation only through explicit, consented public projections.

### Community engagement

- Public event marketing and Habitat-owned Campaign narratives.
- Public calls to volunteer and approved external registration destinations.
- DonorView owns volunteer applications, waivers, registrations, attendance, and hours unless a later supported integration changes the mechanism, not the ownership.

Campaigns are typed Habitat-owned public engagement initiatives. A Campaign is
not a Project, Story, News item, DonorView appeal, payment transaction, donor
record, volunteer schedule, or accounting ledger. It uses the shared Publication
revision/approval/release/snapshot kernel, has an independent factual status
and optional public timing, and may have ordered revision-scoped relationships
to zero or more Projects. Editorial goal/progress values, when present, are
integer-cent display facts rather than authoritative financial totals.

C2 adds only a bounded Campaign action configuration: reviewed HTTPS links with
`DONATE`, `VOLUNTEER`, or `LEARN_MORE` intent and public labels. These links are
plain outbound handoffs; the platform does not collect donor or volunteer data,
embed DonorView, process payments, or synchronize provider records.

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

Every publishable Story, News item, Project, or Campaign has a typed aggregate and participates in shared publication infrastructure:

1. An authoring save produces a new immutable working revision; later saves produce successors rather than mutating persisted history.
2. Submission designates one exact revision for review; subsequent edits create another revision.
3. Approval records the exact revision identifier and a canonical hash covering the structured document, publication metadata, authors, relationships, SEO, and referenced media.
4. Scheduling references the approved hash. Any material change invalidates approval and returns the work to the appropriate review state.
5. Publishing creates an immutable publication snapshot and atomically makes it the active public snapshot.
6. Public reads resolve only an active snapshot that satisfies the shared scheduled-publication invariant and typed eligibility rules. They never fall back to a working record or a later mutable revision.
7. Withdrawal, News expiration, shared archive disposition, or a superseding release preserves history and audit records; it never silently deletes the item.

The publishing model has four deliberately separate dimensions. The candidate-revision workflow is `DRAFT` -> `IN_REVIEW` -> `CHANGES_REQUESTED` or `PENDING_APPROVAL` -> `APPROVED`; submitting is a transition/event that selects the exact candidate, not a durable workflow state. The release/snapshot lifecycle schedules an approved hash and creates a `PUBLISHED` snapshot. A published snapshot can later be `WITHDRAWN` or `SUPERSEDED` in public-release history without changing the candidate workflow. Story and News share the `ACTIVE`/`ARCHIVED` discovery disposition, while News alone derives `CURRENT`/`EXPIRED` availability from its optional relevance end. A material successor revision after submission or approval invalidates that approval and must complete the workflow again, while an active snapshot may coexist with the later draft.

Story and News share an authorized, reversible discovery disposition of `ACTIVE` or `ARCHIVED`; archive removes ordinary discovery/placement while preserving direct historical snapshot behavior. News alone adds an optional relevance end time and availability of `CURRENT` or derived `EXPIRED`. Reaching the end time derives `EXPIRED`, makes News ineligible for current/featured placements, and gives public presentation an explicit “no longer current” treatment; it does not archive, withdraw, or remove snapshots/audit history. Withdrawal removes a public release promptly and needs a reason. Story adds typed narrative and long-form presentation concerns and has no expiration semantics. Urgency, pinning, and editorial priority are not V1 fields; latest is a derived date order and featured is a placement. A future publication type must adopt the shared contract and add its own invariants rather than expanding a universal content record indefinitely.

Curated content uses code-owned `PlacementDefinition` plus persistent `ContentPlacement`. A definition owns a stable slot key, cardinality/window rules, fallback, and the closed set of target types it permits. C4 implements four Story/News keys—`HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`—with a real foreign key to shared `Publication` identity; Project/Campaign keys remain reserved future extensions. A placement owns its optional half-open interval, cancellation/version/audit history, and one target selected from the definition’s allowed set, rather than an unconstrained `target_type`/`target_id` pair. Definitions are singletons with no priority or ordering. Placement validation checks both the definition and the target’s current public eligibility. A permanent `isFeatured` flag on domain records is rejected. There is no page builder.

Shared scheduled-publication metadata, News relevance end times, and Newsletter planned/send times remain queryable for a future Communications Calendar. That calendar is a derived view of authoritative dates, not a second scheduler; drag-to-reschedule and a calendar aggregate are deferred. Typed relationships to Projects, Programs, Campaigns, Events, Grants, Partners, and People supply the grouping needed now. A Communications Package is deferred until a distinct cross-anchor grouping workflow is demonstrated.

## Communications supporting boundaries

- `AuthorProfile` is a Communications-owned public byline profile. It may optionally link to a public `Person` and/or `AdminUser`, but neither link is required or grants access. It supports organizational and limited-identity bylines, preserves historic credit, and lets contributors exist without administrative accounts.
- `EditorialCategory` is a controlled, flat, Communications-owned vocabulary. Categories declare the publication kinds they may classify, have lifecycle/merge-retire governance, and use an explicit revision/snapshot join. Generic tags are not a V1 capability; typed domain relationships answer most “about this Project/Program/etc.” needs.
- `SiteNotice` is a small Communications aggregate for time-bounded operational notices, not a News shortcut: bounded plain-text title/message, INFO/IMPORTANT/URGENT severity, code-owned SITE_WIDE/HOMEPAGE target area, optional safe CTA, optimistic version, active window, and audit. It automatically ceases public presentation at its end time and never becomes a generic alert feed.
- Raw `PublicStorySubmission` intake is isolated from `Story` drafts. It has its own restricted inbox, anti-abuse/consent/retention rules, and private submission media. An editor explicitly accepts/converts it into a new Story draft; reject/archive does not create public or editorial content. Public News submission is out of scope for V1.
- `NewsletterEdition` and ordered typed `NewsletterBlock` records own issue-specific introduction, curation, and planned timing. Blocks reference canonical approved/published domain material where possible rather than duplicate it. Subscriber membership, consent, and suppression remain in DonorView; delivery is behind a provider-neutral adapter and no sending provider, delivery execution, or web archive is selected by this decision.
- `MediaAsset` owns immutable asset, provenance, rights/consent, scan/processing, and access-class facts. `MediaUsage` owns contextual role, order/crop, caption, and alternative text. Only ready, cleared assets with contextually complete public usage can enter a snapshot; snapshotting freezes the asset/usage version actually approved.

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
- No generic tags, public News tips, generic page builder, calendar aggregate/drag-rescheduling, newsletter subscriber database, newsletter-delivery provider commitment, or Communications Package model.
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
