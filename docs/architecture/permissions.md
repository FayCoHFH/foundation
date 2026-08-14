# Authorization and permissions

Status: Accepted policy baseline
Last reviewed: 2026-08-14

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
- `stories.read.draft`, `stories.create`, `stories.edit`, `stories.submit`, `stories.review`, `stories.approve`, `stories.publish`, `stories.schedule`, `stories.withdraw`
- `news.read.draft`, `news.create`, `news.edit`, `news.submit`, `news.review`, `news.approve`, `news.publish`, `news.schedule`, `news.feature`, `news.archive`, `news.withdraw`
- `newsletter.manage`
- `media.manage`, with separate `media.private.read` and `media.private.manage` where private assets exist
- `communications.categories.manage`
- `communications.authors.manage`
- `communications.queue.read`
- `communications.placements.manage`

Creating/editing, reviewing, approving, publishing, scheduling, and placing are deliberately independent. `news.feature` authorizes News placement eligibility/selection only through the placement service; it does not bypass publication eligibility.

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
- Commerce fulfillment cannot mark an order paid; only verified Stripe state/reconciliation may advance payment state.
- Integration secret managers need not be content publishers or applicant/grant readers.
- Private grant and applicant exports require narrowly granted capabilities and an audit reason.

A Super Admin may perform an emergency override where the product explicitly supports one. The override requires a fresh session, explicit reason, prominent audit event, and notification/review path. “Super Admin” is implemented as a managed capability set plus override policy, not hard-coded bypasses scattered through the application.

## Suggested initial role presets

Presets accelerate assignment; they are not code-level identities.

| Preset | Typical capabilities | Deliberate exclusions |
| --- | --- | --- |
| Communications Author | Create/edit/submit assigned Stories and News; manage allowed media | Approve, publish, schedule, placements, users, secrets |
| Communications Editor | Review/edit Communications, manage authors/categories/media | Final approval by default; users/secrets/private casework |
| Communications Approver | Approve and schedule eligible content | Self-approval; integration secrets |
| Communications Publisher | Publish/withdraw, manage placements and queue | User/security administration unless separately granted |
| Program Manager | Programs, Projects, Events, Campaigns, public impact drafts | Communications approval; donor/gift details; secrets |
| Commerce Manager | Catalog, orders, fulfillment | Payment-state override; donation records; secrets |
| Grant Administrator | Private and public grant workflows as explicitly assigned | Applicant casework; user/security administration |
| Auditor | Read audit and approved operational reports | Mutations and secret values |
| Super Admin | All current capabilities and controlled override | No implicit access to future sensitive domains until those capabilities exist and are assigned |

Small staffing may require one person to hold multiple presets. The self-approval and exact-revision rules still apply unless a logged Super Admin override is necessary.

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
- draft submission, review, approval/rejection, scheduling, publishing, withdrawal, archive, expiration override, and placement changes;
- media upload/classification/publication/deletion;
- integration configuration, secret rotation (never the secret value), sync/reconciliation;
- product/order/refund/fulfillment changes;
- public grant projection and all future private grant/applicant reads, exports, document access, and destructive actions.

Audit payloads use identifiers and redacted summaries. They must not contain OAuth tokens, session tokens, webhook secrets, full private documents, payment data, or unnecessary PII.

## Required authorization tests

Each protected use case needs positive and negative tests for active grant, missing grant, suspended user, stale/revoked session, cross-record scope, and any separation-of-duties rule. Publication tests must prove that editing after approval prevents publishing and that an ineligible item cannot be featured. Future private domains require tests that public routes, search, caches, analytics, and media delivery cannot reach private data.
