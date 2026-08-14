# Product Vision

## Purpose

Fayette County Habitat for Humanity is building a greenfield public website and administrative platform that makes it easier for people to understand the organization, participate in its work, support it, and verify its community impact. The platform is an institutional record and staff work surface, not simply a redesign of the current website.

It should connect clear public communication with structured records of programs, projects, leadership, partnerships, campaigns, events, grants, ReStore activity, commerce, and attributable impact. It should also give authorized staff dependable publishing and administration workflows without replacing systems that already own constituent, donor, volunteer, registration, or payment data.

## Product outcomes

The platform should enable Fayette Habitat to:

- explain what it does, where it works, and how its work benefits Fayette County;
- publish timely News and enduring Stories through one coherent Communications domain;
- present projects, programs, leadership, governance, partners, grants, and impact as related, maintainable records;
- help residents, volunteers, donors, event attendees, shoppers, partners, and grant reviewers reach trustworthy next steps;
- curate important homepage and landing-page content without requiring a deployment;
- preserve useful institutional history while clearly identifying what is current;
- protect applicants, homeowners, donors, volunteers, and staff through deliberate public/private boundaries;
- let staff authenticate with organizational Google accounts while authorizing actions through application-managed capabilities;
- keep donations, constituent records, volunteer operations, and merchandise payments within their appropriate systems of record; and
- produce evidence of impact that is attributable, reviewable, and maintainable rather than ornamental.

## Audiences and their core questions

| Audience | Core questions the platform should answer |
| --- | --- |
| Residents and prospective applicants | What help exists, who may qualify, and what is the safe official next step? |
| Volunteers | What opportunities are available, what is expected, and where do I register? |
| Donors and supporters | What will support accomplish, where can I give, and who securely handles the gift? |
| Community members | What is happening now, what has happened locally, and how can I participate? |
| Homeowners and story participants | How will my information and story be used, and what remains private? |
| Partners and local institutions | How can we collaborate, and how is partnership represented accurately? |
| Grant reviewers and funders | Is the organization governed, capable, transparent, and able to support its claims with evidence? |
| ReStore customers and donors | Where and when is the ReStore open, what does it accept, and how does it support the mission? |
| Merchandise customers | What is available, who made it, and how can I purchase securely? |
| Staff, authors, reviewers, and administrators | What needs attention, what may I do, and what was approved or published? |

## Product principles

### LEGACY INDEPENDENCE

The product is greenfield. The existing Wix site is evidence and migration source material only. It may supply facts, historical material, media, SEO metadata, redirect targets, and selected content. It does **not** define the new navigation, information architecture, taxonomy, domains, pages, workflows, visual system, content hierarchy, administration, URLs, or requirements. Migration ledgers record disposition; they do not become a product blueprint.

### One coherent platform, clear domain ownership

The experience should feel connected even when a trusted external system completes a task. Internally, meaningful domains retain their own language, policy, and data ownership. Shared capabilities should remove accidental duplication without flattening Stories, News, Projects, Campaigns, Events, Grants, or Products into generic content blobs.

### Communications is a first-class domain

Communications encompasses Stories / Journal, News, Newsletter, Media, Authors, Categories, publication workflow, the publication queue, and a Communications Dashboard. Stories and News share appropriate publishing infrastructure but retain distinct semantics and public experiences.

### Dignity and privacy before storytelling

People are participants, neighbors, volunteers, leaders, and collaborators—not raw material for marketing. Public narratives are deliberate projections of consented information. Private applicant, household, eligibility, supporting-document, case, donor, and volunteer records are not editorial source data by default.

### Evidence before vanity

Impact claims should name what was measured, the period, source, scope, method, and responsible owner. When evidence is incomplete, the platform should omit or qualify the claim rather than convert uncertainty into false precision.

### Staff curation over accidental recency

Important public placements should be intentionally managed. The homepage is not a hard-coded stream of the latest rows. Authorized staff should eventually manage hero and featured selections, including Featured Story, Featured News, Campaign, Project, Event, ReStore, Shop, impact, volunteer, partner, and newsletter elements.

### Provider-neutral giving, explicit records of authority

Campaigns and donation calls to action belong to Fayette Habitat; donor and gift records belong in the approved fundraising system of record. DonorView is preferred when it can supply an appropriate supported hosted destination or embed. Campaigns must not encode a permanent dependency on DonorView, and Stripe donation processing remains an optional future path—not a current commitment. Stripe is the expected merchandise payment provider.

### Accessible by construction

