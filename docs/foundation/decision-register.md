# Decision register

Last reconciled: 2026-08-14

`Accepted` decisions are authoritative and are not reopened without material new evidence and an explicit replacement decision. `Direction` records a compatibility constraint whose detailed design belongs to a later slice. `Deferred` is deliberately out of current implementation scope, not rejected.

Architecture rationale and consequences belong in [the ADR index](../adr/README.md); this register is the cross-domain summary.

## Product and scope

| ID | Status | Decision |
|---|---|---|
| P-01 | Accepted | Build a greenfield public website and administrative platform, not a Wix redesign or lift-and-shift. |
| P-02 | Accepted | **Legacy independence:** Wix supplies only verified facts, selected history/content/media, and SEO/redirect evidence. It cannot define product IA, taxonomy, domains, workflows, design, admin, URLs, or features. |
| P-03 | Accepted | Communications is a first-class product domain encompassing Stories/Journal, News, Newsletter, Media, Authors, Categories, publication workflow/queue, and a Communications Dashboard. |
| P-04 | Accepted | Stories and News are distinct typed capabilities. Stories are generally narrative, rich-media, evergreen editorial work; News is timely, concise, announcement-oriented, and may expire/archive. They share appropriate publishing infrastructure without becoming a generic `Content` blob. |
| P-05 | Accepted | Public News requires an index, detail experience, latest/featured presentation, publication date, scheduling, optional expiration/archive behavior, media, and optional relationships to Projects, Programs, Campaigns, Events, Grants, and Partners. |
| P-06 | Accepted | The V1 Communications Dashboard is an action center with **Needs Attention**, **Upcoming**, **Current Curation**, and **Recent Activity** modules. The cross-type Publication Queue provides capability-filtered **My Drafts**, **Needs Review**, **Needs Approval**, **Approved**, **Scheduled**, **Recently Published**, **Expired News**, and **Archived** views; neither surface owns workflow state. |
| P-07 | Accepted | The homepage uses structured hybrid curation: a reserved catalog of five manual singleton slots (Hero, Featured Story, Featured News, Featured Project, Featured Campaign), derived Latest News and Upcoming Events, and stable/configured domain sections. C4 implements Hero, Featured Story, and Featured News; Project/Campaign slots await their typed domains. Featured content is a placement, not a distributed `isFeatured` flag or a page-builder setting. |
| P-08 | Accepted | Habitat-owned Campaigns connect storytelling, a goal, Projects/Programs, updates, donation mechanism, progress, and final impact. A Habitat Campaign is not assumed to equal a DonorView campaign/fund/appeal object. |
| P-09 | Accepted | Public product areas include Programs, Projects, Stories/Journal, News, volunteer/get involved, Give, Campaigns, Events, ReStore, Shop, Impact, public Grant impact, Leadership/Governance, and About. This conceptual map does not freeze the navbar. |
| P-10 | Accepted | ReStore is a meaningful mission area, and merchandise includes Habitat/event products and local-artist collaborations. Detailed ReStore and commerce operating rules are later-slice inputs. |
| P-11 | Accepted | Organizational proof for grant reviewers must use attributable, maintainable evidence rather than performative vanity statistics. |
| P-12 | Accepted | Unknown content is not an unknown requirement. Structures may be implemented while facts remain draft, omitted, or pending human verification. |
| P-13 | Direction | Preserve future press releases, a derived editorial/communications calendar, and additional publication types without creating models solely for them now. Do not add a Communications Package unless a grouping proves an independent lifecycle, owner, ordered membership, and public behavior that existing Project/Program/Campaign/Event/Grant anchors cannot provide. |
| P-14 | Direction | Final public Story naming (`Journal`, `Stories`, or `The Habitat Journal`) and News/navbar placement are content/design decisions, not domain-architecture decisions. |
| P-15 | Accepted | Site Notice is a small Communications aggregate for time-bounded operational banners with controlled severity/surface, required end time, optional CTA, audit, and automatic end-of-window removal. It is not a News subtype or public archive. |
| P-16 | Accepted | Public Story Submission is a separate confidential intake and triage lifecycle that grants no admin access and never becomes a Story draft until an authorized conversion. There is no public News submission in V1. Intake launch requires approved ownership, retention/privacy text, abuse controls, and any private-upload/consent safeguards. |
| P-17 | Accepted | Newsletter Edition is a typed ordered curation of edition context and references, not duplicated article HTML. Habitat owns editorial editions; DonorView retains subscriber/consent/suppression truth. V1 provides the signup handoff and provider-neutral edition/delivery contract; edition authoring, web archive, and verified provider delivery are V1.1 unless separately pulled forward. |

