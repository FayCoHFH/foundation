# Accessibility Standard

## Commitment and target

The Fayette County Habitat for Humanity public and administrative platforms target **WCAG 2.2 Level AA** across supported journeys. Accessibility is a product, design, content, engineering, procurement, and operational responsibility. It is evaluated throughout work, not delegated to a launch audit or an overlay widget.

Conformance does not guarantee that an experience is usable for everyone. The team should combine standards checks with keyboard, screen-reader, zoom/reflow, reduced-motion, and representative user testing, then provide an accessible contact path for barriers and accommodation requests.

## Scope

The standard applies to:

- public pages, navigation, search/filter experiences, Stories, News, media, Programs, Projects, Campaigns, Events, ReStore, Shop, impact, grants, leadership, governance, policies, and errors;
- administrative authentication, navigation, dashboards, tables/lists, editors, uploads, workflows, previews, scheduling, placements, access management, and audit views;
- responsive states, loading/empty/error/offline/provider-failure states, embedded or linked third-party experiences, downloadable documents, transactional messages, and generated metadata; and
- authored content and uploaded Media, not only application chrome.

Third-party ownership does not remove Fayette Habitat’s duty to evaluate, document, and mitigate accessibility risks in DonorView, Stripe, newsletter, map, event, media, or other handoffs.

## Required design and implementation behavior

### Structure and semantics

- Use semantic HTML and platform controls before custom ARIA behavior.
- Provide one descriptive page title and a logical heading hierarchy based on content structure, not visual size.
- Identify header, navigation, main, complementary, and footer regions appropriately; include a skip path to primary content.
- Preserve meaningful reading and focus order at every responsive layout and high zoom.
- Use lists, tables, quotations, addresses, dates, and form groupings according to their meaning.
- Use ARIA only to fill a semantic gap; accessible names, roles, states, and relationships must remain valid after dynamic updates.

### Keyboard and focus

- Every interactive function must be operable with keyboard alone, without requiring pointer, hover, drag, or path-based gestures.
- Focus order must follow the task; no focus traps except correctly managed modal contexts.
- Focus must be visible, sufficiently contrasted, and not obscured by sticky navigation, cookie notices, persistent Give controls, or other overlays.
- Opening, closing, adding, removing, sorting, publishing, and validation actions must move or retain focus predictably.
- Custom widgets require the expected keyboard interaction pattern and assistive-technology output. If that cannot be achieved, choose a simpler native pattern.
- Provide non-drag alternatives for any future calendar, ordering, placement, gallery, or upload interaction.

### Navigation and wayfinding

- Navigation must work without hover and remain understandable on small screens.
- Repeated navigation/order/naming should be consistent; changes must have a task-based reason.
- Current location, selected tab/filter, expanded/collapsed state, and active workflow state cannot rely on color alone.
- Link text must describe destination or action out of context; avoid repeated ambiguous labels.
- Provide more than one way to find substantial content where collection size and need warrant it, such as navigation, search, or related records.

### Visual presentation, reflow, and contrast

- Text and essential non-text content must meet WCAG 2.2 AA contrast requirements in every interactive state, including focus, hover, selected, disabled, error, chart, and content-over-media contexts.
- Information and state cannot rely on color, shape, position, or animation alone.
- Content must reflow without loss of information or function at 400% zoom / 320 CSS-pixel width except for content with a genuine two-dimensional requirement.
- Text must remain usable with user text-spacing overrides; do not clip, overlap, or hide controls.
- Do not disable user zoom.
- Target sizes and spacing should meet WCAG 2.2 AA requirements, with larger touch targets preferred for primary and field-use actions.
- Support Windows High Contrast/forced-colors behavior and do not remove essential system focus cues.

### Motion, flashing, and time

- Respect `prefers-reduced-motion`; essential state changes must not depend on animation.
- Avoid autoplaying motion. Provide pause/stop controls for nonessential moving, blinking, scrolling, or updating content.
- Do not use content that flashes beyond safe thresholds.
- Give users control over time limits, warnings, and extensions unless a limit is essential; preserve work when sessions expire where security allows.
- News urgency, Campaign progress, and dashboards must not update in a way that repeatedly steals focus or interrupts reading.

### Forms and transactions

- Every input requires a persistent programmatic label; placeholder text is not a label.
- Instructions, required state, format, units, privacy context, and examples must appear before they are needed.
- Group related controls with semantic grouping and clear legends.
- Identify errors in text, associate them with fields, summarize when helpful, move focus deliberately, and preserve valid input.
- Suggest corrections when safe; never expose whether another person’s private record exists.
- For legal, financial, application, order, access, publication, or other consequential submissions, provide review, confirmation, and correction/undo appropriate to the risk.
- Authentication must not depend only on memory puzzles or inaccessible CAPTCHA. Passwordless/OAuth and session interactions must preserve accessible names, focus, status, and error recovery.
- Do not collect data, including SSNs, merely because a generic form component permits it.

