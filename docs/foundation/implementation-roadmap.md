# Delivery roadmap

Status: **Accepted as sequencing guidance**
Last reviewed: 2026-08-14

This roadmap organizes independently testable outcomes. It is not a promise that conceptual product groups become routes or code directories. Every slice must preserve the data-ownership, security, privacy, accessibility, and legacy-independence rules in this foundation.

## Gate C — Communications Domain Product & Architecture Review

This is the next assignment and occurs before Slice 1. It is a planning gate, not an implementation slice.

- **Scope:** Stories/Journal; News; Featured News and other curated placements; Communications Dashboard; publication queue; workflow, approvals, scheduling, and expiration; homepage curation; Newsletter; authors/categories/tags; media and related-domain content; editorial calendar direction; possible Story/Communications Packages.
- **Output:** agreed vocabulary, lifecycle invariants, main staff journeys, dashboard decisions, MVP versus later scope, relationship rules, and refinements to the publication/placement ADRs.
- **Non-goal:** no application scaffold, schema, migration, route, or component.
- **Acceptance:** remaining Communications choices are precise enough that Slice 2 does not have to invent product policy.
- **Principal risk:** prematurely generalizing a universal CMS or, conversely, duplicating publishing engines.

## Slice 0 — Decision runway

- **Scope:** product and architecture foundation, ADRs, data ownership, permissions, threat/privacy boundaries, vendor research, migration inventory, content verification, and operating contract.
- **Dependencies:** stakeholder decisions and primary-source research.
- **Acceptance:** the foundation is internally consistent; all known legacy URLs have dispositions; consequential decisions are Accepted or precisely Proposed; no application scaffold exists; documentation validation passes; initial commit exists.
- **Model/parallelism:** Sol for consequential synthesis/final review; Terra for bounded documentation; route/vendor inventories may proceed in parallel under exclusive ownership.
- **Principal risk:** treating an undocumented vendor capability or legacy convention as a product fact.

## Slice 1 — Platform shell

- **Scope:** supported Node/Next.js/TypeScript baseline, dependency locking, environment validation, Tailwind and accessible UI primitives, public/admin shells, error and not-found handling, metadata/robots baseline, CI, preview deployment, and Playwright smoke coverage.
- **Dependencies:** Slice 0 and Gate C; exact supported package versions selected at execution time; infrastructure/environment ownership identified.
- **Acceptance:** reproducible install; build, type, lint, unit, and smoke tests pass; keyboard-visible shells work at mobile/desktop zoom; previews cannot reach production data or secrets; no domain behavior is faked.
- **Model/parallelism:** Terra leads; CI/test and visual/accessibility shell work can run in parallel after configuration ownership is assigned.
- **Principal risk:** dependency or component-library sprawl before the product system exists.

## Slice 2 — Persistence and publishing kernel

- **Scope:** PostgreSQL/Prisma migration discipline, modular data-access boundaries, audit primitives, outbox/inbox primitives where justified, typed authoring revisions, exact-hash approvals, immutable publication snapshots, idempotent scheduling/withdrawal/rollback, and the minimum placement foundation approved by Gate C.
- **Dependencies:** Slice 1 and Gate C workflow invariants.
- **Acceptance:** fresh and upgrade migrations pass against real PostgreSQL; draft edits never appear through public queries; changed content invalidates approval; publish/schedule/withdraw/rollback operations are concurrent-safe and idempotent; public snapshots validate against versioned schemas.
- **Model/parallelism:** Sol coordinates schema and concurrency; one migration owner; domain reviewers and test authors may work in parallel without editing the schema simultaneously.
- **Principal risk:** a generic content abstraction erasing Story/News rules or public queries falling back to mutable rows.

## Slice 3 — Identity, capability authorization, and admin shell

- **Scope:** Google authentication adapter, invitation-gated admin enrollment, revocable database-backed sessions, users/roles/capabilities, suspension/recovery, protected admin navigation, and audit history.
- **Dependencies:** Slices 1–2 and completion of the auth scaffold spike in [open-gates.md](open-gates.md).
- **Acceptance:** direct unauthorized Server Action/route/storage requests fail; an email-domain match alone grants nothing; invitation replay/expiry/wrong-email cases fail; role removal and suspension revoke effective access; normal self-approval fails; override and access changes are audited.
- **Model/parallelism:** Sol leads security-critical flows and adversarial review; Terra can build admin presentation after authorization contracts stabilize.
- **Principal risk:** confusing authentication with authorization or trusting UI/middleware as enforcement.

## Slice 4 — Communications MVP

- **Scope:** public Stories and News experiences; authoring revisions; authors/categories; media relationships; submit/review/approve/schedule/publish/expire/archive/withdraw behaviors selected at Gate C; Featured Story/News placement; publication queue; useful first Communications Dashboard; preview and SEO.
- **Dependencies:** Slices 2–3; approved editorial roles, vocabulary, placement scope, and dashboard MVP.
- **Acceptance:** Stories and News have typed validation/presentation while sharing the kernel; a published version can coexist with a later draft; normal authors cannot self-approve; scheduled and expiring News recover after a missed job; featured placements are permissioned and audited; media rights and contextual alt text gate publication; public and admin journeys pass Playwright and accessibility review.
- **Model/parallelism:** Terra leads bounded domain/UI work; Sol reviews workflow, scheduling, and placement concurrency; public Story, public News, and admin UI can proceed in parallel after contracts freeze.
- **Principal risk:** duplicated editorial logic, stale approvals, accidental draft exposure, or an overbuilt page-builder/calendar/package system.

