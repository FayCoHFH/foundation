# C1 Story persistence

Status: implemented and locally verified on 2026-08-15. This is the first
vertical Communications kernel increment. It is intentionally private: no
public Story route, listing, search, snapshot, release, media, placement, or
News behavior is introduced here.

## Delivered contract

The PostgreSQL/Prisma model adds a narrow `Publication` spine with an exact-one
`Story` typed root, immutable `PublicationRevision` records, a single internal
`PublicationResponsibility` record, workflow transition history, and exact-hash
approval evidence. The Story candidate uses schema-versioned structured JSON;
the validation profile accepts only the small documented JSON node/mark set and
rejects raw HTML, unsafe links, unknown nodes, and oversized documents.

Each save creates a successor revision. Database triggers reject revision update
and deletion. A canonical SHA-256 hash covers only the versioned candidate
content (Story kind, headline, deck, excerpt, and body), never identifiers,
timestamps, actors, workflow state, or audit metadata. A successor clears the
current approval pointer; previous approval evidence remains append-only.

The private workflow is `DRAFT` → `IN_REVIEW` → `CHANGES_REQUESTED` →
`IN_REVIEW` → `PENDING_APPROVAL` → `APPROVED`; `SUBMITTED` is a transition
event, not a state. Every state-changing action uses an expected aggregate
version and candidate hash, writes the aggregate update, workflow history, and
audit event in one database transaction, and rejects stale/conflicting updates.

Editorial owner is an internal `AdminUser` relationship, distinct from any
future public byline. It is initialized to the creator and may be reassigned by
an `edit.any` actor with a reason and audit trail. All reads/mutations load an
active local principal and enforce the seeded Story capabilities plus own/any
scope at the service layer; no browser route is an authorization boundary.

Self-approval is denied when the approver created, owns, or materially edited
the candidate. This increment implements no override path: there is no
caller-supplied Super Admin flag or substitute authorization proof.

## Private admin surface

`/admin/communications/stories` is a private create entry point, with
`/new` and per-draft routes only. The surface provides structured form errors,
retains valid input on validation failure, announces outcomes, uses semantic
headings/labels, and keeps public Story routes absent. It is not an editorial
queue or Story index.

## Verification evidence

Focused tests cover candidate validation/hash stability and exclusions, workflow
matrix rules, immutable rows, exact approval/invalidation, self-approval denial,
authorization, stale and parallel writes, and transaction rollback. PostgreSQL
tests apply the committed migration and seed to an isolated disposable database.
Chromium/axe coverage proves the private contributor → editor → manager workflow
and denies a platform administrator without Story capabilities.

The slice was verified with formatting, lint, TypeScript, unit tests,
PostgreSQL integration tests, migration deploy/status/diff checks, idempotent
seed, production build, focused and full browser smoke suites, and `git diff
--check`. The local Prisma/pg adapter emits a non-failing pg 9 deprecation
warning for nested interactive-transaction query scheduling; it does not alter
test outcomes and should be reassessed on dependency upgrade.

## Deliberately deferred

Public snapshots/release/scheduling, archive/withdraw/restore, Story discovery,
News, media, authors/bylines, related entities, placements, queue/dashboard,
rich text beyond the safe minimal profile, and a database-backed Super Admin
self-approval override remain later Communications work. Future release code
must project an explicit public snapshot rather than exposing revision rows.
