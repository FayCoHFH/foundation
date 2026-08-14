# Communications domain architecture

Status: **Accepted implementation specification**
Last reviewed: 2026-08-14

## 1. Purpose, boundary, and decisions

Communications is the Habitat-owned domain for enduring editorial work, timely public updates, newsletter editorial content, editorial media use, authors, controlled categories, publication workflow, curated placements, and staff work views. It provides **shared publishing infrastructure plus typed Communications aggregates**. It is neither a generic CMS nor independent Story and News engines.

This document resolves Gate C for the Communications scope. It applies the accepted decisions in the [decision register](../foundation/decision-register.md), [ADR-0003](../adr/0003-publication-revisions-and-snapshots.md), [ADR-0005](../adr/0005-public-private-object-storage.md), and [ADR-0007](../adr/0007-structured-rich-text.md). It does not change their boundaries or create an application schema.

### Confirmed product decisions

- **Story** is the internal name for a generally evergreen, narrative, rich-media editorial record. The public label (`Stories`, `Journal`, or `The Habitat Journal`) remains a content/design choice.
- **News** is a distinct, concise, dated announcement or operational update. It can expire, be withdrawn, and be deliberately archived without deletion.
- Public reads use only active, eligible immutable snapshots. Mutable authoring data, review notes, submission records, and quality diagnostics are never a public fallback.
- A new working revision can coexist with a current public snapshot. Approval and schedules bind to a canonical hash of one exact revision.
- **Content Placement** is the managed curation mechanism. “Featured” is a placement, never a permanent boolean on Story, News, or another domain record.
- Editorial category is a small, flat, controlled classification. V1 has no generic tags.
- Public Story Submission is separate confidential intake that may be converted into an editorial draft; it is not a Story draft and grants no administrative access. V1 has no public News submission form.
- Newsletter editorial content is typed and Habitat-owned; subscriber identity, consent, suppression, and membership remain in DonorView under the accepted boundary.
- Calendar is a future derived view of authoritative dates, not a second scheduling system. No Communications Package entity is justified in V1.

### Scope and non-goals

Communications owns public editorial projection and selected public operational notices. It may relate to public-safe Projects, Programs, Campaigns, Events, Grants, Partners, and People through explicit typed links, but does not own their canonical records. It must not be used to carry applicant, household, donor, volunteer-application, private grant, payment, or private contact data.

There is no V1 page builder, generic content table, generic tags, public News intake, social-post automation, AI moderation, calendar-only entity, communications-package entity, subscriber database, or email sender/provider commitment.

## 2. Typed editorial aggregates

`Publication` is a narrow shared spine, not a user-facing content type. A publication has exactly one typed root (`Story` or `NewsItem`) and a closed `kind` discriminator. Its revision, approval, scheduling, snapshot, workflow, quality, authorship, media, SEO, and relation records remain type-aware through the root and validation service.

### 2.1 Story

**Purpose:** publish an enduring narrative that adds context beyond an announcement. Examples include volunteer, partner, project, leadership, ReStore, grant-impact, and behind-the-build stories. A Story is not the canonical Project, Program, event, participant, or grant record it may mention.

| Class | Story field or relationship | Rule |
| --- | --- | --- |
| First-class | `headline`, canonical `slug`, `deck`, `excerpt`, structured `body`, one or more ordered authors/bylines, publication dates, canonical SEO metadata, primary/hero media usage | Required for submission except `deck` where the content design permits omission. Hero media is a typed first-class field but optional; the public presentation has a safe non-visual fallback. |
| First-class | Story presentation options: `heroMediaUsageId`, `socialMediaUsageId`, `readingTime` display policy, `showPublishedDate`, `showUpdatedDate` | Stored in the revision; reading time is derived from validated body text. Media uses are contextual records, not duplicated asset metadata. Missing optional visual treatment is a warning, not a publication blocker. |
| Optional explicit relations | Project, Program, Campaign, Event, public Grant acknowledgment, Partner, public-safe Person, approved ReStore/artist/product record, related Story, related News | Add only when it gives readers meaningful context. Use a normal typed join for each relation family; do not add all links merely because the target exists. |
| Optional editorial metadata | ordered `EditorialCategory`; one primary CTA reference; explicit related-publication ordering; correction note when policy requires it | CTA and related records point to validated internal destination or allowlisted external URL. |
| Derived | reading time, search document, sitemap entry, related-content candidates, public eligibility, media readiness, link health, placement eligibility | Derived from the approved revision/snapshot and current public eligibility; never hand-edited as source truth. |
| Future | multiple CTAs, multilingual editions, audio/transcript, dedicated gallery aggregate, press-release conversion, richer correction policy | Add only with a defined reader need and snapshot/hash behavior. |

Story has no native expiration. Evergreen presentation is the default. A deliberate archive removes a Story from ordinary collection/related/placement discovery while retaining its directly addressable historical snapshot and audit; withdrawal removes public delivery for corrective or safety reasons. Restoring either requires a successor draft and normal approval rather than silently reactivating an old snapshot. Participant narratives require explicit publication consent and any policy-required additional approval before publication; a Story cannot rely on the existence of a public Person, Project, or original submission as consent.

### 2.2 NewsItem

**Purpose:** publish a timely, authoritative update with a clear date, relevance, and reader action where applicable. It is not a short Story and must not become the sole maintained source of long-lived Program rules, ReStore hours, or event facts.

| Class | News field or relationship | Rule |
| --- | --- | --- |
| First-class | `headline`, canonical `slug`, `summary`, structured `body`, one or more ordered authors/bylines, `firstPublishedAt`, canonical SEO metadata, primary/thumbnail media treatment | Headline, summary, body, author/byline, and publication date are required to publish. Thumbnail/hero media is a typed first-class field but optional; a safe text-first card/detail fallback is required. `firstPublishedAt` is set by first public activation (or a verified imported original date), remains distinct from a successor snapshot’s activation/update time, and never substitutes for an Event/effective date described by the News item. |
| First-class | `expiresAt` (optional), `expirationPresentation`; shared archive/withdrawal references | Expiration is typed News behavior; it must have a UTC instant later than the intended activation and display in the configured editorial time zone. Archive discovery disposition and release withdrawal use the shared publication records; expiry is not a generic publication field. |
| Optional explicit relations | Event, Project, Program, Campaign, public Grant acknowledgment, Partner, related Story | A timely event update normally relates to its Event; use the canonical target page for durable details. A relationship must pass the target domain’s public-visibility check. |
| Optional editorial metadata | one primary CTA, category, effective date/range text, ordered related publications | V1 does **not** introduce priority/pinning. A later priority field needs a defined reader and placement behavior; it cannot silently mean featured or urgent. |
| Derived | current/expired availability, latest listing rank, active-placement eligibility, search/sitemap status, link health, media readiness | Derived from immutable snapshot plus time, release state, and shared discovery disposition; never from a mutable draft. |
| Future | press-release subtype, time-bounded pin policy, multilingual edition, provider syndication/RSS metadata beyond standard feed | Each needs its own typed behavior and approval rule. |

