# Authorization and permissions

Status: Accepted policy baseline
Last reviewed: 2026-08-15

## Core policy

Google authentication establishes identity only. Administrative access requires an active local `AdminUser` and an effective local capability grant. All server-side use cases deny by default and check capabilities at execution time; neither UI visibility, route location, Google Workspace membership, nor a role name authorizes an action.

Roles are editable bundles of capabilities. Application code checks capabilities, not role strings. Capability names are stable contracts even when role presets evolve.

## Identity and access lifecycle

1. An authorized administrator creates an expiring invitation for an intended Google identity and assigns an initial role bundle.
2. The invitee authenticates with Google. The application validates the provider response, stable Google subject, verified email, approved Workspace hosted-domain claim, and invitation binding.
3. Acceptance activates the local principal and records the external identity link. A Google account that is valid but not invited/active receives no admin access.
4. Suspending or revoking an AdminUser invalidates all active sessions and effective assignments.
5. Restoring access is a separate audited action; it does not silently restore expired or explicitly revoked grants.

The initial Google scopes are `openid`, `email`, and `profile`. Drive, Gmail, Calendar, and other Workspace permissions are not implied by sign-in.

## Capability catalog direction

Names may be mechanically refined before migrations, but separation must be preserved.

### Communications

- `communications.dashboard.read`
- `communications.queue.read`, `communications.calendar.read`
- `communications.placements.manage`, `communications.notices.manage`, `communications.submissions.review`
- `stories.create`, `stories.read.draft.own`, `stories.read.draft.any`, `stories.edit.own`, `stories.edit.any`, `stories.submit`, `stories.review`, `stories.approve`, `stories.schedule`, `stories.publish`, `stories.withdraw`, `stories.archive`
- `news.create`, `news.read.draft.own`, `news.read.draft.any`, `news.edit.own`, `news.edit.any`, `news.submit`, `news.review`, `news.approve`, `news.schedule`, `news.publish`, `news.withdraw`, `news.archive`
- `newsletter.create`, `newsletter.read.draft`, `newsletter.edit`, `newsletter.submit`, `newsletter.review`, `newsletter.approve`, `newsletter.schedule`, `newsletter.publish`, `newsletter.withdraw`, `newsletter.archive`
- `media.upload`, `media.edit`, `media.rights.clear`, `media.public.use`, with separate `media.private.read` and `media.private.manage` where private assets exist; confidential Story Submission clearance/evidence issue, process, list, delivery, replacement, and removal use `communications.submissions.review`, while restoring eligibility additionally requires `communications.media.restore_eligibility`
- `communications.categories.manage`
- `communications.authors.manage`
- `communications.requirements.override` for an explicit, audited exceptional publication-requirement override only

The `own` scope is evaluated only from the required internal `PublicationResponsibility.editorialOwnerAdminUserId`, never from a client-supplied author/byline, revision creator, or reviewer assignment. Creation defaults ownership to the active creator unless an authorized any-scope command assigns another active user; owner reassignment requires typed `edit.any` and audit. Reviewer/approver assignments organize Queue responsibility but grant no capability. Creating/editing, reviewing, approving, publishing, scheduling, archiving/withdrawing, media clearance, and placing are deliberately independent. Placement management acts only through `ContentPlacement`; it does not grant a permanent “featured” state or bypass target eligibility. `newsletter.publish` covers an approved public web-edition snapshot only. Newsletter delivery-provider configuration and send execution are not Communications capabilities until a provider decision establishes their security boundary.

`communications.placements.manage` governs assignment, replacement, future
scheduling, current clearing/ending, and cancellation of a future assignment.
It does not authorize arbitrary placement keys, bypass the Story/News target
matrix, make an unpublished or otherwise ineligible target public, or expose
internal placement audit data through public resolution. Capability enforcement
is server-side; hiding the curation route or its controls is not authorization.

`communications.notices.manage` governs Site Notice creation, administrative
reads, edits, publication, and withdrawal. Public effective-notice reads are
unauthenticated and return only the bounded safe projection; they never expose
actors, versions, lifecycle internals, or audit metadata.

