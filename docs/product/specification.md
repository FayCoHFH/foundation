# Product Specification

## 1. Status and interpretation

This document records the accepted product foundation for the Fayette County Habitat for Humanity digital platform. It defines product capabilities and boundaries without selecting screen designs, schemas, packages, or final URLs.

Normative terms:

- **Required**: part of the intended product unless a later recorded decision changes it.
- **Deferred**: accepted direction that is deliberately outside the initial implementation scope.
- **Open design decision**: a choice to resolve through product/design review; it is not an unknown requirement.
- **Conditional**: required only when its stated condition is true.

## 2. Foundation constraints

1. The platform is a greenfield product, not a Wix redesign.
2. **LEGACY INDEPENDENCE:** legacy pages may provide facts, history, media, SEO evidence, redirect origins, and selected content. They do not prescribe product domains, navigation, taxonomy, page structure, workflow, visual design, administration, URLs, or features.
3. Communications is a first-class product domain; News is distinct from Stories / Journal.
4. DonorView remains the preferred system of record for constituents, donors, gifts, receipts, and supported volunteer/registration operations. The platform must not recreate those responsibilities or assume undocumented integrations.
5. Fayette Habitat owns Campaign narratives and public calls to action, while the donation destination is provider-neutral. Stripe is expected for merchandise and is not selected for donations by default.
6. Google authentication establishes identity only. Application-managed capability checks establish authority.
7. Public publishing must use an approved, auditable publication state; public pages must not read drafts or private case data.
8. Applicant/homeowner case management and private grant administration are future isolated private domains.
9. Unknown or stale content enters human verification. It does not silently become invented copy or an implementation blocker.
10. The final navbar, Stories public label, page compositions, and URL scheme remain product/design decisions.

## 3. Public platform requirements

### 3.1 Shared experience

The public platform is required to:

- present a coherent Fayette Habitat identity across public domains;
- provide responsive, keyboard-operable, assistive-technology-compatible experiences targeting WCAG 2.2 AA;
- expose clear primary actions for volunteering, giving, learning about programs, viewing current communications, finding the ReStore, and shopping;
- maintain a visible giving call to action without misleading users about the system completing the gift;
- distinguish current, scheduled, expired/archived, and historical information where time affects meaning;
- provide meaningful document titles, descriptions, canonical metadata, social sharing metadata, and structured data where appropriate;
- support durable relations among communications, projects, programs, people, campaigns, events, grants, partners, media, and impact evidence;
- avoid exposing drafts, withdrawn publications, private grant records, applicant/case records, donor records, volunteer records, integration secrets, or administrative metadata; and
- make external handoffs understandable before the user leaves the site.

Search, filtering, and faceting are conditional on validated collection size and audience need. The product must not introduce empty or low-value taxonomies solely to imitate the legacy site.

### 3.2 Communications

#### Stories / Journal

The platform is required to support a long-form editorial experience for enduring, narrative, rich-media communication. A Story may relate, as appropriate, to Projects, Programs, People, Campaigns, Events, Partners, Grants, ReStore, Products/Artists, Media, and attributable metrics.

Story presentation should support structured editorial elements such as headings, prose, quotations, media, galleries, captions, contextual calls to action, and related-domain references. The exact block vocabulary and editor package are architecture/design decisions.

Internally, **Stories** is preferred where task-oriented language improves clarity. The public label—Journal, Stories, or The Habitat Journal—is open.

#### News

News is a required and distinct public capability for timely, concise, announcement-oriented communication. The public experience must include:

- a News index;
- a News detail experience;
- latest News presentation;
- Featured News presentation;
- homepage News presentation;
- visible publication date and, when editorially useful, update or expiration context;
- scheduled publication;
- optional expiration/archive behavior without silent deletion;
- related media; and
- optional relationships to a Project, Program, Campaign, Event, Grant, or Partner.

Not every News item requires every relationship. News may eventually support lifecycle concepts such as Draft, Review, Approved, Scheduled, Published, Expired, Archived, and Withdrawn; final state labels and transition policy are not yet schema commitments.

#### Newsletter

Newsletter content and communications planning belong to Fayette Habitat’s Communications domain. The public platform should support an understandable signup handoff and relevant newsletter/archive presentation when sources and retention policy are confirmed. DonorView owns subscriber records, consent/suppression, and mailing-list operations under the accepted current boundary; a different system of record requires an explicit replacement decision.

#### Media, authors, and categories

Published communications must support owned media metadata, authorship/attribution, and appropriate classification. Categories or tags must have a defined audience/editorial purpose, governance owner, and reuse rule before creation. Media requires alt text or a recorded decorative treatment, rights/provenance, and consent where people are identifiable.

#### Featured content and placements