## Architecture and publication

| ID | Status | Decision |
|---|---|---|
| A-01 | Accepted | Use a modular full-stack monolith: Next.js App Router/TypeScript, PostgreSQL (likely Neon), Prisma unless a later evidence-backed ADR establishes a material blocker, Tailwind, accessible shadcn/ui primitives, Vercel, object storage, and Playwright. Do not introduce microservices without a demonstrated need and replacement ADR. |
| A-02 | Accepted | External services sit behind explicit adapters/ports. Domain application services own cross-domain mutations; infrastructure details do not leak into core product semantics. |
| A-03 | Accepted | Publishing uses immutable/versioned authoring revisions, exact revision/hash approvals, and immutable public publication snapshots. Public reads never fall back to mutable drafts. Published work can coexist with a successor draft. |
| A-04 | Accepted | Stories and News share revisions, authorship, workflow, approval, scheduling, snapshots, SEO, media, classification where appropriate, related-domain references, and audit infrastructure while retaining typed lifecycle and presentation rules. |
| A-05 | Accepted | Content Placement is a constrained typed subsystem. The accepted catalog reserves six code-owned singleton definitions: `HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, `HOME_FEATURED_PROJECT`, `HOME_FEATURED_CAMPAIGN`, and `NEWS_FEATURED`; C4 implements the four Story/News keys (`HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, and `NEWS_FEATURED`), while Project/Campaign keys await their typed domains. Each definition controls legal target types and safe fallback; active windows cannot overlap per key, ineligible targets cannot render, and no universal page builder is authorized. |
| A-06 | Accepted | Candidate revision workflow (`DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`, `APPROVED`) is separate from schedule/release lifecycle, shared Story/News archive discovery disposition, and News-only derived current/expired availability. Scheduling is durable, idempotent, catches up after missed runs, tolerates overlap, and supplies a future derived calendar without a second scheduling system. |
| A-07 | Accepted | Rich text is a schema-versioned, validated structured document rendered from an allowlist; arbitrary stored executable HTML is prohibited. |
| A-08 | Accepted | Public and private media/storage are separate access classes behind a storage adapter. Vercel Blob is preferred subject to the recorded operational check; the boundary survives a provider change. Private URLs require authorization, and media rights plus contextual alternatives gate public publication. |
| A-09 | Accepted | Use real relational domain relationships; allow generic subject references only in tightly bounded infrastructure such as publishing, placement, audit, and integration crosswalks. |
| A-10 | Accepted | Communications uses independent `AuthorProfile` bylines, a small flat shared `EditorialCategory` vocabulary with allowed publication kinds, contextual `MediaUsage`, and no generic tags in V1. Public snapshots freeze author, category, relationship, media-usage, SEO, and renderer meaning. |

## Identity, permissions, and audit

| ID | Status | Decision |
|---|---|---|
| I-01 | Accepted | Google authenticates administrators; verified Google identity alone never grants access. Enrollment is invitation-gated and authorization is application-owned. |
| I-02 | Accepted | Use revocable database-backed session state and database-backed capability authorization near each protected operation. Do not hard-code authorization by role or trust layouts/middleware as enforcement. |
| I-03 | Accepted | Communications capabilities independently separate own/any draft read/edit, submit, review, approve, schedule, publish, withdraw/archive, media upload/edit/rights clearance/public use, placements, notices, taxonomy/authors, submission review, Queue/Dashboard read, and explicit exceptional override. Canonical keys are recorded in [permissions](../architecture/permissions.md); role presets never replace capability checks. |
| I-04 | Accepted | Normal authors cannot approve their own work. A Super Admin may explicitly override, with reason and audit. |
| I-05 | Accepted | Sensitive access, authorization changes, publishing transitions, integration configuration, and private-file access are audited without duplicating secrets or protected content. |
| I-06 | Accepted | Use Better Auth rather than Auth.js for this greenfield build, with Google OIDC, the Prisma adapter/PostgreSQL database sessions, a local invitation/active-user gate, and capability authorization. Google `sub` is the stable external key; `email_verified` and expected Workspace `hd` are validated, but neither login nor domain grants access. Disable implicit/user-initiated account linking and implicit sign-up; reject a different `sub` with the same email before persistence. Do not retain unused OAuth tokens; encrypt/classify/rotate any token that must remain. Disable session-cookie caching initially, use a 12-hour non-sliding maximum, require fresh reauthentication for sensitive actions, and run the precise Slice 1 spike in [ADR-0002](../adr/0002-authentication-and-sessions.md). Package/version selection is an engineering responsibility, not a choice delegated to Sven. |