Public and administrative experiences should target WCAG 2.2 AA, work with keyboard and assistive technology, communicate without color alone, and remain usable on mobile devices and constrained connections. Accessibility is part of definition of done, including authored content and media.

### Unknown content is not an unknown requirement

Unverified names, dates, hours, totals, claims, biographies, program rules, and event details belong in a human verification backlog. They generally do not block product architecture or implementation. The product must support verified content and visible freshness; it must not invent missing facts.

## Conceptual domain map

This map communicates product ownership and relationships. It does not freeze the public navigation, code directory structure, or administrative screen hierarchy.

| Domain | Capabilities |
| --- | --- |
| Communications | Stories / Journal, News, Newsletter, Media, Authors, Categories, workflow, publication queue, dashboard |
| Projects & Programs | Projects, Programs, Impact, Partners |
| Community Engagement | Volunteers, Events, Campaigns |
| Development | Donations, Grants, DonorView integration |
| Leadership & Governance | Executive Director, Board, Committees, Staff / People where appropriate |
| Operations | ReStore, Shop, Users & Access, Site Settings |

Cross-domain capabilities include authentication, authorization, audit history, search, SEO, media delivery, curated placements, external-system references, and public/private projections.

## Product boundaries

### Fayette Habitat platform owns

- the public experience and its navigation, presentation, accessibility, and SEO;
- Stories, News, newsletter content, media metadata, authorship, editorial revisions, approvals, scheduling, publication state, and publication snapshots;
- Communications Dashboard and publication queue concepts;
- curated public placements, including Featured News selection;
- Programs, Projects, Campaign narratives, Events presentation, Partners, public impact, and public grant acknowledgment;
- leadership, governance, ReStore, and merchandise presentation;
- application users, capabilities, access state, site settings, and audit records; and
- provider-neutral references from a Campaign or call to action to an approved donation destination.

### External systems own

- DonorView: constituents, donors, gifts, pledges, recurring gifts, receipts, and the volunteer/application/registration/attendance/hour records supported by the organization’s account;
- Stripe: merchandise payment credentials and card processing; and
- Google: staff identity authentication, while the application owns authorization.

Supported integration mechanisms must be confirmed from authoritative documentation or the organization’s configured account. The platform must not reverse-engineer undocumented DonorView behavior.

### Deferred private domains

Private grant administration and homeowner/assistance application management are confirmed future capabilities, but they are not part of the initial public publishing model. Applicant, household, eligibility, uploaded supporting document, case workflow, and internal note data must remain isolated from public Projects, Stories, News, and participant narratives. The platform will not collect Social Security numbers or recreate email/PDF intake.

## Success evidence

Success should be evaluated with a small, maintainable set of measures rather than a vanity dashboard. Candidate evidence includes:

- people can find a relevant program, current News item, project, volunteer path, giving path, ReStore information, or governance record without relying on the legacy site;
- authorized staff can draft, review, approve, schedule, publish, expire/archive, and audit appropriate communications without developer intervention;
- the public never receives an unpublished revision or private applicant, donor, volunteer, grant, or access-control record;
- published impact claims include source and reporting context;
- homepage and featured content can be intentionally curated;
- external donation, volunteer, registration, and commerce handoffs state what will happen and preserve clear system ownership;
- high-priority journeys meet accessibility acceptance criteria; and
- redirect and migration evidence accounts for known legacy URLs without reproducing legacy information architecture.

Exact analytics events, baselines, targets, and review cadence will be selected during implementation planning with the staff responsible for maintaining them.

## Current non-goals

The foundation does not commit to:

- reproducing Wix pages, layouts, navigation, categories, or behavior;
- building a separate CMS for every publication type or one generic CMS blob for every domain;
- rebuilding DonorView’s CRM, donation, receipt, volunteer, or registration responsibilities;
- claiming a DonorView API, webhook, or automation capability before account/vendor confirmation;
- collecting Social Security numbers or implementing homeowner/application case management in the first implementation slices;
- implementing private grant administration in the first public foundation;
- using Stripe for donations merely because Stripe is used for merchandise;
- fully designing a Communications calendar, Communications/Story Package, or generic placement engine in this documentation phase;
- fixing the final public name of Stories / Journal, the final navbar, or production URL scheme before product design; or
- scaffolding the application during the Decision Runway.

## Immediate decision runway

The next planning session is the **Communications Domain Product & Architecture Review**. It will refine Stories / Journal, News, Featured News, Communications Dashboard, homepage curation, publication queue, workflow, future calendar compatibility, Newsletter, Media relationships, categories/tags, cross-domain relations, and possible Communications Packages. Application scaffolding follows that review rather than this foundation work.