Featured News is an editorial selection, not an inherent permanent property of every News record. The product direction is a managed curated-placement capability that can eventually address homepage and landing-page selections such as Featured Story, Featured News, Campaign, Project, Event, ReStore, Shop, hero, impact, volunteer, partner, and newsletter content.

The foundation must preserve this direction without requiring a fully generic placement engine in the first slice. Authorized staff must ultimately be able to change important homepage featured content without a developer deployment.

### 3.3 Projects, programs, partners, and impact

The public platform is required to:

- explain active Programs and their verified purpose, audience, eligibility or participation path, and contact/next step;
- represent Projects as structured records that can cover new home builds, critical home repair, Aging in Place, ramp installation, disaster response, community engagement, and future project types;
- connect Projects to relevant Programs, Stories, News, Media, Partners, Grants, Campaigns, Events, and attributable impact;
- present project status and time context without disclosing a private household or precise residence location by default;
- present Partners only with accurate naming, approved marks, relationship context, and permission where required; and
- present impact measures with source, scope, period, method/context, and an accountable owner.

Impact presentation must not imply causation, precision, currency, or scale that available evidence cannot support. Public participant narratives are consented editorial records, not projections of private applicant/case data.

### 3.4 Community engagement

#### Volunteer

The platform is required to explain available volunteer paths, expectations, accessibility/safety prerequisites where applicable, and the official registration or application handoff. DonorView owns volunteer applications, registrations, attendance/check-in, and hours when supported by the organization’s account. Supported mechanisms and configured forms require account confirmation.

The platform must not create a second volunteer identity or hours ledger merely to make the public experience look integrated.

#### Events

The platform is required to market and explain events such as fundraising events, build days, volunteer activities, and community outreach. An Event may have recurring or dated editions and relationships to Projects, Programs, Campaigns, Stories, News, Media, Partners, and donation/registration destinations.

Registration, attendee, and payment ownership must be explicit per event. The public platform owns event presentation; an approved external system owns registration records when the flow is handed off.

#### Campaigns

A Campaign is a Fayette Habitat-owned storytelling and fundraising object. It should be able to connect a goal and narrative to a Project or Program, Stories, News/updates, impact evidence, an approved donation destination, and a final impact report.

The platform must:

- avoid equating a Habitat Campaign with a DonorView campaign/fund/appeal concept;
- store a provider-neutral reference to the approved destination rather than embedding provider assumptions throughout the Campaign model;
- prefer an appropriate supported DonorView destination when staff can create and maintain one effectively; and
- permit a later approved provider, including a possible Stripe donation flow, without rewriting Campaign semantics.

Gift status, donor identity, receipts, recurring gifts, pledges, and tax records are not owned by the Campaign presentation.

### 3.5 Give and development

The giving experience is required to explain purpose and securely direct the donor to an approved destination. Before handoff, it should identify the recipient/purpose and make clear when an external service completes the gift. Claims about deductibility, matching, designation, recurring giving, planned giving, raffles, or campaign allocation require human/legal verification as appropriate.

Donation processing behavior remains conditional on confirmed DonorView account capabilities. No public flow may claim that the platform records or receipts a donation when the external provider owns that responsibility.

### 3.6 Leadership and governance

The public platform is required to present verified information appropriate to organizational trust and due diligence, including:

- Executive Director leadership;
- Board membership and positions;
- Committees where public disclosure is appropriate;
- relevant Staff / People presentation;
- governance context and transparency materials selected for public release; and
- historical context that has been verified and remains institutionally useful.

Names, terms, positions, biographies, committee rosters, dates, and document currency require named ownership and periodic review. Internal contact data, notes, account status, and authorization records remain private.

### 3.7 ReStore

ReStore is a major mission and operational experience, not a footer-only destination. The platform is required to explain its mission connection, location, verified hours, contact details, shopping/donation guidance, and timely operational changes.

The currently observed address and Friday/Saturday operations are verification inputs, not automatically approved publication facts. News may communicate exceptional hours or closures; the canonical ReStore information must still have a clear owner and reviewed-at date.

Detailed ReStore workflows remain a later product-design input.

### 3.8 Shop

The platform is required to support Fayette Habitat merchandise such as shirts, caps, local artist collaborations, and event products. It should present Artists, Products, variants, availability, fulfillment/return guidance, and mission context as verified.

Stripe is expected to process merchandise payments. The platform must never store card data and must not treat merchandise orders as charitable gifts. Final fulfillment, tax, shipping/pickup, returns, inventory, and customer-support policy require operational confirmation before commerce launch.

### 3.9 Grants, transparency, and due diligence

The public platform is required to support deliberate public grant acknowledgment and grant-impact presentation where appropriate. Public content may identify a funder, supported work, period, approved amount/range when authorized, outcomes, related Projects/Programs, and evidence.