News needs concise editorial validation: the summary must communicate the change, dates/action must be clear when relevant, and an announced cancellation/closure cannot leave a conflicting active CTA. `expiresAt` is optional; an editor chooses it for facts whose usefulness ends at a known time. It is not a substitute for reviewing canonical operational pages.

## 3. News lifecycle and public behavior

The implementation keeps four state dimensions separate so a revision’s editorial work cannot be confused with public release, deliberate archival discovery, or a News item’s time relevance.

1. **Immutable revision workflow:** the current revision is `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`, or `APPROVED`.
2. **Release/snapshot state:** the publication/release is `UNPUBLISHED`, `SCHEDULED`, `PUBLISHED`, `WITHDRAWN`, or `SUPERSEDED`. A snapshot is immutable: publishing a successor marks the prior active snapshot `SUPERSEDED`; it does not rewrite it.
3. **Shared discovery disposition:** an editor deliberately sets a published Story or News item to `ACTIVE` or `ARCHIVED`; this changes normal discovery, not snapshot history or release truth.
4. **News-only availability:** `CURRENT` or `EXPIRED` is derived from the active published snapshot’s optional `expiresAt` and time.

```text
Revision workflow
DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> DRAFT
                 \-> PENDING_APPROVAL -> APPROVED

Release/snapshot state
UNPUBLISHED -> SCHEDULED -> PUBLISHED -> WITHDRAWN
                         \-> PUBLISHED -> SUPERSEDED (when a successor snapshot activates)

Shared discovery disposition
ACTIVE -> ARCHIVED
ARCHIVED --approved successor release--> ACTIVE

News derived availability
CURRENT -> EXPIRED (when expiresAt elapses; successor revision can establish a new current snapshot)
```

`SUBMITTED` is an append-only transition event that moves a candidate from `DRAFT` or `CHANGES_REQUESTED` to `IN_REVIEW`; it is not a persistent workflow state. `CHANGES_REQUESTED` returns responsibility to the author/editor but does not mutate the submitted revision. `PENDING_APPROVAL` means review is complete and the exact candidate awaits an approver. Scheduling and publishing are release actions on an exact approved hash, not revision-workflow states. An implementation may refine enum labels, but it must preserve these dimensions and rules.

### Expiration is derived, not deletion

For a published, `ACTIVE` News snapshot with an elapsed `expiresAt`, derived availability is **EXPIRED**. A durable scheduler records the expiry event idempotently and removes the item from active/latest listings and every active placement. It remains directly addressable as an historical public page by default, with an unambiguous “no longer current” treatment, original publication date, and any relevant effective/expiration context. Its action CTA must be suppressed if no longer valid. The item remains traceable in the public News archive and normal search unless a separate documented `noindex` decision removes index/search eligibility or the release is withdrawn. A later deliberate archive changes ordinary discovery as defined below; archive alone does not imply `noindex`.

Expiration does not automatically change discovery disposition from `ACTIVE` to `ARCHIVED`. **Archive** is a deliberate shared disposition change that removes a Story or News item from ordinary listings, placements, and related-content candidates while retaining its snapshot, direct historical page, and audit record. News also has a controlled archive browse path; V1 does not require a separate public Story archive browse route. Archived public content remains indexable by default when it has lasting historical value; an editor may choose `noindex` only with a documented reason (for example, duplicate or potentially misleading obsolete operational information). It must never be silently deleted.

**Withdrawal** is a corrective/safety action, distinct from expiration and archive. It removes the snapshot from ordinary public delivery, search indexing, sitemap, relationships, and placements as soon as cache invalidation completes. The canonical route returns a truthful unavailable/removed response without exposing withdrawal reason or draft content; the restricted reason and prior snapshot remain available only to authorized staff and audit.

### Restore and republication

- An archived Story or News item is restored by creating a successor draft from a selected historical revision or snapshot, resubmitting, and receiving a new approval; the old snapshot is never reactivated invisibly. The item returns its discovery disposition to `ACTIVE` only through that approved successor release.
- An expired News item follows the same successor path, with its expiration/effective content revised as needed; expiry never rewinds merely because an editor changes a mutable timestamp.
- A withdrawn item requires the same successor-draft and normal approval route. Only an authorized emergency restoration policy may be added later; it is not a V1 shortcut.
- A schedule may be cancelled before activation. A cancelled schedule leaves the approved revision intact but does not create public output.
- A future scheduled or re-published item gets a new snapshot and all relevant audit events. Scheduler retry or overlap must be idempotent and cannot create duplicate active snapshots.

## 4. Shared publishing kernel

The shared kernel implements the guarantees of [ADR-0003](../adr/0003-publication-revisions-and-snapshots.md). It contains the smallest common contract needed by Story and News; type-specific data never becomes a catch-all JSON blob.

| Record | Ownership and immutability | Required responsibility |
| --- | --- | --- |
| `Publication` | Communications root; mutable identity/current pointers only | `kind`, canonical slug/history, current working revision/workflow state, approved revision/hash, current release state, shared discovery disposition, active snapshot pointer, schedule/archive/withdrawal references, optimistic-concurrency version. Exactly one `Story` or `NewsItem` detail exists; News-only expiry data remains on `NewsItem`. |
| `PublicationResponsibility` | Mutable internal assignment, never public authorship | Required `editorialOwnerAdminUserId`, optional `assignedReviewerAdminUserId` and `assignedApproverAdminUserId`, changed-by/time, and reassignment reason where policy requires it. Creation defaults owner to the creating AdminUser unless an authorized `edit.any` command assigns another active user. `*.read/edit.own` scopes only to editorial owner; reviewer/approver assignment organizes work but does not grant capability. Reassignment is capability-checked and audited. |
| `PublicationRevision` | Immutable after save | Number, parent revision, author/editor actor, typed title/summary/presentation/SEO fields, structured rich text, schema version, relation/media/category/author selections, content hash version and canonical hash. A save creates a successor revision; it never updates an existing one. |
| `PublicationLifecycleTransition` | Append-only internal event | Explicit dimension (`CANDIDATE_WORKFLOW`, `RELEASE_SNAPSHOT`, `DISCOVERY_DISPOSITION`, or derived `NEWS_AVAILABILITY` observation), action, from/to state where applicable, subject revision/hash/snapshot/schedule, actor or service principal, reason where needed, timestamp, and correlation/idempotency key. It records `SUBMITTED` as an action and expiry as an idempotent derived observation. It is the authoritative lifecycle history, not a Queue record or a substitute for current aggregate state. |
| `PublicationApproval` | Immutable evidence | Exact revision id, canonical hash/version, approver, policy version and satisfied requirements, decision/reason, override flag and reason. An approval cannot apply to a changed revision. |
| `PublicationSchedule` | Mutable command state with event history | Approved revision/hash, UTC activation time, editorial time zone, release status, cancellation/failure/retry metadata, idempotency key. A scheduler reads this contract; it never chooses a current draft. |
| `PublicationSnapshot` | Immutable public projection | Frozen type-specific public payload, validated rich text/schema and renderer versions, resolved author display data, relations, media asset versions/context, SEO, canonical URL, approval hash, and `PUBLISHED`/`WITHDRAWN`/`SUPERSEDED` release history. |
| `PublicationQualityIssue` | Derived/recomputable internal read model | Rule code, severity, affected revision/snapshot, freshness, remediation link. It accelerates work but cannot override publication validation. |

