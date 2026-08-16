# Information Architecture

## Purpose

This document describes how people should understand and move through the platform at a conceptual level. It is not a final sitemap, navbar, route list, wireframe, or code structure.

## Governing constraints

### LEGACY INDEPENDENCE

The current Wix navigation and page tree are migration evidence, not the starting structure. The new information architecture must follow audience tasks, product meaning, governance, and content relationships. Legacy URLs may receive redirects to new destinations even when no one-to-one page replacement exists.

### The navbar is not frozen

The areas below are product spaces. Usability testing, content inventory, mobile constraints, search needs, and priority decisions will determine which become top-level navigation, grouped navigation, contextual links, utilities, or landing-page sections.

### Product domains are not navigation labels

Communications, Projects & Programs, Community Engagement, Development, Leadership & Governance, and Operations clarify ownership. They do not need to appear verbatim in the public menu or map one-to-one to directories.

## Audience task model

The public experience should make these tasks straightforward:

| Task | Likely starting context | Required destination or outcome |
| --- | --- | --- |
| Understand Fayette Habitat | Search, homepage, shared link | Mission, local scope, current work, history, accountability |
| Find help | Program or search landing | Verified program fit, eligibility context, safe next step |
| Volunteer | Homepage, event, project, campaign | Opportunity context and official application/registration handoff |
| Give | Persistent CTA, campaign, story, project | Clear purpose and approved provider destination |
| Learn what is happening now | Homepage, News, search | Current News, Events, urgent notices, relevant actions |
| Explore enduring stories | Homepage, Story relationship, search | Rich narrative with related work, people, media, and next steps |
| Follow a project or program | Story, News, campaign, search | Structured status, related communications, impact, partners |
| Attend an event | Homepage, News, campaign | Current edition details and official registration/ticket destination |
| Visit or support ReStore | Search, homepage, navigation | Verified location, hours, shopping/donation guidance, notices |
| Shop merchandise | Story, event, artist feature | Product context, variants, policies, secure checkout |
| Assess organizational capacity | Search, About, Impact | Leadership, governance, projects, partnerships, grants, evidence |
| Find contact or policy information | Footer, About, relevant task | Appropriate contact channel and current policy/document |

The information architecture should prioritize these journeys over departmental terminology.

## Conceptual public product spaces

### Understand the work

- Our Work
- Programs
- Projects
- Impact / Transparency
- Grants / Grant Impact
- Partners

### Follow communications

- Stories / Journal
- News
- Newsletter
- Media embedded contextually rather than necessarily as a public library

### Participate and support

- Volunteer / Get Involved
- Campaigns
- Events
- Give
- Newsletter signup

### Know the organization

- Executive Director / Leadership
- Board / Governance
- Committees where public
- About / History
- Contact and public policies

### Mission-connected operations

- ReStore
- Shop
- Artists / collaborations where useful

These groupings are hypotheses to evaluate. In particular, News is a product area but whether it is top-level navigation remains open.

## Core public content types

| Type | Audience promise | Time behavior | Typical relationships |
| --- | --- | --- | --- |
| Story | An enduring, editorial account that gives people and work context | Evergreen; may be updated through a new approved revision | Projects, Programs, People, Campaigns, Events, Grants, Partners, Media, ReStore, Artists |
| News | A timely, concise announcement or operational update | Published at a point in time; may expire, archive, or withdraw without deletion | Project, Program, Campaign, Event, Grant, Partner, Media |
| Program | A maintained explanation of a continuing service or line of work | Current with reviewed-at ownership | Projects, Stories, News, eligibility/next step, impact |
| Project | A structured record of a bounded effort | Status- and phase-aware; historical value after completion | Program, Stories, News, Campaigns, Events, Grants, Partners, Media, impact |
| Campaign | A Habitat-owned narrative and call to support a defined outcome | Active period followed by updates and final impact | Project/Program, Stories, News, donation destination, metrics |
| Event / Edition | A public opportunity anchored to date/time and place/format | Upcoming, current, past, canceled/postponed | Campaign, Project, Program, News, Story, registration destination |
| Person / Leadership record | An approved public identity and role | Term/date-aware where appropriate | Board, Committee, Story authorship, Projects/Programs where useful |
| Grant acknowledgment | A deliberate public statement about supported work and outcomes | Reporting-period aware | Grant, Project, Program, Partner/funder, Stories, News, impact |
| Impact measure/snapshot | A contextualized claim backed by evidence | Period- and methodology-specific | Project, Program, Campaign, Grant, organization |
| ReStore information | Canonical operating and mission information | Reviewed-at; exceptional changes may use News | News, Stories, Events, Media, calls to action |
| Product / Artist | A merchandise offer and its local creative context | Availability- and policy-aware | Artist, Event, Story, Campaign where appropriate |