Private grant administration is a confirmed deferred capability. Applications, agreements, budgets, compliance documents, reporting drafts, internal notes, contacts, deadlines, and sensitive attachments remain private and must not be inferred from public acknowledgment. Public publication is an explicit projection, not a visibility flag on a private record.

## 4. Administrative platform requirements

### 4.1 Access and accountability

Administrators authenticate with approved organizational Google identities. Authentication does not grant administrative access. The application is required to maintain invitations/access state, capabilities, and audited changes.

Authorization must use capabilities rather than scattered hard-coded role-name checks. The eventual policy must support independent permissions including, conceptually:

- `communications.dashboard.read`;
- `stories.create`, `stories.edit`, `stories.submit`, `stories.review`, `stories.approve`, `stories.publish`, `stories.schedule`;
- `news.create`, `news.edit`, `news.submit`, `news.review`, `news.approve`, `news.publish`, `news.schedule`, `news.feature`;
- `newsletter.manage`;
- `media.manage`; and
- `communications.placements.manage`.

Names may be refined before implementation. Normal authors must not approve their own work. A Super Admin override may exist but must be deliberate and audited. Sensitive access, publication, integration, and placement changes require audit history.

### 4.2 Communications administration

The conceptual administrative information architecture is:

- Communications Dashboard
- Stories
- News
- Newsletter
- Media
- Authors
- Categories
- Publication Queue

This is a domain grouping, not a frozen sidebar.

#### Communications Dashboard

The dashboard is a required editorial command center. It must eventually make work needing attention visible across Communications rather than force staff to inspect disconnected lists. Candidate signals include drafts, awaiting review, awaiting approval, scheduled content, recently published items, current featured selections, expiring News, missing alt text, publication problems, broken external links, and upcoming newsletter work.

Exact widgets, calculations, thresholds, and layouts remain for the Communications review. The dashboard must respect capability boundaries and must not expose confidential content to unauthorized users.

#### Story and News administration

Authorized staff must be able to:

- create and edit Stories and News independently;
- submit, review, approve, schedule, publish, withdraw, and retain auditable history according to policy;
- select Featured News and other authorized placements;
- manage optional News expiration/archive behavior;
- associate relevant Media, Authors, Categories, and domain relationships;
- preview the exact candidate publication in an appropriate context; and
- see validation failures and publication blockers before release.

Stories and News should share revision, authorship, workflow, approval, scheduling, publication-snapshot, SEO, media, relationship, and audit mechanisms where appropriate. They must retain typed rules and presentation; the implementation must avoid both a single meaning-erasing generic Content record and duplicated publishing engines.

Approval must bind to the exact candidate revision. Later edits require re-evaluation rather than inheriting approval silently. Public delivery uses the published projection/snapshot, not mutable draft state.

#### Publication queue and scheduling

Authorized staff need a coherent view of scheduled and actionable publication work. Scheduling must preserve the possibility of a future Communications calendar covering Stories, News, Newsletters, campaign communications, Events, and other publication types. No calendar-specific structures are required before its workflow is designed.

#### Future Communications packages

The product should remain capable of grouping related coverage for a major initiative across a Project, Story, News, Gallery/Media, Campaign, Grant, Event, Partners, and newsletter coverage. The concept name, ownership, sequencing, and model are open; no package object is required in the initial schema.

### 4.3 Other administration areas

The administration direction includes Projects, Programs, Campaigns, Events, People, Board, Committees, ReStore, Shop, Impact, Grants, Integrations, Users & Access, Audit Log, and Site Settings. Their exact screen structures and slice scope will be refined before implementation.

Administrative records must expose only the data needed for the current task and capability. Public preview must not make private data public or bypass approval.

## 5. Publishing and content requirements

### 5.1 Common publishing guarantees

For Stories and News, and for future publication types where appropriate, the product is required to support:

- immutable or equivalently trustworthy revision history;
- identified authorship and editorial responsibility;
- separation of editing, review, approval, scheduling, and public state;
- approval of an exact revision;
- scheduled publication with explicit time-zone behavior;
- durable published output that cannot change because a draft was edited;
- withdrawal/archive behavior that preserves audit history;
- preview that cannot be mistaken for a public URL;
- SEO and sharing metadata validation;
- accessible media requirements;
- appropriate related-domain references; and
- audit events for consequential changes.

The lifecycle terms in this specification are conceptual. Final transitions, exceptional paths, and permissions are decisions for the Communications review and publication ADR.

### 5.2 Structured content

Long-form content must use a structured, validated format capable of rendering safely and accessibly. Arbitrary executable markup is not an accepted authoring primitive. The format must support migrations, revisions, previews, links, media references, quotations, headings, and contextual calls to action without storing presentation-only page-builder output as the institutional record.