The canonical hash covers every candidate field that can change public meaning or rendering: typed metadata, rich-text JSON, author order/byline presentation, categories, relationships, CTA targets, SEO, media asset versions and contextual usage metadata, policy-relevant flags, and public date/expiration fields. The operational activation instant selected after approval lives on `PublicationSchedule`, binds to the exact approved hash, and is not retroactively inserted into that hash; rescheduling is a permissioned, audited release command that must still pass effective-date/expiry/content consistency validation. Internal responsibility assignment and comments do not alter the hash. Canonicalization and hash algorithm/version are defined before Slice 2 migration work and tested deterministically.

On submission, a candidate revision is frozen and emits the `SUBMITTED` transition event. A material successor revision clears the approved pointer and returns the working revision to review without changing an existing public snapshot. Scheduling creates a release instruction for the exact approved hash; publishing validates current authorization, that hash, typed requirements, media readiness, schedule window, and placement-independent public eligibility in one transaction. It then writes/activates an immutable snapshot, supersedes the prior snapshot if present, and emits the durable event used for cache/search effects. Public query services read only active eligible snapshots, never `Publication`, revision, or authoring joins.

## 5. Editorial workflow and lightweight approval policy

### V1 workflow responsibilities

| Step | Actor and rule | Result |
| --- | --- | --- |
| Draft/edit | Editorial owner with typed `edit.own`; editor with `edit.any` may edit/reassign any permitted record | New immutable successor revision; existing public snapshot remains unchanged. Public AuthorProfile/byline is independent of internal responsibility. |
| Submit | Author or editor | Candidate revision enters `IN_REVIEW`; validation reports blockers before submission. |
| Review | Editor/reviewer | Request changes or move the exact candidate to `PENDING_APPROVAL`. Material reviewer edits create a successor and return it to review. |
| Approve | Qualified approver who is not a material author of the candidate | Exact revision/hash approval under the resolved policy. |
| Schedule/publish | Publisher | Move the release from `UNPUBLISHED` to `SCHEDULED` or create an active `PUBLISHED` snapshot only from the current approved hash. |
| Correct after publication | Author/editor then normal review/approval | A successor revision and new `PUBLISHED` snapshot; correction display is policy-driven, not automatic. |
| Withdraw/archive | Publisher or dedicated capability | Move release to `WITHDRAWN` or set Story/News discovery disposition to `ARCHIVED`; capture reason and audit. |

Normal authors cannot approve their own work. An approver who materially edited the candidate after its submission also cannot be its sole approver. The Publisher preset grants no editing or approval by itself. If a publisher separately holds edit capability, any material pre-publication change creates a successor revision, invalidates approval, and cancels/invalidates a schedule tied to the old hash; the candidate is never edited in place. Super Admin override is available only as an explicit operation requiring fresh authentication, reason, an `override` approval record, prominent audit event, and a follow-up review/notification path. It is not a role-name bypass.

### Extensible approval requirements without a BPM engine

At submission, the policy resolver assigns a small versioned requirement set to the candidate. V1 has `STANDARD`: one qualified independent approval and all publication blockers resolved. It can add explicit requirement keys without changing the revision model, for example `CONSENT_CLEARANCE`, `SECOND_APPROVAL`, `LEGAL_REVIEW`, or `FINANCIAL_CLAIM_REVIEW`.

Each requirement has a policy owner, satisfied/waived status, an explicit policy-level `waivable` rule, qualified actor or evidence reference, and audit event. Evidence references point to restricted consent/review records, never copied protected content. The candidate snapshot records the policy version and satisfied requirement identifiers. An override can waive only a requirement whose owning policy explicitly permits it; it cannot bypass authorization, invalid schema/relations, exact-hash approval, unsafe media, or consent/rights evidence that policy or law makes mandatory. This is intentionally a policy table and resolver, not arbitrary conditional workflow scripting. Policy escalation is triggered by structured flags and editorial judgment—for example, a participant/minor claim, rights-sensitive media, public grant-impact claim, or raffle/legal statement—and does not infer facts from free text alone.

## 6. Publication Queue and Communications Dashboard

### Publication Queue: V1 cross-type work view

The Queue is a capability-filtered query over `Publication`, current workflow, approvals, schedules, and quality issues. It never owns a workflow state. Each row always shows type identity, title, public author/byline, internal editorial owner, workflow state, current candidate revision, approval/schedule state, relevant date, blocking issue count, and safe actions.

V1 saved views are **My Drafts**, **Needs Review**, **Needs Approval**, **Approved**, **Scheduled**, **Recently Published**, **Expired News**, and **Archived**. **My Drafts** means owned work in `DRAFT` or `CHANGES_REQUESTED`; it never scopes from public byline. Essential filters are content type, state/view, public author, editorial owner, assigned reviewer/approver, date range, and directly related Project/Program/Campaign where a typed relation exists. V1 does not promise broad faceted search across every relation.

Inline actions are limited to open preview/editor and capability-checked responsibility assignment: `edit.any` may reassign editorial owner, while the typed review/approval capability may set its corresponding reviewer/approver assignment. Submit, request changes, approve, schedule, publish, cancel, archive, withdraw, content/metadata changes, consent resolution, relation/media changes, and placement choices occur in the typed editor or focused management screen with the exact revision and consequences visible—not in a spreadsheet-like Queue. Assignment never grants capability or changes public byline. A user sees only records and actions permitted by record scope and capabilities; confidential review notes and submission PII are never exposed through a broad Queue query.

### Dashboard: V1 action center

The Dashboard is a derived, capability-filtered read model, not a reporting product or source of truth. V1 modules are:

| Module | Decision/action | Authoritative source |
| --- | --- | --- |
| Needs Attention | Open items awaiting the viewer’s review/approval; failed schedules/snapshot generation; and actionable content, consent, relation, media-rights, or accessibility blockers | Workflow, schedule, requirement, media usage, and quality records |
| Upcoming | Inspect scheduled Stories/News and News expiring in the next 14 days; open the focused record to cancel, revise, archive, or confirm no action | Approved schedules plus `NewsItem.expiresAt`/availability |
| Current Curation | Inspect the five homepage singleton slots and open placement management if authorized; `NEWS_FEATURED` remains visible on its News management surface | Content Placement resolver |
| Recent Activity | Understand recent publish, approve, schedule, withdraw/archive, placement, and rights-clearance events | Append-only audit/workflow events |

Empty states explain that no action is needed and link to permitted creation/Queue actions. There are no V1 traffic, engagement, follower, or “content count” vanity tiles. Broken-link results may appear only when a verified checker exists, its check time is displayed, and the viewer can remedy the target; otherwise they remain a future quality signal. Newsletter work appears once Newsletter Edition is implemented.

## 7. Content Placement and homepage curation

### Small typed relational placement design

V1 uses six code-defined singleton `PlacementDefinition` values, not an admin-created generic slot builder. A definition has `key`, display name, allowed target kinds, maximum active items, whether an active window is allowed, fallback rule, and required preview context. V1 ordering mode is always `NONE`. Definitions are:

| Key | Legal target | Cardinality and fallback |
| --- | --- | --- |
| `HOME_HERO` | Story, News, Project, or Campaign | At most one active placement; if none is eligible, render the approved static/default home hero configuration. |
| `HOME_FEATURED_STORY` | Story | At most one active placement; omit the region if none is eligible. |
| `HOME_FEATURED_NEWS` | News | At most one active placement; fall back to latest eligible News, clearly labelled as latest rather than featured. |
| `HOME_FEATURED_PROJECT` | Project | At most one active placement; omit the region if none is eligible. |
| `HOME_FEATURED_CAMPAIGN` | Campaign | At most one active placement; omit the region if the Campaign domain/projection is absent or no target is eligible. |
| `NEWS_FEATURED` | News | At most one active placement on the News landing; fall back to the latest eligible News, clearly labelled as latest rather than featured, or omit the region when no News is eligible. |

`ContentPlacement` is the aggregate for a selected target: definition key, optional start/end instants, optional editor note, created/changed actor, and lifecycle/audit history. It has typed foreign-key alternatives (`storyPublicationId`, `newsPublicationId`, `projectId`, `campaignId`) and a `targetKind` check enforcing exactly one populated target and a target that is legal for its definition. This explicit union is intentionally small and schema-validated; it is not an `entityType/entityId` polymorphic blob. Each target has its normal FK and public-eligibility resolver.

The placement service validates capability, definition, active-window overlap/cardinality, target publication eligibility, and type. It checks a Story/News target’s currently active snapshot at resolve time, so a withdrawn, expired, archived, or unpublished target cannot remain featured. V1 permits schedule windows but does not support multiple ordered carousel items. Changing a placement, ending it, or resolving a collision is auditable. Cache invalidation follows the placement transaction.

Later definitions such as `HOME_FEATURED_EVENT`, `HOME_RESTORE`, `HOME_SHOP`, and `STORIES_FEATURED` must be added only with a public-region requirement, allowed-type rules, and fallback—not merely because the infrastructure can accept them.

### Homepage hybrid model

The homepage is structured curation, not newest-row automation or drag-and-drop pages.

| Section | V1 model | Authority/fallback |
| --- | --- | --- |
| Hero | Curated | `HOME_HERO`; approved default when unplaced. |
| Featured Story | Curated | `HOME_FEATURED_STORY`; omit if no eligible target. |
| Featured News | Curated with derived fallback | `HOME_FEATURED_NEWS`; latest eligible News only when no managed placement. |
| Featured Project | Curated | `HOME_FEATURED_PROJECT`; omit if no eligible target. |
| Featured Campaign | Curated | `HOME_FEATURED_CAMPAIGN`; omit if the Campaign domain/projection is absent or no eligible target. |
| Latest News | Derived | Most recent eligible News snapshots; never confused with featured. |
| Upcoming Events | Derived | Public Event/Edition dates; no Communications duplicate schedule. |
| Impact evidence | Curated configuration | Approved metric set from Impact domain; show source/methodology/period. |
| Volunteer, newsletter, ReStore, Shop, Partners | Stable approved component/configuration in V1 | Each domain remains authoritative; future contextual placements require approved definitions. |

Homepage preview resolves the same placement and eligible public projection rules as public rendering, against an authorized preview context. It does not make drafts generally public or let a placement override publication approval.

## 8. Authors and controlled taxonomy

### AuthorProfile

`AuthorProfile` is a Communications-owned public byline/profile aggregate, separate from both `Person` and `AdminUser`:

- It stores display name, optional honorific/pronouns, public title/role, short bio, portrait media usage, organization-byline flag/name, profile slug, visibility state, and archive state.
- It may reference at most one public-safe `Person` and at most one `AdminUser`; neither is required and neither link grants authorization or public disclosure. A Person or AdminUser may support multiple deliberately distinct byline profiles (for example, personal and Executive Director contexts), so these are not forced one-to-one relationships.
- Revision authorship references an ordered AuthorProfile plus the display/byline data frozen in the snapshot. A later profile edit does not rewrite a published byline.
- An archived profile remains available on historical snapshots. Its public profile landing can be unavailable or redirect to a controlled archive explanation without changing past attribution.

This supports an Executive Director publishing under an Executive Director profile, a volunteer credited without any admin account, a guest contributor, organization byline, and a participant using an approved limited identity or pseudonym. The actual submitter, rights-holder, editor, and displayed author are separate concepts. Sensitive participant identities and private contact details remain confidential and must not be inferred from the public profile.

Internal editorial responsibility is also separate: a Story credited to a volunteer without an account still has an active `AdminUser` as editorial owner, while an administrator may own/edit a draft without appearing in its public byline. Suspension preserves historical assignment for audit but blocks action until an authorized manager reassigns current work.

### EditorialCategory

`EditorialCategory` is a flat, Communications-owned controlled vocabulary with `name`, `slug`, optional public description, display order, active/retired state, and allowed publication kinds. V1 allows zero or one primary category per Story or News; real domain relations provide additional discovery without category/tag stacking. Final names, including example concepts such as Volunteer Stories or Behind the Build, remain open and are not implementation blockers.

Only designated taxonomy managers may create, rename, retire, or merge categories. Retirement blocks new assignment; existing snapshots preserve the original label. A merge records the successor category for future assignment and preserves historical audit/snapshot facts. V1 has no category hierarchy and no generic tags. Real entities—such as a Project—must be linked through their typed relation, not represented by a tag or a category string.

## 9. Site Notices

`SiteNotice` belongs to Communications but does not use the Story/News publication aggregate. It is intentionally small: `title`, plain/structured short message with a very restricted text schema, severity (`INFO`, `IMPORTANT`, `URGENT`), controlled target area (`GLOBAL`, `HOME`, `RESTORE`, `BUILD` initially), required `startsAt`/`endsAt`, optional validated CTA, author, and audit history. Stored lifecycle is `DRAFT`, `PUBLISHED`, or `WITHDRAWN`; `UPCOMING`, `ACTIVE`, and `ENDED` presentation are derived from the required window for a published notice.

Only authorized notice managers can create or change one. A material change to a published/live notice records an audited successor version. It renders only in its window and automatically stops at `endsAt`; the record and audit persist. Global notices render as a dismissible but keyboard-accessible banner; target-area notices render in the relevant local template. Notice content must remain concise, must not duplicate a long News item, and must link to a canonical page/News item when more explanation is necessary. Urgent means operational importance, not sensational “breaking news.” V1 does not build notice audience segmentation, push notifications, or a public notice archive.

## 10. Public Story Submission

### Separate confidential intake lifecycle

```text
RECEIVED -> TRIAGED -> ACCEPTED_FOR_DEVELOPMENT -> CONVERTED
                   \-> NEEDS_FOLLOW_UP -> TRIAGED
                   \-> DECLINED -> RETENTION_PENDING -> PURGED
CONVERTED -> RETENTION_PENDING -> PURGED (raw intake after its approved retention period)
```

