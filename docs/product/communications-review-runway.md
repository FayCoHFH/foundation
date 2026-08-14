# Communications Domain Review Runway

## Purpose

The next human planning session is a **Communications Domain Product & Architecture Review**. This brief separates accepted direction from the decisions that still need focused design so the session can refine the domain without reopening the platform foundation or beginning application scaffolding.

## Accepted direction — do not reopen without new evidence

1. Communications is a first-class product domain encompassing Stories / Journal, News, Newsletter, Media, Authors, Categories, shared publication workflow, Publication Queue, and Communications Dashboard.
2. Stories and News are typed domains with different audience promises and lifecycle behavior.
3. They share appropriate infrastructure for revisions, authorship, review/approval, scheduling, publication snapshots, SEO, Media, related-domain references, and audit history.
4. The design must avoid both a meaning-erasing generic Content blob and separately duplicated editorial engines.
5. News requires an index, detail experience, latest presentation, Featured News, homepage presentation, scheduling, and optional expiration/archive behavior without silent deletion.
6. Featured News is a curated placement, not simply a permanent Boolean copied onto every record type.
7. The homepage is intentionally curated by authorized staff; its sections and sequence are not yet designed.
8. The Communications Dashboard is a required editorial command center; exact widgets are not yet specified.
9. Scheduling should preserve a future cross-type Communications calendar without implementing calendar-specific structures now.
10. Relationships should preserve a future Communications/Story Package direction without selecting a package name or model now.
11. Fayette Habitat owns communications content, revisions, workflow, public state, and placements. DonorView does not.
12. **LEGACY INDEPENDENCE:** Wix blog structure, labels, categories, routes, and page layouts do not define this domain.

## Domain promise

Communications should let staff answer four questions safely and quickly:

- What are we trying to communicate?
- What needs editorial action now?
- What exactly has been approved, scheduled, featured, or published?
- How does this communication connect people to the durable work, evidence, and next step behind it?

The public should be able to distinguish timely information from enduring narrative, recognize its date and authority, understand relevant context, and act without encountering stale or private material.

## Scope of the review

### Stories / Journal

Decide:

- the public naming hypothesis and how to test it;
- minimum Story anatomy and structured editorial elements;
- author/byline, date, update, and attribution policy;
- expected relations to Projects, Programs, People, Campaigns, Events, Grants, Partners, Media, ReStore, and Artists;
- preview, review, approval, schedule, publish, correction, withdrawal, and archival tasks; and
- what makes a Story evergreen rather than News.

Do not select an editor package merely to settle content design. Capture required authoring and rendering behavior first.

### News and Featured News

Decide:

- minimum News anatomy and concise-content guidance;
- publication/update date display;
- expiration defaults, archive behavior, “no longer current” messaging, and withdrawal distinction;
- urgency, pinning, and priority semantics, if any;
- Featured News placement scope, eligibility, timing, fallback, collision, and history;
- what happens when a featured item expires, archives, withdraws, or loses eligibility;
- related-media and related-domain rules; and
- whether/how historical News remains browsable and searchable.

Avoid treating “featured,” “pinned,” “urgent,” and “latest” as synonyms.

### Workflow and Publication Queue

Decide:

- roles/personas and task handoffs from authoring through publication;
- conceptual state names and valid transitions;
- exact-revision approval and what edits invalidate approval;
- normal prohibition on self-approval and the audited Super Admin exception;
- scheduling time zone, failed-job recovery, cancellation, and conflict visibility;
- correction, withdrawal, archive, restore, and re-publication behavior;
- queue views, filters, responsibility, due dates/alerts, and publication blockers;
- how preview proves which revision and placement context is being reviewed; and
- which actions require reason capture and audit events.

### Communications Dashboard

Select the smallest first release that helps staff act. Candidate signals include:

- Draft Stories and Draft News;
- Awaiting Review and Awaiting Approval;
- Scheduled Content and Recently Published;
- current Featured Story and Featured News;
- expiring News;
- Media missing alt text or rights/consent metadata;
- publication-validation failures and scheduling problems;
- broken external links; and
- upcoming newsletter work.

For each selected signal, define the user, decision/action, authoritative source, calculation, empty state, permission behavior, and freshness. Do not add a metric merely because it is easy to count.

### Homepage curation and placements

Decide:

- which homepage regions are administratively curated in the first release;
- what types are eligible for each region;
- whether a placement has a schedule and/or manual order;
- conflict and fallback behavior;
- preview and approval responsibility;
- how inaccessible, expired, withdrawn, or missing content becomes ineligible; and
- what placement history must be audited.

The first implementation may use typed placement slots while preserving a broader curated-placement direction. It need not implement a universal page builder.