### Status, errors, and feedback

- Loading, saving, validation, upload, scheduling, publication, provider handoff, and success/failure states must be visually clear and announced when appropriate without moving focus unnecessarily.
- Do not announce every minor update in dense dashboards; use live regions sparingly and intentionally.
- Error messages must explain what happened, what is retained, what the user can do, and how to get help.
- External-provider failures should offer a maintained alternative/contact where possible.
- Permission denial must be understandable without revealing private content or authorization details.

### Media

- Informative images require contextual alternative text; decorative images require an intentional empty alternative.
- Linked or actionable images need an accessible name that communicates the action/destination.
- Captions and credits do not automatically replace alt text; alt text should not redundantly copy nearby prose.
- Prerecorded video requires accurate captions and, when visuals convey necessary information not in audio, audio description or an equivalent alternative.
- Audio-only content requires a transcript; video-only content requires a descriptive alternative.
- Live media requires captions when used for essential public communication, with an accommodation plan when exact support is constrained.
- Carousels/galleries must not autoplay, must expose controls and position, preserve reading/focus order, and offer a simple linear alternative.
- Do not infer sensitive traits or circumstances in alt text or captions. Rights and participant-consent restrictions remain publication requirements.

### Rich editorial content

- The structured editor must let authors create valid headings, lists, links, quotations, captions, tables only when appropriate, and media alternatives without writing markup.
- It must prevent skipped heading levels or visually communicate structural problems, vague links, empty headings, missing alt text, and invalid embeds before publication.
- Pull quotes must not create confusing duplicate screen-reader output unless their treatment is explicitly decorative.
- Tables require headers/captions and a small-screen strategy; layout tables are prohibited.
- Preview must allow keyboard and assistive-technology review of the exact candidate revision and meaningful public contexts.
- Publishing validation must block missing essential accessibility data and make the responsible correction clear.

### News, dates, status, and urgency

- Publication, update, event/effective, expiration/archive, postponement/cancellation, and withdrawal states must be expressed in text and programmatic structure.
- Featured News must not be conveyed by visual prominence alone when that designation is important to understanding.
- Urgent operational content must remain perceivable without animation, sound, or color alone.
- Expired or archived News must not appear current to screen-reader, search, or visual users.

### Data displays and evidence

- Charts require a concise text takeaway and access to the underlying values/definitions appropriate to the audience.
- Color must not be the only series or status discriminator; labels/patterns/direct annotation are preferred.
- Metrics must include scope, period, units, source/method context, and as-of date in accessible reading order.
- Avoid dense visualizations when a sentence, number with context, or small table communicates better.

### Commerce, giving, volunteer, and other handoffs

- Before leaving the platform, identify the action and external provider/context where material.
- Embedded experiences require accessible title/name, logical focus entry/exit, responsive behavior, and an accessible fallback link or contact when possible.
- Merchandise checkout must remain distinguishable from a donation flow.
- Test DonorView, Stripe, newsletter, registration, and other configured flows with keyboard, screen reader, zoom/reflow, mobile, errors, success/cancel, and privacy notices before launch.
- If a required provider has a known barrier, document it, seek remediation, provide an alternative path where possible, and do not claim conformance for that journey without qualification.

### Documents and downloads

- Prefer accessible HTML for primary information.
- A downloadable PDF or office document must be tagged/structured, have correct reading order, language, title, headings, links, tables, alt text, and form labels as applicable.
- Link labels should identify document purpose and preferably file type/size.
- Scans without OCR and inaccessible legacy documents must not be published as the only route to essential information.
- Redaction and privacy review are separate from accessibility and are both required.

## Administrative experience requirements

Staff with disabilities must be able to perform the complete task, not only view records. Representative task coverage includes:

- authenticate and recover from access/session errors;
- find work in the Communications Dashboard and Publication Queue;
- create/edit a Story and News item with structured content;
- upload Media and complete alt text, caption, credit, rights, and consent fields;
- submit, review, approve the exact revision, schedule, publish, expire/archive, withdraw, and correct;
- select Featured News or another placement and understand conflict/fallback behavior;
- manage a Project/Program relation without drag-only interaction;
- review validation and audit context; and
- manage Users & Access within capability constraints.

Tables and dashboards need responsive alternatives, programmatic headers, keyboard-operable sorting/filtering, accessible state, and a logical reading sequence. Avoid forcing every list into a visual data grid when a simpler list supports the task.