These types are intentionally distinct. A shared publishing workflow does not turn a News item into a Story, and a Story does not replace a structured Project record.

## Relationship-led discovery

The platform should help people move between related records without requiring them to understand internal categories.

Examples:

- a Project can surface its latest approved Story, timely News, active Campaign, upcoming Event, Partners, Grants, and attributable impact;
- a Story can provide context for the Project or Program it describes and a relevant action;
- News can link to the durable Project, Program, Campaign, Event, Grant, or Partner record behind an announcement;
- a Campaign can connect its case for support to a Project/Program, relevant Story/News, an external giving destination, progress context, and final impact;
- an Event can connect to current News, registration, Campaign, Project, or volunteer context;
- public grant impact can connect an approved funder acknowledgment to supported work and evidence without exposing private grant administration; and
- a ReStore or Artist Story can lead to canonical ReStore information or an appropriate Product.

Related content should be editorially meaningful. Automatic recency alone must not create inappropriate associations. Communications uses explicit public-safe relations first, optional editorial curation second, and a deterministic shared-relation/category-plus-recency fallback only when needed.

## Communications public architecture

### Stories / Journal experience

The conceptual experience includes:

- a Story landing/index when collection depth supports it;
- Story detail with structured narrative, media, attribution, dates, and contextual actions;
- relationships to the underlying people, work, evidence, or opportunities; and
- purposeful discovery by topic/category only after taxonomy governance is defined.

The recommended canonical space is a distinct Story collection with stable item slugs, an optional category archive, and optional Author Profile archive. The exact public collection word remains open. A published Story has a canonical URL; renamed slugs redirect; a successor draft never changes the public page. Related content begins with explicitly related public records, then a deterministic shared-relation/category fallback. It must not expose private People, grants, submissions, or media.

The public name remains open. Internal administration should use task-oriented **Stories** terminology unless a later decision establishes otherwise.

### News experience

News requires:

- a News landing/index;
- News detail;
- latest News;
- Featured News;
- a homepage News presentation;
- visible publication and relevant update/expiration context;
- preserved archive behavior for items no longer current; and
- optional related-domain links.

The recommended canonical space is a distinct News collection with stable item slugs, a chronological index, and a historical archive. Expired News is removed from current/latest and curated placements, remains directly addressable with a clear no-longer-current label, and can remain searchable. Archived News remains historical and directly addressable; withdrawn News is unavailable publicly. An optional category archive is appropriate only after the controlled category vocabulary is populated.

### Newsletter, notices, and Story contribution

- A Newsletter archive/index and web edition are V1.1: they surface only approved public Edition snapshots. V1 exposes a clear subscriber-signup handoff without receiving or storing subscriber data.
- A Site Notice appears as a time-bounded global or relevant local banner/inline notice. Its exact visual treatment and final target areas are design decisions; it is not a News replacement.
- A public Story contribution route is an isolated form leading to a private submission inbox. It has no public status page, contributor account, or public News equivalent.

Urgent or operational News must not permanently override canonical information. For example, a holiday-hours item may explain an exception while the ReStore record remains the maintained source for normal hours.

### Homepage curation

The homepage should orient people, establish trust, and expose high-priority current paths. It is intentionally curated through authorized administration rather than generated as a rigid list of latest records.

