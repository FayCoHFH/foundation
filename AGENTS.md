# Repository operating contract

These instructions govern Codex and other engineering agents working in this repository. Read the linked foundation documents before changing architecture or beginning a delivery slice.

## Source-of-truth order

1. Sven's current explicit instruction.
2. Accepted decisions in [docs/foundation/decision-register.md](docs/foundation/decision-register.md) and accepted ADRs in [docs/adr](docs/adr).
3. Product, architecture, security, privacy, design, integration, and migration documents in this repository.
4. Verified primary-source vendor documentation.
5. The legacy Wix site, only for migration evidence as constrained below.

Resolve conflicts instead of recording incompatible alternatives. Mark an unresolved consequential choice as a precise gate with an owner and due slice; do not hide it in a generic `TODO`.

## LEGACY INDEPENDENCE — non-negotiable

This is a greenfield product. The Wix site may be used only for factual reference, selected historical content, media migration, SEO/redirect preservation, and content migration after verification.

The legacy site does **not** define navigation, information architecture, taxonomy, domain architecture, page structure, workflows, visual design, content hierarchy, admin design, URLs, or feature requirements. Migration ledgers are evidence and disposition records, never a product backlog or schema specification.

## Current phase guardrail

The foundation and Gate C Communications review are complete, but application implementation is not yet authorized. Do not add `package.json`, Next.js files, a Prisma schema, database migrations, production dependencies, application routes, or components until Sven explicitly issues **Slice 1 — Application Foundation and Scaffold**. Treat [the Communications architecture](docs/architecture/communications.md) as the accepted domain contract; change its durable publication, privacy, provider, storage, or authorization boundaries only through the repository's decision discipline.

## Architecture guardrails

- Use a modular monolith unless an accepted ADR establishes a demonstrated need for another deployment boundary.
- Preserve strong internal domain boundaries and explicit ports/adapters for DonorView, Stripe, Google identity, storage, and other external services.
- Communications is a bounded product domain: shared publishing infrastructure plus typed Stories and News semantics. Do not build a generic content blob or duplicate an editorial engine per content type.
- Public reads use immutable published projections/snapshots. Draft or mutable authoring records must never be a public fallback.
- Do not let illustrative domain groupings or directories freeze the public navigation or implementation layout before the relevant design review.
- Prefer relational domain semantics. Polymorphic references are acceptable only in well-bounded infrastructure such as publication snapshots, audit, integration crosswalks, and curated placements.
- Keep homepage curation and future placement management possible without prematurely implementing a universal page builder.
- Implement only the six accepted code-owned singleton placement definitions and their typed eligibility/fallback rules until a later accepted design adds another placement.
- Use versioned, validated structured rich text. Do not store arbitrary executable HTML.

## External-system and payment boundaries

- DonorView owns constituent, donor, gift, pledge, recurring-gift, receipt, volunteer-application, waiver, registration, attendance, hours, and mailing-list records where applicable.
- Fayette Habitat owns the public experience, Communications, projects/programs, public people/governance, campaigns, events, ReStore, shop, impact, approved public grant presentation, admin access, and audit.
- Do not mirror a broad DonorView constituent database or screen-scrape it.
- Public evidence does not establish a DonorView API, webhooks, or Zapier support. Describe these as **vendor/account confirmation required**, never as either supported or absent without authoritative evidence.
- Prefer a DonorView-hosted designated donation destination when it satisfies a Habitat Campaign. A future Stripe-native donation path must be provider-neutral, reconcile idempotently into the gift system of record, and be approved by ADR before launch.
- Stripe is the merchandise payment provider. Never store card data; verified webhook processing, not a browser redirect, is payment truth.

## Identity and authorization

- Google authenticates administrators; it never grants application access by itself.
- Require an invitation and verified intended email, then load active local authorization state.
- Use Google `sub` as the stable external key. Disable Better Auth implicit account linking, user-initiated linking, and implicit sign-up initially; a different `sub` with the same email must be rejected before any account or principal link is persisted.
- Do not retain unused Google OAuth tokens. If a provider token must persist, enable auth-library encryption, classify it Restricted, use versioned key rotation/recovery, and exclude it from responses, logs, audit, fixtures, exports, and support data.
- Authorize with database-backed capabilities near every protected operation. UI, layout, middleware, email-domain, and role-name checks are not sufficient enforcement.
- Normal authors may not approve their own work. A Super Admin override must be explicit and audited.
- Invitations, role/capability changes, suspensions, sensitive publishing actions, private-file access, and integration changes require audit events without copying secrets or protected content into logs.

## Security and privacy

- Deny by default and minimize collection, access, replication, retention, logging, and export of protected data.
- Do not collect SSNs. Do not reproduce the legacy email/PDF applicant-intake process.
- Keep future applicant, household, eligibility, supporting-document, case-workflow, and internal-note data isolated from public Projects, Programs, Stories, News, and narratives.
- Keep private grant documents, internal notes, deadlines, contacts, and review work separate from deliberately approved public grant acknowledgment and impact.
- Separate public and private storage. A hard-to-guess object URL is not authorization.
- Require publication rights/consent and contextual alt text before media can enter a public snapshot. Strip sensitive metadata and do not expose exact occupied-home locations or private participant details.
- Validate uploads by signature and allowlist, generate immutable names, limit size/dimensions, quarantine risky content, and audit sensitive access.
- Redact tokens, signed URLs, PII, payment data, and protected request bodies from telemetry and errors.
- Treat Server Actions, route handlers, webhooks, cron endpoints, exports, and storage delivery as untrusted endpoints requiring their own authentication/authorization.

