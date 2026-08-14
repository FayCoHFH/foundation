# Design Principles

## Intent

The platform should feel unmistakably local, trustworthy, capable, and humane. Design quality is measured by whether people can understand Fayette Habitat’s work, act confidently, and maintain dignity—not by visual novelty or the number of modules on a page.

These principles apply to both the public and administrative experiences. They guide future research, content, interaction, visual systems, and implementation; they are not a substitute for testing with real users and staff.

## 1. Design from the mission and task

Every page or screen should make its purpose and next useful action clear. A resident finding assistance, a volunteer registering, a donor supporting a Campaign, a customer checking ReStore hours, a grant reviewer examining capacity, and an editor approving News have different needs. Start with the decision each person is making, then choose content and controls.

Implications:

- use audience language rather than internal department names;
- prioritize a small number of relevant actions instead of equal-weight button collections;
- provide enough context before external or consequential actions; and
- measure success by task completion, comprehension, and safe maintenance.

## 2. Practice LEGACY INDEPENDENCE

The Wix site supplies factual, historical, media, SEO, redirect, and migration evidence only. Its navigation, templates, categories, page hierarchy, URLs, interactions, and visual conventions have no default authority in the new design.

Implications:

- design the new information architecture from audience tasks and meaningful domains;
- migrate content selectively by value and evidence;
- use redirects to preserve useful access without recreating legacy routes; and
- require a current rationale for every pattern, not “the old site had it.”

## 3. Center dignity, agency, and consent

Habitat work involves people, homes, financial circumstances, and moments of vulnerability. Design should never turn an individual into a before/after device or imply that a public story grants access to a private case.

Implications:

- give participants informed control over names, images, details, and reuse;
- avoid deficit framing, savior language, voyeuristic imagery, and unnecessary location detail;
- make privacy boundaries visible in authoring and review; and
- offer people a clear path to request correction, accommodation, or consent review.

## 4. Make current information recognizably current

News, Events, ReStore details, Program eligibility, Campaign progress, leadership, and operating guidance can become harmful when stale. The interface should communicate time according to the content’s meaning.

Implications:

- show publication, update, event, effective, expiration, reporting-period, or reviewed-at context as appropriate;
- distinguish latest, featured, urgent, scheduled, expired, archived, and withdrawn;
- avoid silently deleting expired News; and
- give staff actionable freshness signals instead of adding generic timestamps everywhere.

## 5. Separate timely communication from enduring knowledge

Stories and News share publication craft but make different promises. Stories provide lasting narrative and context; News communicates what is happening now. Structured Projects, Programs, Events, Campaigns, Grants, and People remain the durable records behind them.

Implications:

- do not present all publishable content through one undifferentiated card pattern or archive;
- use visual and verbal cues appropriate to time sensitivity;
- link News and Stories to durable domain records where useful; and
- keep shared workflow visually consistent while retaining typed editing needs.

## 6. Curate with purpose

The homepage and key landing pages should express current organizational priorities through accountable editorial choices, not a rigid stream of the newest database rows. Featured is a placement decision, not a claim that an item is universally most important.

Implications:

- let authorized staff preview and manage important placements;
- show eligibility, scheduling, conflict, fallback, and expiration behavior;
- keep placement history auditable; and
- avoid a universal page builder when a small set of meaningful curated regions serves the need.

## 7. Show evidence in context

Impact and grant presentation should help people evaluate real work. Numbers without definition, period, source, or scale can mislead even when technically accurate.

Implications:

- pair measures with scope, period, method/source, and related work;
- use charts only when they improve comprehension over clear prose or a number with context;
- distinguish outputs, outcomes, estimates, goals, and cumulative totals; and
- make limitations and reporting dates legible without burying the central message.

## 8. Make system boundaries understandable

A cohesive experience may hand people to DonorView, Stripe, a newsletter provider, or an event/registration service. Design should preserve trust by saying what will happen, not by disguising the boundary.

Implications:

- label external destinations and identify the task they complete;
- distinguish donating money, registering, signing up, buying merchandise, and donating ReStore goods;
- provide recovery paths for cancel, error, or closed destinations when available; and
- never imply the Fayette platform owns receipts, donor records, volunteer records, or payments that another system owns.

## 9. Accessibility is a design input

Target WCAG 2.2 AA in public and administrative experiences. Accessibility includes interaction, language, content structure, media, performance, and staff authoring—not only color contrast at final review.

Implications:

- design keyboard flow, focus, errors, zoom/reflow, touch targets, reduced motion, and assistive-technology output with the primary state;
- treat alt text, captions, transcripts, heading structure, and meaningful link text as publishing data;
- avoid interactions that require hover, drag, vision, hearing, timing, or pointer precision alone; and
- test representative journeys with disabled users when feasible and with assistive technologies throughout implementation.

## 10. Serve mobile and constrained connections first-class

People may encounter an urgent News item, opportunity, giving page, or ReStore guidance on a phone with limited bandwidth. Rich media should deepen the experience without becoming an entry fee.

Implications:

- maintain reading order and action priority at small widths and high zoom;
- use responsive, appropriately sized media and restrained client-side behavior;
- make essential information available when optional media or embeds fail; and
- avoid persistent controls that cover content or keyboard focus.

## 11. Make safe staff work visible

Administrative design should reduce memory burden and accidental publication. Staff need to see what requires action, what they are allowed to do, which revision they are reviewing, and what the public will receive.

Implications:

- use a Communications Dashboard and Publication Queue to surface actionable work;
- show lifecycle state, responsible person, validation, schedule, and placement context clearly;
- distinguish preview, approval, scheduling, and publication actions;
- prevent normal self-approval and explain capability constraints without exposing sensitive authorization data; and
- provide confirmation and recovery proportionate to consequence.

## 12. Build a visual system, not a component catalog

Tailwind and component primitives can accelerate implementation, but they do not establish Fayette Habitat’s identity or hierarchy. The system should be recognizable, coherent, and restrained across narrative, operational, evidence, commerce, and administration contexts.

Implications:

- establish deliberate typography, spacing, color, imagery, elevation, motion, and content-density rules;
- use primitives as accessible foundations and adapt them to the product language;
- prefer a small vocabulary of strong page and content patterns; and
- test states with real long names, missing media, translations/zoom, expired records, errors, and dense admin content.

## 13. Prefer honest completeness over decorative fullness

Unknown content does not justify filler, fabricated testimonials, arbitrary statistics, or generic stock imagery. A smaller verified experience is more trustworthy than a visually complete but unsupported one.

Implications:

- route unknown facts to the human verification backlog;
- design intentional empty, pending, archived, and reduced-content states;
- omit unsupported claims while preserving the product capability; and
- add collection filters, carousels, dashboards, or taxonomies only when they solve a demonstrated problem.

## Review prompts

Before approving a concept, ask:

1. Whose task becomes easier, and what evidence will show that?
2. Could this expose or imply private applicant, household, donor, volunteer, grant, or access information?
3. Is the content current, attributable, consented, and owned?
4. Does the interface distinguish Story, News, and durable domain records accurately?
5. Is a featured item intentionally placed, and is fallback behavior clear?
6. What happens with keyboard, screen reader, 200–400% zoom/reflow, reduced motion, low bandwidth, missing media, and long content?
7. Does an external handoff state what will happen and who owns the resulting record?
8. Is a new component, taxonomy, dashboard metric, or page type solving a real repeated need?
9. Are we preserving value from the legacy site without allowing it to define the product?
10. Can authorized staff maintain this safely after launch?