Potential selection areas include hero content, Featured Story, Featured News, an active Campaign, a featured Project, upcoming Events, impact evidence, volunteer call to action, ReStore, Shop, partner recognition, and newsletter signup. These are candidates, not a frozen sequence or guarantee that every element appears simultaneously.

The accepted catalog reserves six code-owned singleton placement definitions: `HOME_HERO`, `HOME_FEATURED_STORY`, `HOME_FEATURED_NEWS`, `HOME_FEATURED_PROJECT`, `HOME_FEATURED_CAMPAIGN`, and `NEWS_FEATURED`. C4 implements the three homepage keys for Story/News plus the News-surface `NEWS_FEATURED`; Project/Campaign slots are future extensions until their typed domains and public projections exist. Each implemented key has a legal target type, optional timing, audit, and code-defined fallback/omission behavior. Upcoming Events and latest News are derived collections; impact is a configured approved metric set; volunteer, ReStore, Shop, partners, and newsletter presentation are stable domain CTA/configuration sections in the hybrid model, not arbitrary placements. This avoids both a static homepage and a page builder.

## Administrative information architecture

The administration should be organized around staff tasks and domain ownership, not public navigation.

### Communications

- Dashboard
- Stories
- News
- Newsletter (V1.1 when Edition authoring is enabled)
- Media
- Authors
- Categories
- Publication Queue
- Homepage / placements
- Site Notices
- Story Submissions

Dashboard is the command center; V1 presents actionable attention items, upcoming scheduled releases/expiring content, current homepage curation, and recent meaningful activity. The Publication Queue holds cross-type Story/News candidate-workflow and release views; typed lists/editors remain the source for substantive actions. A Contributor sees their own authoring work; an Editor sees review/edit work; a Communications Manager sees curation, Notices, Authors, Categories, and submission intake; a Super Admin sees the same areas plus exceptional override pathways. Server authorization, not this navigation, remains decisive.

### Projects & Programs

- Projects
- Programs
- Impact
- Partners

### Community Engagement

- Campaigns
- Events
- volunteer handoff/configuration appropriate to confirmed DonorView capability

### Development

- donation destination/configuration appropriate to confirmed provider capabilities
- public Grant Impact
- future Private Grant Administration, isolated and capability-restricted

### Leadership & Governance

- People
- Executive Director presentation
- Board
- Committees

### Operations and platform

- ReStore
- Shop
- Integrations
- Users & Access
- Audit Log
- Site Settings

This is conceptual. Final navigation labels, grouping depth, dashboard entry point, and role-specific visibility will be tested against real staff tasks. Capability restrictions may hide or disable areas, but direct requests must still be authorized on the server.

## Publication finding and queue model

Staff should be able to find communications by type, candidate workflow, release/public state, responsible person, scheduled time, freshness risk, and publication problem. The V1 Queue provides **My Drafts**, **Needs Review**, **Needs Approval**, **Approved**, **Scheduled**, **Recently Published**, **Expired News**, and **Archived** views plus type, candidate state, public author/editorial owner, assigned reviewer/approver, related-work, and date filters. It should emphasize work that needs action rather than become another undifferentiated content list; only safe responsibility-assignment/preview actions are inline.

Future calendar compatibility is preserved by authoritative scheduling semantics. The calendar itself, cross-type drag-and-drop behavior, event/business-date planning, and planning alerts are deferred; any future calendar is a derived view, never the scheduling authority.

## Naming and taxonomy rules

- Prefer audience language over organizational jargon.
- Use **Story** for the internal editorial object unless a later decision changes it; use **News** only for timely announcement-oriented publications.
- Do not use **Campaign** as shorthand for a DonorView fund/appeal/destination.
- Name a Program, Project, Event, Grant, Partner, and Product according to its domain meaning rather than treating all as pages.
- Categories are a controlled, flat editorial vocabulary with name, slug, description, display order, owner, allowed content type, and archive behavior. Generic tags are not V1.
- Avoid duplicate labels that conceal different actions—for example, distinguish donating money, donating goods to ReStore, volunteering, applying for assistance, and buying merchandise.
- Use dates/status language where it prevents stale information from appearing current.