`communications.submissions.review` governs confidential submission list/detail
reads, lifecycle transitions, and internal review-note updates. Each service
operation checks the active local administrator and capability; list DTOs omit
email, story text, and review notes, while detail DTOs never include raw audit
rows or provider/request metadata. The C6B-1A receive service is unexposed and
does not grant administrative access.

`communications.submissions.restore_spam` is a separate higher-authority
capability. The initial policy grants it to Super Admin only; ordinary
submission reviewers do not receive it. Restoration additionally requires the
review capability, an active administrator, the expected version, and the
dedicated atomic audit action.

C6A-2B browser validation verified the capability boundary with an authorized
Communications Manager, a signed-in editor without the capability, and an
anonymous visitor. Direct protected navigation remained denied or redirected,
while public effective reads remained unauthenticated and projection-only.

C6B-2B browser validation additionally covered the authorized reviewer,
authenticated user without `communications.submissions.review`, and anonymous
visitor across inbox/detail navigation, direct denial, lifecycle actions,
review-note writes, and stale-version conflicts. Dashboard, Queue, Story, News,
and Site Notice capabilities did not imply confidential submission access.

### Projects, programs, and public impact

- `programs.manage`
- `projects.manage`
- `partners.manage`
- `impact.manage`, `impact.verify`, `impact.publish`
- `grants.public.manage`, `grants.public.publish`

### Community engagement and development

- `campaigns.manage`, `campaigns.publish`, `campaigns.destinations.manage`
- `events.manage`, `events.publish`, `events.registrations.configure`
- `integrations.donorview.read`, `integrations.donorview.configure`, `integrations.donorview.sync`

### Leadership and governance

- `people.manage`
- `board.manage`
- `committees.manage`

### Operations and platform

- `restore.manage`
- `shop.catalog.manage`, `shop.orders.read`, `shop.orders.fulfill`, `shop.refunds.request`
- `users.read`, `users.invite`, `users.activate`, `users.roles.assign`, `users.suspend`, `users.restore`
- `permissions.manage`
- `integrations.read`, `integrations.configure`, `integrations.secrets.manage`
- `audit.read`
- `settings.manage`

### Future sensitive capabilities

- `grants.private.read`, `grants.private.manage`, `grants.private.documents.manage`, `grants.private.export`
- `applicants.read`, `applicants.manage`, `applicants.documents.read`, `applicants.documents.manage`, `applicants.notes.manage`, `applicants.export`

These future capabilities must not be included in broad content-admin roles by default. Sensitive reads and exports are audited.

## Separation of duties

- A normal author cannot approve their own submitted revision.
- An approver cannot approve a revision they materially edited after submission without a second qualified approver.
- Publishing requires an exact approved revision/hash; a later edit invalidates approval.
- Placement managers cannot feature unpublished, expired, withdrawn, or otherwise ineligible content.
- Conversion of a public submission into a Story draft requires `communications.submissions.review`; it grants no permission to publish the submitter's raw intake or private upload.
- A clearance/second-approval/legal-review requirement is evaluated for the exact revision before approval or publishing. A normal capability grant may satisfy only the requirement it names; exceptional override is an explicit, audited policy action.
- Commerce fulfillment cannot mark an order paid; only verified Stripe state/reconciliation may advance payment state.
- Integration secret managers need not be content publishers or applicant/grant readers.
- Private grant and applicant exports require narrowly granted capabilities and an audit reason.

A Super Admin may perform an emergency override where the product and owning policy explicitly support a waivable requirement. The override requires a fresh session, explicit reason, prominent audit event, and notification/review path. It cannot bypass authorization, invalid schema/relations, exact-hash approval, unsafe media, or consent/rights evidence that policy or law makes mandatory. Story Submission media eligibility restoration is a separate seeded capability, not a role-name check, and still requires the underlying eligibility evaluator to pass. “Super Admin” is implemented as a managed capability set plus override policy, not hard-coded bypasses scattered through the application.

## Suggested initial role presets

Presets accelerate assignment; they are not code-level identities.