### 5.3 Time and freshness

News, Events, ReStore details, Programs/eligibility, leadership, donation claims, and other time-sensitive content must support a clear publication date or reviewed-at context appropriate to the type. Expiration should change presentation or availability according to policy; it must not silently erase records.

## 6. Public/private information boundary

The following must never become public merely because they relate to a public record:

- applicant or household identity, eligibility evidence, case status, supporting documents, precise residence location, or internal notes;
- unapproved participant narratives, private contact information, or media lacking appropriate consent;
- donor identity, gift history, pledge/recurring-gift data, receipt/tax data, or DonorView credentials;
- volunteer applications, waivers, attendance, hours, or sensitive scheduling information;
- private grant applications, agreements, budgets, compliance materials, drafts, contacts, notes, or attachments;
- administrative identities beyond approved public People profiles, access state, roles/capabilities, sessions, invitations, or audit detail;
- Stripe payment credentials, complete payment instrument data, integration secrets, or webhook verification material; and
- unpublished revisions, internal review notes, preview tokens, or publication diagnostics.

The future homeowner/assistance application domain must be isolated from public Projects, Programs, Stories, and News. It must not collect Social Security numbers or reproduce the legacy email/PDF intake pattern.

## 7. External-system experience requirements

Every external handoff must define:

- the user’s task and destination;
- which organization/service will receive information or payment;
- which system is authoritative for the resulting record;
- whether return/cancel/failure behavior is available;
- accessibility and privacy implications known to Fayette Habitat; and
- the staff owner responsible for maintaining and periodically testing the link or embed.

Embeds are not automatically preferred over hosted links. The selected mechanism must be supported, secure, accessible, maintainable, and confirmed for the organization’s account.

## 8. Quality requirements

### Accessibility

The public and administrative experiences target WCAG 2.2 AA. Definition of done includes keyboard operation, visible focus, semantic structure, accessible names, error identification, contrast, reflow/zoom, reduced motion, media alternatives, and assistive-technology checks proportionate to risk.

### Performance and resilience

Public pages should prioritize useful content, responsive images, restrained client-side code, and meaningful behavior on constrained connections. External-provider failure must not corrupt owned content; handoff failure should produce a clear recovery path.

### Security and privacy

All privileged actions require server-enforced authorization. Uploads and rich content are untrusted. Secrets and payment credentials remain out of content records and client output. Logs and analytics must avoid private payloads. Consequential changes are auditable.

### Maintainability

Content types must have clear owners, validation, relationships, lifecycle, and archival behavior. Shared infrastructure should reflect shared policy rather than erase domain meaning. Every metric, canonical fact, external link, and time-sensitive operating detail needs a maintenance owner.

## 9. Foundation acceptance criteria

The foundation is product-ready for implementation planning when all of the following are true:

- greenfield and legacy-independence constraints are recorded and applied consistently;
- Communications is represented as a first-class domain;
- Stories and News are distinct while their shared publication guarantees are explicit;
- News index, detail, latest, Featured News, homepage presentation, scheduling, and optional expiration/archive are required;
- Communications Dashboard, publication queue, and curated homepage direction are recorded without premature widget/schema design;
- Campaigns use a provider-neutral donation destination, with DonorView preferred only when supported and operationally suitable;
- Stripe commerce is distinct from donation processing;
- public/private grant and applicant/homeowner boundaries are explicit;
- capability-based administration and separation of author/approver duties are explicit;
- unresolved facts reside in the content-verification backlog and are not mislabeled as product blockers;
- the public navbar, public Stories label, and future calendar/package mechanics remain open design decisions; and
- no application scaffold is created as part of the Decision Runway.

## 10. Deferred and open decisions

### Deferred capabilities

- private grant administration;
- homeowner/assistance application and case management;
- a fully designed editorial/Communications calendar;
- a Communications/Story Package model;
- a complete generic curated-placement engine;
- press releases or additional publication types; and
- deeper DonorView synchronization unless a supported mechanism and business need are confirmed.

### Open design decisions for the Communications review

- public naming and positioning of Stories / Journal;
- exact workflow states, transitions, exceptions, and self-approval override policy;
- News expiration/archive defaults and public archive behavior;
- Featured News selection rules, placement scope, scheduling, collision behavior, and fallback;
- dashboard signals and definitions;
- publication queue views, ownership, and alerts;
- category/tag purpose and governance;
- author identity/byline policy;
- newsletter planning and archive boundary;
- media relationship, focal-point, credit, rights, and consent workflows;
- related-content editorial versus automatic selection rules;
- homepage curation responsibilities and preview/approval behavior; and
- minimum relationship conventions that preserve future packages without adding a package model now.

These decisions should be resolved before Communications implementation details are frozen. They do not justify reopening the accepted platform boundaries above.