`PublicStorySubmission` is a confidential intake aggregate. It contains minimum contact and pitch information: name, email, chosen relationship-to-Habitat category, suggested title, story text, optional contact preference, privacy-notice acknowledgment version/time, contact consent, publication-consent indication (not proof of final publication permission), and a minor/participant sensitivity declaration. It must clearly instruct submitters not to include applicant, eligibility, financial, medical, household, address, or other sensitive information. Free text is treated as potentially confidential and excluded from logs, analytics, search, previews, and fixtures.

Optional `SubmissionMedia` uploads are private only: opaque upload identifier, private object key/version, validation/scan state, source/ownership affirmation, subject/consent declaration, and separate rights-review status. Public form file upload launches only after the upload controls in ADR-0005 are implemented (size/type/dimension limits, magic-byte/decode validation, quarantine/scan, metadata stripping, private delivery, deletion, and abuse controls); the intake can launch text-only if those controls or media policy are not ready. The form uses rate limiting, bot-resistant challenge appropriate to accessibility, server-side validation, duplicate/throttle detection, CSRF/origin protections, and a generic success response that cannot be used to enumerate submissions.

An editor may review the intake with `communications.submissions.review`, request follow-up through an approved contact process, decline it, or accept it for development. A sensitive participant/minor declaration automatically flags it for policy review; it does not publish, expose identity, or create an application/case record. Conversion creates a new Story and initial internal draft with a restricted provenance link to the submission. It copies only selected editorial material, never blindly promotes the submission, does not reuse the submitter as public byline without AuthorProfile/consent review, and enters the normal Story workflow. Submission media becomes a normal candidate media usage only after independent rights and contextual-alt review.

There is no public News submission in V1. Authorized staff create News internally. A future public news-tip intake requires a separate abuse, triage, retention, and authority decision; it must not reuse Story Submission casually.

Before launch, the submission form needs a named owner and approved retention profile. The proposed default is purge declined/duplicate submissions 90 days after final disposition, purge quarantined/rejected uploads after 30 days, and review accepted-but-unconverted submissions at 12 months; retain only consent/rights evidence and restricted audit history for their approved policy periods. A converted public Story follows normal publication retention, while raw submission text/media is still purged on the intake schedule unless a defined rights/consent purpose or hold requires restricted retention.

## 11. Newsletter Edition and provider boundary

`NewsletterEdition` is a typed Communications aggregate, not a giant duplicated HTML blob and not a Story or News record. It owns edition identity/slug, issue label, internal title, intro/editor note, planned web/send times, candidate/web-release/delivery states, ordered blocks, revision/approval history, and delivery/archive snapshots.

V1.1 blocks are an explicit closed union: `EDITOR_NOTE`, `STORY_REFERENCE`, `NEWS_REFERENCE`, `PROJECT_REFERENCE`, `EVENT_REFERENCE`, `CAMPAIGN_REFERENCE`, `RESTORE_REFERENCE`, `CUSTOM_TEXT`, and `CTA`. Reference blocks store the selected canonical target and display context, not a copied full article. Custom text uses the Newsletter allowlist in section 13. When an Edition is approved for web publication or delivery, `NewsletterEditionSnapshot` freezes block order, rendered/validated custom text, target snapshot/version or public projection identity, media usages, URLs, renderer version, and approval hash. This protects an archive or delivered issue from later edits to an article.