## Data ownership and providers

| ID | Status | Decision |
|---|---|---|
| D-01 | Accepted | DonorView remains the system of record for constituent identities/contact preferences, donors, gifts, pledges, recurring gifts, designations/receipts, volunteer applications/waivers, registrations/attendance/hours, mailing lists, and DonorView-operated event registrants. |
| D-02 | Accepted | Fayette Habitat owns the public experience, Communications and editorial state, Projects/Programs, public People/Governance, Campaigns/Events, ReStore/Shop, approved public Impact/Grant content, admin identity/authorization/audit, and curated placements. |
| D-03 | Accepted | The architecture is provider-neutral at the Campaign-to-donation boundary. Prefer a DonorView-hosted designated donation destination if the account demonstrates the required flow; DonorView still owns the donor/gift record. |
| D-04 | Accepted | Stripe is the merchandise commerce provider and no card data is stored. Verified webhook processing is payment truth. |
| D-05 | Direction | Stripe-native donations are optional future scope only if DonorView does not meet campaign needs and an accepted ADR proves idempotent constituent/gift/designation/receipt/reconciliation ownership without a second gift ledger. |
| D-06 | Accepted | Do not claim a DonorView API, webhooks, or Zapier exists or is absent: those capabilities are not publicly evidenced and require account/vendor confirmation. Do not screen-scrape. |
| D-07 | Accepted | Local crosswalks, sync state, reconciliation issues, and privacy-safe aggregate projections may exist when supported. Do not mirror the broad DonorView constituent database. |

## Privacy, grants, and applicants

| ID | Status | Decision |
|---|---|---|
| S-01 | Accepted | Public participant/project/story records cannot contain private applicant, household, eligibility, exact occupied-address, financing, case-note, or supporting-document data. Collect and expose only approved minimums. |
| S-02 | Accepted | Never collect SSNs and never reproduce the legacy email/PDF application intake. The legacy assistance PDF is a security blocker, not a form template. |
| S-03 | Accepted | Public Grant Impact and private Grant Administration are separate projections/boundaries. Public acknowledgment is deliberate; internal notes, contacts, deadlines, applications/reports, and documents stay private. |
| S-04 | Deferred | Private grant-management capability is confirmed future work and requires its own workflow, permission, storage, retention, and audit review before implementation. |
| S-05 | Deferred | A homeowner/assistance application capability is confirmed future work and requires an isolated security/privacy design before implementation. |
| S-06 | Accepted | Data is classified, minimized, access-limited, retention-governed, redacted from telemetry, and deleted or anonymized when purpose/legal obligations end. Legal/policy owners finalize periods before affected launch. |

## Migration and delivery

| ID | Status | Decision |
|---|---|---|
| M-01 | Accepted | Every known legacy page/post has a recorded disposition. Content may be migrated, transformed, merged, redirected, archived, legally reviewed, or retired; no continuing value means it may be discarded. |
| M-02 | Accepted | Preserve useful project history, selected Stories/media, and search equity after verification; retire copy-slugs, stale/inactive flows, placeholders, contradictions, and unsafe intake rather than copying them. |
| M-03 | Accepted | Target WCAG 2.2 AA throughout design, implementation, content, and verification. Accessibility is part of each slice's acceptance criteria. |
| M-04 | Accepted | Work proceeds in independently reviewable/testable slices with one coordinator for shared migrations, non-overlapping parallel ownership, risk-proportionate tests, and an integrated final review. |
| M-05 | Accepted | Gate C (Communications Domain Product & Architecture Review) is complete. C4 Homepage Curation & Content Placements is complete on 2026-08-15; its shared typed placement, public projection, migration, and validation evidence is recorded in the C4 development record. The recommended next Communications assignment is **C5 — Communications Dashboard & Publication Queue**; it begins only when Sven explicitly authorizes it. |