| Preset | Typical capabilities | Deliberate exclusions |
| --- | --- | --- |
| Contributor | Queue read scoped to owned work; create, read/edit own, and submit assigned Stories/News; upload allowed media | Dashboard, any-record editing, review, approval, schedule/publish, placements, submissions, users, secrets |
| Editor | Queue/dashboard read; draft read/edit any; review and return work; manage assigned media, authors, and categories | Final approval, schedule/publish, placement management, user/security administration |
| Publisher | Queue/dashboard read; schedule, publish, withdraw/archive approved material; manage Site Notices and placements | Editing/review/approval merely by holding this preset; users, secrets, private casework |
| Communications Manager | Cross-type editorial work, approvals subject to separation of duties, scheduling/publishing, placements, notices, submission review, authors/categories/media, dashboard/queue | User/security administration, provider secrets, private casework unless separately granted |
| Admin | Organization-wide operational capabilities as assigned, including Communications Manager when needed | No automatic self-approval or requirement override; secrets/private casework remain separate grants |
| Program Manager | Programs, Projects, Events, Campaigns, public impact drafts | Communications approval; donor/gift details; secrets |
| Commerce Manager | Catalog, orders, fulfillment | Payment-state override; donation records; secrets |
| Grant Administrator | Private and public grant workflows as explicitly assigned | Applicant casework; user/security administration |
| Auditor | Read audit and approved operational reports | Mutations and secret values |
| Super Admin | Controlled, recently-authenticated override policy plus assigned current capabilities | No implicit access to future sensitive domains until those capabilities exist and are assigned |

Small staffing may require one person to hold multiple presets. The self-approval, exact-revision, and applicable-requirement rules still apply unless a logged Super Admin override is necessary. These presets describe defaults, not immutable role strings or authorization checks.

## Enforcement locations

- Perform a fast session-presence check at the routing edge only for UX/redirect purposes.
- Perform authoritative database session, active-user, and capability checks inside the server data-access/use-case boundary for every protected operation.
- Re-check authorization inside server actions and route handlers; they are public network entry points even if called from a hidden admin UI.
- Scope queries before fetching data. Do not load all records and then remove private fields in presentation code.
- Background/scheduled commands use a dedicated service principal with only the required command capability and a verifiable invocation mechanism.
- External webhooks authenticate as the provider through signature verification and are authorized only for their narrow ingestion command.

The [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication) likewise distinguishes optimistic route checks from secure database-backed authorization and recommends centralizing authorization in a data-access layer.

## Session and sensitive-action policy

- Better Auth database sessions are the revocable source of truth; cookie caching is disabled initially so suspension takes effect on the next protected request.
- Initial admin session maximum is 12 hours with no indefinite sliding renewal. Confirm usability and exact configuration in the authentication spike.
- Sensitive access/role changes, integration-secret changes, private exports, emergency publication overrides, and future applicant/private-grant document access require a recently authenticated session; reauthentication uses Google OIDC.
- Cookies must be Secure, HttpOnly, SameSite=Lax or stricter, host-only where practical, and never contain capabilities or private profile data as authoritative state.
- CSRF and origin protections provided by the authentication library remain enabled; mutation endpoints accept only intended methods/content types.

## Audit coverage

At minimum audit:

- invitation creation/cancellation/acceptance;
- login success/failure category, logout, session revocation, suspension/restoration;
- role/capability assignment and removal;
- draft submission, review, changes requested, approval/rejection, requirement satisfaction/override, scheduling, publishing, withdrawal, archive, expiration override, and placement changes;
- Site Notice and Newsletter scheduling/publication/withdrawal/archive changes; public-submission acceptance/conversion/rejection/retention actions;
- media upload/classification/rights clearance/publication/deletion;
- integration configuration, secret rotation (never the secret value), sync/reconciliation;
- product/order/refund/fulfillment changes;
- public grant projection and all future private grant/applicant reads, exports, document access, and destructive actions.

Audit payloads use identifiers and redacted summaries. They must not contain OAuth tokens, session tokens, webhook secrets, full private documents, payment data, or unnecessary PII.

## Required authorization tests

Each protected use case needs positive and negative tests for active grant, missing grant, suspended user, stale/revoked session, cross-record scope, and any separation-of-duties rule. Publication tests must prove that editing after approval prevents publishing and that an ineligible item cannot be featured. Future private domains require tests that public routes, search, caches, analytics, and media delivery cannot reach private data.