## URL and routing principles

The final route scheme remains subject to design review. The implementation should reserve distinct canonical collection spaces for Stories, News, Newsletter web editions, Author Profiles, categories, and Story submissions, using stable readable lower-case paths. It should:

- use stable, readable, lower-case paths;
- keep canonical URLs independent from legacy Wix structures;
- avoid encoding volatile navigation or organizational chart decisions;
- give distinct types distinct canonical spaces where that aids meaning, especially News and Stories;
- preserve durable historical links when records archive;
- define redirect behavior for renamed slugs and migrated legacy URLs;
- avoid leaking database identifiers, preview tokens, private states, or provider credentials; and
- handle external handoffs through owned, maintainable references where useful without concealing the destination.

The redirect ledger may map many legacy origins to one new canonical destination or to an intentional archive/retirement outcome.

## Communications SEO, structured data, search, and discovery

- Published Story pages use accurate Article metadata; News uses NewsArticle only when it meets that type's public meaning. Both include canonical URL, OpenGraph/social metadata, author/byline where public, publisher, `datePublished`, and meaningful `dateModified`.
- Author profile pages may use `ProfilePage` with an approved `Person` or `Organization` as `mainEntity` only when the visible page genuinely profiles that entity. `BreadcrumbList` is used only when the visible hierarchy supports it. Newsletter web editions use `Article` metadata when published; Site Notices and intake forms do not claim article markup.
- Canonical published, expired, and archived Communications pages may be indexed when they retain public historical value. A documented `noindex` decision removes a record from sitemap, site-search, and external-index eligibility. Withdrawn and preview pages are excluded. No rich-result outcome is promised.
- V1 site search includes directly addressable, indexable public Story and News title, deck/summary, permitted body text, public Author name, category, and permitted related public-record names. PostgreSQL full-text search is sufficient initially. Search excludes drafts, previews, submissions, internal notes, private media, `noindex` records, and withdrawn content.
- Category browsing and typed related-content links are primary discovery tools. External search, personalization, and algorithmic recommendations are deferred.

## Footer, utilities, and persistent actions

The design should evaluate a persistent Give action and utilities for contact, accessibility/help, privacy, terms/policies, public governance/transparency, social channels, and newsletter signup. Inclusion and placement depend on audience need and verified content.

External destinations must be labeled. The interface must distinguish an external donation, volunteer, registration, newsletter, or checkout handoff from an internal content link.

## Mobile, low-bandwidth, and accessibility implications

- Navigation must remain understandable without hover, pointer precision, or a large screen.
- Page titles and headings must expose location and purpose independently of visual layout.
- Landmarks, skip navigation, focus order, visible focus, and current-location cues are required.
- Important actions must remain available at zoom/reflow and must not be covered by a persistent CTA.
- Media-heavy Stories require responsive assets, captions/transcripts as appropriate, and a meaningful reading experience when optional media does not load.
- Search/filter controls, if justified, require labels, keyboard operation, status announcements, shareable state where useful, and a usable no-results path.
- External handoffs must not rely on a new window as the only cue.

## Information-architecture validation before routes are frozen

Subsequent content and design work should validate:

1. the public label and role of Stories / Journal;
2. whether News needs top-level navigation or another consistently discoverable placement;
3. the public presentation of the recorded homepage placement fallback rules;
4. distinctions among Give, Campaigns, volunteering, event registration, ReStore donations, and Shop;
5. pathways for residents seeking help without exposing private intake details;
6. due-diligence journeys across leadership, governance, work, partnerships, grants, and impact;
7. taxonomy vocabulary with staff and audience language;
8. staff finding/queue tasks against the recorded V1 views and filters;
9. mobile navigation breadth and naming; and
10. content depth sufficient to justify collection indexes, filters, and archives.

No legacy menu item is presumed to pass this validation merely because it exists today.