## Content governance

Accessibility-critical content is structured data with ownership. Publication readiness includes:

- meaningful page title, headings, summary, and link labels;
- media alternatives, captions/transcripts, credits, rights, and consent;
- understandable dates/status and plain-language action;
- accessible downloadable documents or HTML equivalent;
- verified contact/accommodation route; and
- external destination testing.

The Communications Dashboard may surface missing alt text, broken links, inaccessible documents, or other readiness problems. Exact signals are selected in the Communications review.

## Testing strategy

### During design

- annotate semantics, headings/landmarks, reading order, focus order, names, states, errors, reflow, reduced motion, and content alternatives;
- review wireframes at small width and high zoom, not only desktop presentation;
- prototype consequential and custom interactions with keyboard behavior; and
- include long content, missing media, validation, error, expired/archived, and permission-limited states.

### During implementation

- enforce semantic and type-safe component contracts where useful;
- run automated accessibility checks on representative pages and component states;
- perform keyboard-only checks for every changed journey;
- test with at least VoiceOver/Safari and NVDA/Firefox or NVDA/Chrome for high-priority flows, adjusting the matrix based on supported audience environments;
- test browser zoom, text spacing, reflow, forced colors, reduced motion, touch, and responsive states;
- inspect rendered headings, landmarks, accessible names/descriptions, live regions, focus, and error associations; and
- include accessibility assertions in end-to-end tests where behavior is stable and meaningful.

Automated tooling finds only a subset of barriers. A zero-error scan is not acceptance.

### Before release

- complete manual checks of the high-priority journeys below;
- audit third-party configured flows and document known limitations/alternatives;
- test authored launch content and documents, not only templates;
- triage issues by user impact and prevent release of critical blockers; and
- record an owner and remediation date for accepted noncritical defects.

### After release

- publish and monitor an accessibility contact route;
- include accessibility in content and operational training;
- retest after major design, editor, provider, or content-type changes;
- monitor support reports and recurring authoring failures; and
- periodically review representative content and transaction flows.

## High-priority journey matrix

| Journey | Minimum manual coverage |
| --- | --- |
| Find help / Program next step | Navigation/search entry, eligibility content, privacy guidance, contact/handoff, errors |
| Read Story | Heading/landmark order, media alternatives, gallery/pull quote, related content, CTA, low bandwidth |
| Find current News | Index, Featured/latest distinction, date/status, detail, expired/archive treatment |
| Volunteer | Opportunity context, requirements, external DonorView handoff, success/error/alternative contact |
| Give / Campaign | Purpose and provider boundary, external flow, amount controls if present, error/cancel/receipt expectation |
| Event registration | edition/status/date/time zone, venue/accessibility, provider handoff, cancellation information |
| ReStore | location/hours, temporary News, map/directions alternative, donation/shopping guidance, contact |
| Shop | browse Product/variant, cart if present, Stripe checkout handoff, errors, confirmation, policies |
| Due diligence | leadership/governance, Project/Program evidence, Grant Impact, metrics, documents |
| Communications workflow | author, Media readiness, submit/review/approve exact revision, schedule/publish, correction |
| Featured placement | select, conflict, preview, eligibility, expiration/withdrawal fallback, audit feedback |
| Users & Access | invite/state/capability administration, confirmation, errors, permission limits |

## Severity and release policy

- **Critical:** blocks an essential task, exposes private information, traps users, makes a consequential transaction impossible or unsafe, or has no accessible alternative. The affected journey does not release.
- **High:** causes substantial difficulty for a common or important task. Fix before release unless a genuinely effective documented alternative and near-term remediation are approved.
- **Moderate:** creates friction or standards failure without blocking the task. Assign owner and target date; do not allow repeated debt to become the default pattern.
- **Low:** limited inconvenience or polish issue. Track and address through normal quality work.

Severity is based on user impact, frequency, affected audience, privacy/safety, and availability of an equivalent alternative—not only the WCAG criterion number.

## Definition of done for a feature

A feature is not done until:

- applicable WCAG 2.2 AA requirements are met in default and edge states;
- keyboard, focus, semantics, names/states, errors, reflow/zoom, contrast, motion, and content alternatives have been reviewed;
- representative automated and end-to-end checks pass;
- high-risk behavior has appropriate screen-reader/manual evidence;
- authored content fields and validation support accessible publication;
- configured third-party behavior and fallback are documented/tested;
- no Critical or unaccepted High defects remain; and
- any residual issue has an explicit owner, impact statement, workaround if effective, and remediation date.

Accessibility findings are product defects. They should be recorded, prioritized, and corrected through the same engineering process as security, privacy, and functional defects.