The Edition uses the same concepts of immutable revisions, exact-hash approval, scheduling, media readiness, audit, and preview as the publication kernel, through typed Newsletter services rather than forcing a News/Story detail record. It keeps four axes separate: candidate workflow (`DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `PENDING_APPROVAL`, `APPROVED`); web-release state (`UNPUBLISHED`, `SCHEDULED`, `PUBLISHED`, `WITHDRAWN`, `SUPERSEDED`); web discovery disposition (`ACTIVE`, `ARCHIVED`); and provider-delivery state (`NOT_REQUESTED`, `QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`). `SENT` is recorded only from an idempotent, verified provider result, never a browser redirect.

Habitat owns editorial content and editions. DonorView owns subscriber membership, consent, suppression, and mailing-list truth. The future `NewsletterDeliveryPort` accepts a frozen edition payload and configured audience/destination reference; an adapter can target DonorView if account capability proves adequate, or another approved delivery provider later. It must return a privacy-safe aggregate receipt/status rather than copy subscriber data locally. V1 includes only a newsletter signup handoff and may display an unavailable/empty archive; it does not implement sending, subscriber import, or a shadow list.

## 12. Editorial calendar and Communications Package decision

V1 persists only authoritative source dates: Story/News publication schedules, News relevance end times, future Newsletter web/send schedules, Event occurrence dates, and Campaign launch/milestone dates. Publication dates and business/event dates remain explicitly typed and are never interchangeable.

V1.1 may add a read-only derived calendar projection with source kind/id, date kind, UTC instant plus editorial time zone, source state, public/internal visibility, responsible owner, and a permission-checked deep link to the authoritative editor. It is a recomputable query/read DTO, not a `CalendarItem` aggregate or second schedule store. Drag-to-reschedule is deferred; a later calendar action must invoke the source domain’s ordinary command, approval invalidation, concurrency, and audit rules rather than mutate a calendar row.

No Communications Package entity is justified. Project, Program, Campaign, Event, and public Grant acknowledgment records already anchor related Stories, News, media, and future editions. A Package becomes eligible for a later ADR only when one cross-anchor editorial grouping demonstrates its own owner, lifecycle, ordered membership, public presentation, permissions, and behavior that those anchors plus curated placements cannot express.

## 13. Media use and V1 rich text

### MediaAsset and contextual MediaUsage

`MediaAsset` owns immutable file/version metadata: opaque storage key, checksum, server-determined file/type/size/dimensions/duration, processing and scan state, access class, provenance/source, creator/credit, rights/consent status and evidence reference, uploader, and public eligibility. The original asset is preserved under its access/retention policy. A public asset must be `READY` and `CLEARED`; moving a private draft asset public is a controlled copy/publication action, never an ACL shortcut.

`MediaUsage` is a typed contextual join, owned by an eligible Story/News revision, AuthorProfile, or NewsletterBlock. It stores use role (`HERO`, `THUMBNAIL`, `INLINE`, `GALLERY`, `SOCIAL`, `AUTHOR_PORTRAIT`, `NEWSLETTER`), order, crop/focal-point instructions, contextual alt text or decorative decision, caption, credit display, and contextual use/consent restrictions. V1 ContentPlacement renders the selected target snapshot and cannot supply an unapproved media override. Raw `SubmissionMedia` remains a separate private intake record; only explicit acceptance, rights review, controlled asset promotion, and Story-revision selection create a normal MediaAsset/MediaUsage. Snapshot media data freezes asset version and usage presentation. One approved asset can therefore have different truthful alt/caption treatment across a Story, News card, and author portrait without copying its provenance.

Alt text is required for meaningful visual use and must describe the asset in that usage context; decorative treatment requires an explicit decision. Caption/credit does not replace alt. Neither may expose private disability, applicant status, precise location, household, or case information. Video/audio requires captions/transcript before publication where applicable. V1 does not treat an asset-library filename or global alt string as sufficient.

### Rich-text capability

The canonical representation is the schema-versioned Tiptap/ProseMirror JSON required by [ADR-0007](../adr/0007-structured-rich-text.md). Server validation occurs on save, submit, approval, and snapshot publication. Raw HTML, MDX, executable code, signed URLs, arbitrary iframe markup, or arbitrary component props are prohibited.

| Content type | V1 allowed nodes | Explicitly deferred |
| --- | --- | --- |
| Story | paragraph; heading levels 2–3; ordered/bulleted lists; blockquote; pull quote with attribution; image; gallery; approved CTA; divider; approved external link | callout, statistic, related-content card, embedded video, arbitrary layout/columns, raw HTML |
| News | paragraph; heading level 2; ordered/bulleted lists; blockquote; image; approved CTA; divider | galleries, pull quote, callout, statistics, related-content card, embedded video, arbitrary layout/columns |
| Newsletter `CUSTOM_TEXT` | paragraph; heading level 2; ordered/bulleted lists; image; approved CTA; divider | Story/News reference cards encoded as rich text, raw HTML, video embeds, arbitrary layout |
| Site Notice | plain paragraphs and one validated CTA only | headings, media, embeds, arbitrary rich text |

Marks are limited to emphasis, strong, and validated links. Link protocols are `https`, `mailto`, and `tel` only; external hosts may be allowlisted where an embed/CTA policy requires it. Images reference an approved `MediaUsage`/asset version rather than a user-supplied URL. CTA nodes use a typed destination reference or validated external URL and accessible label. Every node has server-owned accessible rendering rules; content preview uses the same renderer. A future embed must name an approved provider, privacy/accessibility behavior, responsive rendering, fallback transcript/title, and sanitization rule before it joins an allowlist.

## 14. Relations, related content, search, SEO, and public IA

### Typed relationships and related content

Communications uses normal typed joins such as `StoryProjectRelation`, `NewsEventRelation`, `PublicationPartnerRelation`, and `PublicationRelatedPublication`. Each relation records source revision, relation role, optional editorial order, and public-safe eligibility; snapshot creation freezes the resolved public relation. A schema may share a narrow relation base only if each target has an explicit FK/check constraint and type validation. Arbitrary `subjectType/subjectId` references are not acceptable for domain relationships.

Related content uses two tiers:

1. **Curated:** editors may select/order a small set of explicitly related published Story/News items and domain records on a revision. These appear first when eligible.
2. **Derived fallback:** when curated items are absent or insufficient, query eligible public snapshots sharing a real Project, Program, Campaign, Event, Partner, or category; prefer recency for News and relevance/recency for Story. Never derive from unpublished/private records or generic tags.

Related-content resolution excludes the current item, withdrawn/expired/archived ineligible targets, duplicates, and public targets lacking their own approval. Relationships make future initiative grouping possible: a Project, Campaign, Event, Program, or public Grant acknowledgment is normally the grouping node. A Communications Package is not created until one cross-cutting editorial grouping has an independent lifecycle, owner, membership curation, public presentation, and behavior that those existing anchors cannot supply.

### Public URLs, SEO, search, and discovery

Recommended URL shapes are `/stories`, `/stories/{slug}`, `/stories/category/{categorySlug}`, `/stories/author/{authorSlug}`, `/news`, `/news/{slug}`, `/news/archive`, `/newsletter`, `/newsletter/{editionSlug}`, and `/share-your-story`. These are recommendations, not a frozen global navigation or legacy-URL decision. Slug history maps prior public slugs to canonical current routes with one-hop redirects. A withdrawn item is not redirected to an unrelated page.

Story detail exposes `Article` structured data; News detail exposes `NewsArticle` when that public meaning is accurate; a published Newsletter web edition may use `Article` when the visible page supports it. An AuthorProfile page may expose `ProfilePage` with an approved `Person` or `Organization` as `mainEntity` only when the visible page genuinely profiles that creator. Standalone Organization markup belongs on the homepage/about organization surface, while an Article may identify the publisher accurately; do not scatter a redundant standalone Organization object across every page. `BreadcrumbList` follows the visible user hierarchy rather than blindly copying a URL. Structured data uses snapshot values for headline, description, image, every visible author, `datePublished`, and meaningful `dateModified`; publication dates never impersonate the date of an Event described in the article. Site Notices and Story Submission never claim Article markup. Structured data is validation/supporting metadata, not a promise of a search rich result. Canonical URL, Open Graph/Twitter-compatible sharing metadata, and social image resolve from the snapshot; a missing valid social image is a warning where a visual fallback exists, not a reason to expose a draft.

Published, indexable Stories/News and eligible public web newsletter editions appear in sitemap/search. Expired or archived items with lasting historical value remain eligible but show their status and rank behind current material; an explicit `noindex` decision removes them. Withdrawn content is removed from sitemap and every search index. V1 site search uses PostgreSQL full-text search over directly addressable, indexable public snapshots: headline, deck/summary, body plain text, author display name, category, and approved relation labels. It excludes drafts, previews, internal notes, submission intake, private media metadata, noindex records, and withdrawn items. An external search vendor needs demonstrated scale or relevance need.

RSS/Atom feeds are V1.1: public current News feed first, then Stories if editorially useful. A feed must use snapshots, canonical URLs, public media rules, and the same expiration/withdrawal eligibility query as its index.

Primary verification: [Google Article/NewsArticle guidance](https://developers.google.com/search/docs/appearance/structured-data/article), [ProfilePage guidance](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [publication-date guidance](https://developers.google.com/search/docs/appearance/publication-dates), [BreadcrumbList guidance](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [Organization guidance](https://developers.google.com/search/docs/appearance/structured-data/organization), and [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html).

## 15. Permissions, audit, and validation feedback

All protected operations use database-backed capability checks at the use-case boundary as required by [the permissions architecture](permissions.md); menu visibility is only a convenience. Recommended stable capability families are:

| Capability family | Covers |
| --- | --- |
| `communications.dashboard.read`, `communications.queue.read`, `communications.calendar.read` | Capability-filtered editorial work views; Calendar read is used only when the V1.1 projection exists |
| `stories.create`, `stories.read.draft.own`, `stories.read.draft.any`, `stories.edit.own`, `stories.edit.any`, `stories.submit`, `stories.review`, `stories.approve`, `stories.schedule`, `stories.publish`, `stories.withdraw`, `stories.archive` | Typed Story actions |
| `news.create`, `news.read.draft.own`, `news.read.draft.any`, `news.edit.own`, `news.edit.any`, `news.submit`, `news.review`, `news.approve`, `news.schedule`, `news.publish`, `news.withdraw`, `news.archive` | Typed News actions |
| `newsletter.create`, `newsletter.read.draft`, `newsletter.edit`, `newsletter.submit`, `newsletter.review`, `newsletter.approve`, `newsletter.schedule`, `newsletter.publish`, `newsletter.withdraw`, `newsletter.archive` | Typed Newsletter Edition and public web-edition actions when enabled; provider send/configuration remains separate and undecided |
| `media.upload`, `media.edit`, `media.rights.clear`, `media.public.use`, `media.private.read`, `media.private.manage` | Media duties separated from normal authoring |
| `communications.placements.manage`, `communications.notices.manage`, `communications.authors.manage`, `communications.categories.manage`, `communications.submissions.review`, `communications.requirements.override` | Curation, supporting aggregates, and the explicit audited policy override |

Suggested default bundles are: **Contributor** (Queue read scoped to owned work; create, own draft read/edit, submit, permitted uploads; no Dashboard), **Editor** (Queue/Dashboard read, any-draft read/edit/review, authors/categories and routine media metadata), **Publisher** (Queue/Dashboard read, schedule/publish/withdraw/archive approved work, placements/notices; no editing/review/approval by default), **Communications Manager** (Editor + Publisher + independent approval subject to separation of duties + submission/media management), **Admin** (Communications Manager plus separately assigned platform/domain duties), and **Super Admin** (managed current capability set plus controlled fresh-auth override). These are assignment presets, never hard-coded authorization identities.

Audit consequential events: revision submission, change request, approval/rejection, policy requirement satisfaction/waiver, schedule create/cancel/fail/execute, snapshot publish, expire, archive, withdraw, restore, placement changes, Site Notice changes, media rights clearance/publication, submission triage/conversion/purge, and Super Admin override. Do not audit every keystroke or autosave. Events record identifiers, actor/service principal, timestamp, outcome, reason where required, correlation/idempotency context, and redacted before/after summary. They never copy body text, protected submission data, consent evidence, tokens, signed URLs, or secrets.

### Blocker, warning, and information classes

| Class | Examples | Behavior |
| --- | --- | --- |
| Hard publication/operation blocker | no current exact approval; missing author or other required typed/SEO field; slug collision; invalid rich text/CTA; selected media uncleared/not-ready or missing contextual alt/decorative decision; unresolved required consent/policy requirement; invalid/non-public relation; release outside allowed state; overlapping singleton placement; attempt to place an unpublished/expired/archived/withdrawn target; snapshot generation failure | Server refuses the affected submit/approve/schedule/publish/place operation. If an active placement target later becomes ineligible, public resolution immediately uses the safe fallback/omission and creates an actionable quality event. |
| Warning | no social image when a safe fallback exists; no optional Story hero or News thumbnail when the safe text-first fallback exists; sparse but valid SEO description; no optional related content/category; News expiration soon; external link health check stale/failed; placement ending soon | Visible in editor/Queue/Dashboard; authorized user may proceed unless a policy promotes it. |
| Informational | reading-time estimate; successful asset processing; archive age; placement fallback in use; upcoming non-conflicting schedule | Inform but do not interrupt workflow. |

Validation is typed and contextual. It should be strict at the publication safety boundary and helpful while drafting; it must not turn uncertain or optional editorial choices into noisy blockers.

## 16. Administrative and public information architecture

V1 administrative navigation is one shallow **Communications** group: Dashboard, Stories, News, Publication Queue, Homepage, Media, Authors, Categories, Site Notices, and Story Submissions. Newsletter is absent—not a dead/disabled item—until its V1.1 typed slice is delivered, when it becomes a peer rather than a Story/News subtype. Calendar is V1.1/future and should be a derived view, not a required menu item.

- Contributors see their permitted Story/News work, Queue views, and media upload affordances; they do not see approval, placement, rights-clearance, or submission-triage controls without capability.
- Editors see Dashboard/Queue review work and permitted authors/categories/media controls, but no final publish/placement controls unless separately granted.
- Communications Managers see Dashboard, Queue, Homepage placements, notices, submissions, and their granted workflow actions.
- Super Admin sees the same area plus explicit override/audit affordances; it does not receive private grant/applicant views through Communications.

Public experiences are a Story landing/category/author/detail path, News latest/featured/detail/archive path, newsletter archive/web-edition path when enabled, accessible global/local Site Notice rendering, and a public Story Submission form. Public navigation placement remains a design decision. Detail pages make type, author, date, update/expiration/archival context, category, meaningful relationships, related content, and next action understandable without leaking internal workflow.

## 17. Aggregate map and projection/privacy model

| Aggregate/root | Purpose and lifecycle | Major relationships | Classification and public behavior |
| --- | --- | --- | --- |
| `Story` + shared `Publication` | Evergreen typed editorial work; revision/snapshot workflow plus deliberate archive/withdrawal | typed domain relations, author/category/media/CTA | Drafts Internal/Confidential as content requires; only active eligible snapshot is Public; archived snapshot remains direct historical content by policy. |
| `NewsItem` + shared `Publication` | Timely typed update; optional expiration, archive, withdrawal | Event/Project/etc., author/category/media/CTA | Same as Story; expired/archive/withdrawal rules control public projection. |
| `NewsletterEdition` | Curated edition, blocks, schedule, web/delivery snapshots | public canonical references, media, delivery port | Internal drafts; approved web snapshot Public; subscriber data never joins this aggregate. |
| `AuthorProfile` | Public byline/profile independent of account | optional Person/AdminUser, portrait usage | Public only when profile visible; account link/private contacts Confidential. |
| `EditorialCategory` | Governed flat classification | publication revision/snapshot | Public active label/description; management/audit Internal. |
| `ContentPlacement` | Typed curated public-region choice/window | Story/News/Project/Campaign explicit FKs | Internal command/audit; resolved eligible target appears Public. |
| `PublicationResponsibility` | Current editorial owner and optional reviewer/approver assignments | active AdminUsers and Publication | Internal only; scopes `own` access and Queue responsibility but never becomes byline or public snapshot data. |
| `SiteNotice` | Small time-bounded operational notice | optional typed CTA | Internal while authored; active safe projection Public. |
| `PublicStorySubmission` | Separate public intake and triage | SubmissionMedia; restricted provenance on conversion | Confidential; never public/readable in search/cache. |
| `MediaAsset` / `MediaUsage` | Immutable approved asset/version and contextual presentation | revision/snapshot, AuthorProfile, NewsletterBlock | Public only after readiness/clearance and snapshot use; raw SubmissionMedia remains separate private intake until explicit promotion. |
| Workflow/approval/schedule/snapshot/audit records | Shared integrity and historical evidence | exact revision/hash, actors/service principals | Snapshot is Public only when active/eligible; all authoring evidence Internal/Confidential; audit is restricted to authorized users. |

Public DTOs are snapshot-specific allowlists. They contain only public author fields, frozen media/context, approved public target summaries, and public editorial text. They never traverse to AdminUser, original submission, consent evidence, private Person data, private Grant records, applicant/case records, or unapproved related records. Consent revocation/withdrawal ends future public delivery promptly while restricted evidence and immutable audit history follow their retention/hold policy.

## 18. V1, V1.1, and future split

| Area | V1 | V1.1 / near term | Future |
| --- | --- | --- | --- |
| Stories | typed model, shared kernel, authored public index/detail, archive/withdraw/restore semantics, relations, categories, AuthorProfile, V1 rich text | RSS, more relation presentation, audio/transcript | multilingual, advanced media/story formats |
| News | typed model, lifecycle/expiration/archive/withdrawal, index/detail/archive, Featured News placement | RSS, defined pin policy if justified | press-release subtype/syndication |
| Queue/Dashboard | listed V1 views, actionable modules, no vanity metrics | Newsletter work, calendar entry point, verified link signal | analytics/recommendation dashboards |
| Placements/homepage | six code-defined singleton V1 slots and hybrid sections | additional specifically designed slots | general placement catalog only if repeated needs prove it |
| Authors/categories | AuthorProfile, flat controlled category, no tags | category merge UX/analytics | carefully governed supplemental vocabulary if evidence warrants |
| Site Notices | small scoped notice/banner | more controlled target areas | segmentation, push/notification integrations |
| Story Submission | secure text intake/triage/conversion after approved owner, retention/privacy text, and abuse controls; uploads only after private-upload/consent controls | safer follow-up workflow/reporting | separate News tip intake only after design review |
| Newsletter | signup handoff; structure/port contract may be built with no delivery | Edition/block/web archive/delivery after provider confirmation | personalization, automation, subscriber ownership change by decision |
| Calendar | scheduling fields queryable | derived read-only calendar | controlled drag-to-reschedule after workflow design |
| Packages | typed relationships only | evaluate a recurring unmet grouping use case | Package aggregate after independent lifecycle proof |
| Rich text/media | V1 allowlists, contextual usage, rights gate | approved embeds/callouts/statistics/cards | layout/page-builder behavior is out of scope |

## 19. Communications implementation slices

These slices refine, but do not replace, the accepted platform roadmap. Slice 2 remains the shared migration/kernel owner; no parallel worker independently changes the shared schema.

| Slice | Scope, dependencies, and acceptance | Model / parallelization / principal risk | Explicitly defer |
| --- | --- | --- | --- |
| C1 — Publishing kernel contract | After platform shell: shared typed publication spine, immutable revision/hash/approval/snapshot/schedule/withdraw semantics, shared Story/News discovery disposition and restore-through-successor, internal responsibility assignments, audit hooks, public-query boundary, and test fixtures. Accept only when real PostgreSQL migrations and adversarial approval, scheduler, public-draft, archive/restore, and own/any-scope tests pass. | Sol coordinates schema/concurrency/security; Terra can implement isolated renderer/test work after contracts freeze. Risk: generic blob or stale approval. | UI dashboard, rich editing polish, all placements except contract. |
| C2 — Media and authoring safety | Storage adapter integration, MediaAsset/Usage, rights/contextual-alt gates, V1 structured schema/renderer, AuthorProfile/category controls. Depends on C1 and upload-provider safety decisions. Accept when private/public delivery is isolated, unsafe/unready usage cannot snapshot, author/category cardinality is enforced, and editor/renderer/hash parity tests pass. | Terra leads bounded work; Sol reviews public/private and snapshot invariants; renderer, media processing, and negative tests can parallelize after contracts freeze. Risk: unsafe upload or snapshot drift. | Video/embeds, generic media library/public gallery. |
| C3 — Stories | Story typed validation, authoring/review/public index/detail/preview, shared archive/withdraw/restore presentation, relations, and search DTO. Depends on C1–C2 and authorization shell. Accept when the typed journey publishes only the approved snapshot, successor drafts stay private, archived Stories leave ordinary discovery while retaining the approved direct historical behavior, restoration uses an approved successor, consent/relation negatives pass, and public SEO/accessibility/search journeys pass. | Terra; public/admin/test journeys may parallelize after contracts freeze. Risk: consent/private context leak. | Submissions, newsletter, packages. |
| C4 — News and placements | News expiration/archive/withdrawal behavior, News public routes/archive, six Content Placement definitions, and homepage hybrid resolution. Depends on C1–C3; Project/Campaign slots stay safely empty until their public projections exist. Accept when missed/duplicate jobs, time zones, restore-through-successor, singleton overlap, target ineligibility, audit, and every fallback/omission are tested. | Terra; public News, placement UI, and tests can parallelize after target contracts; Sol reviews schedule/window/collision semantics. Risk: stale featured/expired item. | Pinning, generalized slots, calendar. |
| C5 — Queue and Dashboard | V1 saved views, four Dashboard modules, focused action routing, capability filtering, and quality classifications. Depends on C1–C4. Accept when every view/module reconciles to authoritative queries, own/any and negative scopes pass, confidential intake never appears, and counts/deep links match their destination. | Terra; read-model, presentation, and adversarial authorization tests may parallelize. Risk: dashboard becomes alternate workflow truth or reveals confidential data. | Analytics/vanity metrics, broad filters. |
| C6 — Notices and submissions | Site Notices plus public Story Submission intake/retention/triage/conversion after named owner and policy approval. Text-only intake may launch first; private uploads require the full upload/consent controls. Depends on C2/C3 and abuse controls. Accept when notices stop exactly at end time, intake is non-enumerable/rate-limited/private, conversion creates a distinct Story draft, retention jobs work, and participant/minor/media paths remain blocked pending clearance. | Terra; Notice UI, text intake, and retention tests can parallelize after contracts; Sol reviews intake/security boundary. Risk: collecting protected data or unsafe upload. | Public News tips, applicant-like workflow. |
| C7 — Newsletter Edition | Typed edition/blocks/revision/snapshot and public web archive after archive policy; provider port/adapter only after DonorView/provider confirmation. Depends on C1/C2; delivery alone depends on a selected contract. Accept when block order and referenced versions freeze, later source edits do not mutate an edition, no subscriber list is copied, web publishing is independently authorized, and `SENT` can arise only from an idempotent verified provider result. | Terra; web edition and provider-contract tests can parallelize only after boundaries freeze; Sol reviews delivery idempotency/privacy. Risk: subscriber shadow database or mutable archive. | Personalization, automation, subscriber sync. |
| C8 — Calendar and evaluated extensions | Derived read-only calendar, RSS, additional approved rich nodes/placements, and package evaluation. Depends on proven user need and preceding audit data. Accept when calendar rows reconcile to source dates and all changes invoke source commands; feeds use snapshot eligibility; any new node/slot/package has its own accepted semantics and tests. | Terra for bounded UX/feed work; Sol for any new provider/security/domain boundary. Risk: premature abstraction. | Drag scheduling and package entity unless separately accepted. |

Every slice includes WCAG 2.2 AA checks, capability-negative tests, public/private query tests, snapshot/public-cache tests, audit assertions, and documentation updates proportional to the change. C1/C4 specifically test changed-after-approval, self-approval denial, duplicate/missed scheduler execution, DST/window boundaries, expiration, withdrawal, placement ineligibility, and cache/search removal.

## 20. Open decisions that do not block implementation

- Final public Stories/Journal label, final category names, and global navbar placement.
- Editorial staffing assignments, placement copy/art direction, and exact Dashboard visual layout within the specified action modules.
- Newsletter delivery provider and DonorView account capability; this blocks delivery integration, not the platform or editorial model.
- Human verification of individual stories, Board/reStore facts, media rights, grants, and legacy content; unverified facts remain draft/unavailable.
- Later policy owners’ approval of detailed consent and public-submission retention text; this blocks public intake launch, not C1–C5.

## 21. Implementation readiness

**COMMUNICATIONS DOMAIN READY FOR APPLICATION SCAFFOLD: YES.**

There is no remaining Communications architectural or security blocker to Slice 1. The next assignment is **Slice 1 — Application Foundation and Scaffold**. Treat this Communications specification as frozen enough for implementation; changes to durable publication, privacy, storage, provider, or authorization boundaries require the ADR discipline in the repository operating contract.