## Product and content rules

- Unknown content is not an unknown requirement. Build approved structures with draft/unavailable states while factual claims await human verification.
- Stories are narrative, rich-media, generally evergreen editorial records. News is timely, concise, announcement-oriented, and may expire or archive. Do not collapse one into the other.
- Featured News is a managed placement requirement, not justification for scattering permanent `isFeatured` flags across domain tables.
- Metrics need a source, methodology, owner, reporting period or as-of time, and public approval.
- Do not publish unverified board membership, biographies, eligibility, dates, impact claims, donation claims, legal/raffle language, partner/logo rights, or participant/photo permissions.
- Archived or expired News remains traceable; never silently delete it.

## Accessibility and design quality

- Target WCAG 2.2 AA and test semantic structure, keyboard operation, visible focus, contrast, zoom/reflow, reduced motion, form errors, and assistive-technology names.
- Accessibility is an acceptance criterion, not a post-launch audit.
- Use shadcn/ui only as accessible primitives. The product's visual identity must come from intentional tokens, typography, composition, imagery, and interaction design.
- Require text alternatives in their usage context; a media-library filename or one universal alt string is not adequate.
- Prefer resilient progressive enhancement and useful empty, loading, error, stale-integration, scheduled, archived, and permission-denied states.

## Delivery and testing

- Work in independently reviewable slices documented in [docs/foundation/implementation-roadmap.md](docs/foundation/implementation-roadmap.md).
- Before editing, inspect repository state and nearby instructions. Preserve unrelated user work and do not rewrite history without authorization.
- One coordinator owns shared schema migrations in a slice. Parallel agents receive non-overlapping file or domain ownership.
- Add tests in proportion to risk. Once implementation begins, the definition of done includes relevant unit/integration tests, real-Postgres constraint/migration tests, Playwright user journeys, authorization adversarial tests, accessibility checks, build/type/lint checks, and updated documentation.
- Security-sensitive workflows require negative tests: direct unauthorized requests, stale approval hashes, invitation replay, private-object access, duplicate webhooks, scheduling overlap, and secret/environment separation.
- Validate documentation, CSV schemas/counts, internal links, and accidental placeholders whenever foundation files change.

## ADR discipline

Create or amend an ADR when a change affects durable architecture, security boundaries, data ownership, external-provider commitments, storage/privacy, publication guarantees, or rich-text compatibility. ADR status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`; accepted decisions are not reopened without new material evidence and an explicit replacement ADR.

Do not create ADRs for reversible local details. Link requirements to decisions instead of copying divergent versions across files.

## Agent and model routing

- **Terra is the default model** for normal engineering: implementation, repository analysis, application/database services, UI, tests, refactors, documentation, ordinary debugging, and adapters whose contracts are established.
- Use **Luna first** for bounded mechanical work when it is available through the chosen execution path: searches, inventories, route enumeration, fixtures, repetitive tests, formatting, documentation synchronization, mechanical migrations, cleanup, and deterministic validation.
- Use **Sol only as a bounded exception** for a named consequential question that Terra cannot safely resolve: security-sensitive authentication/authorization, difficult schema or migration design, payments, privacy/threat analysis, high-risk integration contracts, cross-domain failures, or a final review of a risky slice. Do not use Sol as the parent/default implementation model, for routine work, or for duplicate broad reviews.
- Before invoking Sol, ask whether Terra can safely and competently perform the task. If yes, use Terra. State the exact review question and scope when Sol is used.
- Optimize for correctness per token: avoid redundant full-repository reads, repeated architecture reviews, overlapping agents, and long-running Sol work without a narrowly defined risk.
- Model availability reporting must distinguish manually selectable parent models from programmatically routable subagent models. Do not report a model as unavailable merely because it was not used or because it is unavailable through one routing mechanism.
- In delivery reporting, state: parent model actually used; subagent models actually used; parent models exposed to the current runtime; subagent models exposed to the current runtime; why Sol was invoked (if applicable); and why Luna was not used (if applicable). Scope any availability limitation to the relevant parent or subagent mechanism. If Sol performs more than a bounded review, explain why Terra was insufficient.
- Use subagents only for genuinely parallel work. Assign exclusive file/domain ownership, share the same accepted constraints, and perform one integrated final review.
- Read the full instructions for any applicable repository or Codex skill before using it. Use a skill only when it materially fits the task.

## Git and response contract

- Prefer small intentional commits that leave the repository valid. Never commit secrets, production exports, applicant data, donor/volunteer records, or unredacted vendor payloads.
- Do not create a remote or GitHub repository, and do not push, unless Sven explicitly authorizes it.
- Report exact validation commands, outcomes, Git branch/state, and commits.
- Every response to Sven for this project must be inside **one and only one fenced code block**, with no prose before or after it.