## Slice 5 — Organizational proof: pages, people, programs, projects, and impact

- **Scope:** verified flexible site pages; leadership/governance presentation; Programs; Projects; Partners; attributable impact observations; relevant relationships to Communications; approved navigation and redirects required for these areas.
- **Dependencies:** Slices 1–4; verified content can be added incrementally and is not required to create the structures.
- **Acceptance:** public data transfer objects exclude private participant/applicant data; metrics show source/methodology/period or as-of date; contextual media rights apply; project history can be represented without copying the legacy IA; unverified claims remain draft/unavailable.
- **Model/parallelism:** Terra leads domain delivery; content migration and privacy/accessibility review can run in parallel under separate ownership.
- **Principal risk:** leaking beneficiary/address details or presenting unattributed vanity totals.

## Slice 6 — Campaigns, events, and DonorView handoffs

- **Scope:** Habitat-owned Campaign and Event marketing records, editions/updates/relationships, DonorView-hosted donation/volunteer/registration handoffs, provider-neutral designation references, graceful aggregate projections only where supported, and reconciliation visibility for any approved integration.
- **Dependencies:** Slices 2–5; DonorView account/vendor questionnaire answered for every integration mechanism used; campaign donation-destination workflow demonstrated.
- **Acceptance:** DonorView remains gift/constituent/volunteer system of record; no broad constituent mirror exists; handoffs are accessible and attributable; inactive vendor forms cannot be promoted; any imports/events are idempotent, auditable, redacted, and recoverable; campaign totals show provenance and freshness.
- **Model/parallelism:** Sol owns integration contracts and failure semantics; Terra can build public campaign/event experiences against provider-neutral ports.
- **Principal risk:** assuming API/webhook support or creating competing gift and registration ledgers.

## Slice 7 — ReStore

- **Scope:** mission-forward ReStore experience, verified location/hours, donation guidance, calls to action, related Stories/News/Events, and staff-managed operational content. Detailed requirements are established immediately before the slice.
- **Dependencies:** public/publishing/media foundations and verified ReStore facts.
- **Acceptance:** hours and exceptional closures are maintainable; accepted/prohibited items are accessible text rather than image-only content; staff can update operational content without a deployment; stale information has an owner/review date.
- **Model/parallelism:** Terra; content verification and UI work can proceed in parallel after the content model is approved.
- **Principal risk:** publishing conflicting address/hours or rebuilding an image-only guideline.

## Slice 8 — Merchandise commerce

- **Scope:** products/variants/artists, inventory/reservations as required, Stripe-hosted Checkout, webhook-driven orders, fulfillment/refund operations, minimal retained purchaser/shipping data, and ReStore/event product relationships.
- **Dependencies:** Slices 1–3 and media; commerce policies, tax/shipping/fulfillment/refund ownership, inventory behavior, and Stripe accounts finalized.
- **Acceptance:** no card data touches the platform; webhook signatures are verified from the raw body; duplicate/out-of-order events are safe; a return redirect cannot mark an order paid; inventory cannot oversell under concurrency; refunds and reconciliation are auditable; retention jobs and access controls pass tests.
- **Model/parallelism:** Sol leads payment/inventory invariants; Terra leads catalog/admin/public UI once contracts freeze.
- **Principal risk:** webhook/reconciliation errors, inventory races, and unnecessary retention of purchaser data.

## Slice 9 — Public grant impact, migration, hardening, and launch

- **Scope:** deliberate public grant acknowledgments/impact, final selected content and media migration, complete redirects/SEO, performance/accessibility/security hardening, operational runbooks, backup/restore and reconciliation tests, analytics/consent as approved, and launch rehearsal.
- **Dependencies:** prior slices; human verification and legal/rights review for claims actually published; production ownership and incident contacts.
- **Acceptance:** every legacy URL has a tested disposition; redirects have no loops/chains beyond policy; private grant/applicant data cannot enter public projections; WCAG 2.2 AA review and critical user journeys pass; restore and rollback are rehearsed; monitoring/alerts have owners; launch and rollback checklists are signed off.
- **Model/parallelism:** Sol performs final architecture/security review; Terra handles bounded remediation; content, SEO, accessibility, performance, and operations work can run in parallel with a single launch coordinator.
- **Principal risk:** last-minute unverified content, privacy leakage, redirect loss, or an untested recovery path.

## Explicitly deferred product capabilities

Private grant administration and homeowner/assistance applications are confirmed future capabilities, not hidden parts of the launch slices above. Each requires its own product/security review before implementation. The application domain must preserve their separation now, but no SSN collection, applicant document intake, case workflow, or private grant document management is authorized by this roadmap.