### Newsletter

Confirm:

- the current DonorView mailing-list configuration and any separate sending workflow, without reopening the accepted subscriber system-of-record boundary;
- signup handoff/embed behavior and consent copy;
- whether newsletter issues or planning records are represented locally;
- archive/linking expectations;
- planning and approval relationship with Stories/News;
- subscriber data boundary; and
- what “upcoming newsletter work” means to the dashboard and queue.

Do not move subscriber records into the platform without a new explicit ownership decision.

### Media, authors, and categories

Decide:

- Media rights/provenance, consent, credit, focal point/crop, captions, transcripts, alt text, and reuse requirements;
- Author relationship to public People profiles and administrator identities;
- organization/byline and contributor cases;
- category versus tag purpose, vocabulary ownership, creation permission, merge/retire behavior, and public display; and
- which classification is shared across Stories and News versus typed.

Taxonomy should solve finding, governance, or related-content needs; it should not recreate Wix categories by default.

### Related content and future packages

Decide the first-release rules for editorially chosen versus derived relations. Test them with a representative initiative such as Camp St. Cottages across Project, Story, News, Gallery/Media, Campaign, Grant, Event, Partners, and newsletter coverage.

The exercise should reveal missing relationship semantics. It should not be used to force a Communications Package model before a distinct package workflow is established.

## Required scenarios to walk through

1. A writer drafts a long-form Project Story, submits it, an independent approver approves the exact revision, staff schedules it, and the homepage features it for a period.
2. Staff publishes a weather-delay News item related to a Project, marks its relevance window, and the item expires without being deleted or misleading visitors.
3. Staff announces a grant, relates the News item to an approved public Grant acknowledgment and Project, and does not expose private grant files or notes.
4. Staff selects Featured News while another item is already featured; the interface makes conflict and fallback behavior explicit.
5. An approved scheduled item receives a material edit; the workflow shows whether approval was invalidated and prevents an unapproved revision from publishing.
6. A featured item is withdrawn after publication; public placement and fallback behavior remain coherent and audit history is retained.
7. Media is missing alt text or lacks confirmed rights/consent; preview and publication handling make the problem actionable.
8. A newsletter editor assembles upcoming coverage from approved/scheduled Stories and News without copying subscriber data into the platform.
9. A Super Admin uses an exceptional self-approval/override path; reason and audit visibility are explicit.
10. A staff member can see the Communications Dashboard but lacks permission to approve, feature, or manage Media; actions and confidential details respect that boundary.

## Decisions explicitly deferred

- press-release type and workflow;
- full Communications calendar interface and cross-type rescheduling;
- final Communications/Story Package name and model;
- fully generic placement engine;
- automated personalization or algorithmic recommendations;
- social publishing automation;
- email subscriber storage or email-delivery implementation; and
- AI-assisted authoring/moderation behavior.

These should remain possible where inexpensive, but they must not enlarge the first Communications slice without an approved need.

## Expected review outputs

The session should produce:

- agreed Story and News definitions with borderline examples;
- workflow state/transition diagram and exceptional paths;
- first-release Publication Queue responsibilities;
- first-release Dashboard signals with action definitions;
- News expiration/archive/withdrawal policy;
- Featured News and initial homepage-placement rules;
- Media publication readiness requirements;
- Author and taxonomy governance policy;
- Newsletter system boundary and first-release scope;
- relationship conventions validated against at least one initiative; and
- a short list of decisions deliberately postponed.

Those outputs should be reflected in product documentation and the publication/communications architecture decision before schema and administration screens are frozen.

## Readiness questions for Sven and staff

1. Which people will author, review, approve, schedule, feature, and correct communications in normal operations? Which duties must stay separated?
2. What turnaround or due-date information actually helps those people, and who follows up when work stalls?
3. Which News should remain publicly discoverable after it is no longer current, and what should “expired” communicate to readers?
4. Can more than one Featured News item occupy a placement? If not, what fallback should appear when the selection ends or becomes ineligible?
5. Which homepage regions must staff control in the first release, and which may remain rule-based or static initially?
6. How is the current DonorView mailing list configured, does another approved service perform delivery, and does staff need issue planning, a public archive, or only a signup handoff in the first release?
7. Who may create/merge categories and Authors, and who owns vocabulary quality over time?
8. What evidence must be present before Media is publishable, especially participant consent, rights, alt text, and credit?
9. When a published item needs a correction, should the correction note be public, internal, or policy-dependent?
10. Which Communications Dashboard action would save staff the most time in the first month?

These are workflow and product-design inputs. They do not reopen the accepted greenfield, ownership, privacy, provider, or typed-domain boundaries.
