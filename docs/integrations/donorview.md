# DonorView integration discovery and boundary

Status: Discovery complete; accepted system-of-record boundary retained
Evidence reviewed: 2026-08-18

This document is the current discovery record for the Habitat platform and
DonorView. It records confirmed public evidence, separates account/vendor
questions from facts, and does not claim that an undocumented API, webhook,
redirect, or custom-domain feature exists.

## Decision

DonorView remains the constituent, donor, gift, pledge, recurring-gift, receipt, newsletter-subscriber/consent/suppression and mailing-list, volunteer-application/waiver, volunteer-registration, attendance, hours, and DonorView event-registrant system of record. The Habitat platform owns the public experience, newsletter editorial content, Campaign narrative, and selection of an approved donation/registration destination.

The preferred initial donation flow is:

`Habitat Campaign -> DonorView designated donation destination -> donor contributes -> DonorView owns donor/gift/receipt`

The first integration may be intentionally manual: an authorized staff member creates/configures the DonorView destination and records its hosted URL plus designation metadata on the local Campaign. This is a supported operational boundary, not a temporary data-integrity compromise.

## Evidence classification

- **Documented:** current public DonorView product/support material directly describes the capability.
- **Account/vendor confirmation:** public material suggests or does not rule out the capability, but the organization's plan, configuration, contract, or supported technical mechanism must be verified.
- **Proposed:** our provider-neutral architecture, not a claim about DonorView.
- **Unsupported assumption:** must not be used for planning or implementation.

## Capability matrix

| Capability | Supported? | Documented mechanism/evidence | Proposed use | Account confirmation? | Notes/risks |
| --- | --- | --- | --- | --- | --- |
| Hosted donation pages | Documented | DonorView documents one-time, recurring, select-a-fund, multi-option, peer-to-peer, and advanced donation-page models with hosted `dvforms.net` URLs | Primary Give and Campaign destination | Yes, for this account and production configuration | Verify branding, accessibility, analytics, custom domain, return behavior, and URL longevity |
| Recurring giving | Documented | Recurring donation/pledge page allows amount, frequency, and day selection | DonorView owns recurring agreement and receipts | Yes | Do not mirror payment schedule locally |
| Targeted designation | Documented in product concepts; exact desired workflow unconfirmed | `For`, `Fund`, `Event`, `Appeal`, `Location`, and Fundraising Goal Category are configurable; select-a-fund and fixed-purpose pages are documented | Create a destination targeted to one Habitat Campaign/project/program | **Yes—priority question** | Establish whether a fixed designation can be hidden/preselected and how quickly staff can create it |
| Donation page embed/widget | Partially documented | Goal-progress widgets are documented for use on organization websites; hosted page URLs are documented | Prefer hosted redirect unless an approved accessible embed is demonstrably better | Yes | Confirm official embed code, CSP/frame policy, responsive/accessibility behavior, cookie/analytics disclosures; do not scrape or frame an unsupported URL |
| Constituent CRM | Documented | Product features describe centralized donor records, profiles, segmentation, interaction history | Donor/constituent system of record | Confirm subscribed modules | Do not create a local donor profile database |
| Gifts, pledges, tax receipts | Documented | Pricing/features list gifts, pledges, grants, tax receipts; support documentation describes online acknowledgment | Financial-development record of truth | Confirm configuration/accounting workflow | Public progress needs source and as-of time |
| Volunteer applications/forms | Documented | Volunteer module links forms marked “Volunteer Application”; forms/surveys and waivers are listed | Host application and waiver intake in DonorView | Confirm existing forms and fields | Review whether any sensitive fields exceed need; never copy waiver answers locally |
| Volunteer scheduling/registration | Documented | Recurring/multi-day events, activity/shift capacity, registrations, and scheduler are documented | Public CTA links to DonorView; DonorView owns registration | Confirm staff workflow | Local Event stores only destination and public facts |
| Attendance/check-in/time | Documented | Volunteer module documentation covers registrations, attendance, scheduler, and time tracking | DonorView owns attendance and hours | Confirm account setup and reporting | Local impact uses approved aggregate snapshots only |
| Event registration/ticketing | Documented | Product features and Event module describe registration, ticketing, attendance, and recurring event setup | Use where DonorView is selected for an EventEdition | Confirm ticket/payment configuration | Habitat platform owns marketing content, not registrants |
| Forms/surveys | Documented | Survey/Form Builder with custom fields/conditional logic and auto-import is advertised | Use only where DonorView ownership fits (volunteer/constituent) | Yes | Do not use as a generic private applicant intake without a separate review |
| Reporting/export | Documented | Analytics, custom reports, data export, PDF/PNG and Excel exports are described | Manual or supported scheduled aggregate import/reconciliation | Yes for exact fields, schedule, and delivery | A CSV workflow can be valid; define external IDs and as-of semantics |
| Goal/progress widgets | Documented | Fundraising Goal Category widgets (thermometer/donut/bar) can appear on DonorView and organization sites | Possible display source after accessibility/security review | Yes | Prefer locally presented, source-stamped aggregate if export support is safer |
| Newsletter/email marketing | Documented at feature level | DonorView lists email marketing, constituent lists, and communication features; the live legacy signup is a DonorView form | Keep subscriber consent, suppression, and mailing-list membership in DonorView; Habitat owns newsletter editorial content | Yes, for configured sender, consent, unsubscribe, archive, and export behavior | Do not create a shadow subscriber list in the platform |
| QuickBooks integration | Documented, with direction requiring confirmation | Marketing describes a two-way sync while detailed support material describes reviewing and exporting/posting DonorView data to QuickBooks | Keep donation-to-accounting flow outside Habitat platform | **Yes** for actual direction, objects, cadence, correction, and reconciliation | Treat the public wording difference as a live-demo acceptance item; public Campaign categories must not overwrite accounting semantics |
| Duplicate detection and merge | Documented | DonorView documents email/name/address/birth-date matching options, potential-duplicate review, and two-record merge | DonorView data steward owns constituent matching and merge | Yes for configured rules and steward | Email is important matching data but is not a permanent cross-system identity key |
| Roles, access, and MFA | Documented at product/support level; assurance package unconfirmed | DonorView documents module/authority access levels and published 2FA changes | Least-privilege DonorView roles remain external to Habitat platform capabilities | **Yes** | Obtain current enforcement, audit, SSO, assurance, incident, backup, and subprocessor evidence rather than relying on marketing claims |
| Data ownership, export, and exit | Documented with contractual details requiring account review | Public terms state customer data ownership; constituent/document export is documented | Establish routine reconciliation/backup and a tested exit plan | **Yes** | Confirm complete schema, stable IDs, format, document batches, price, deletion, and the contract's post-termination request window before relying on portability |
| Public API | **No authoritative public evidence found** | Reviewed official public product/support material did not establish a supported customer API or its contract | Optional adapter capability only after documentation/credentials are supplied | **Yes** | Do not say an API does not exist; do not reverse-engineer browser endpoints |
| Webhooks | **No authoritative public evidence found** | No supported webhook contract/signature/retry documentation was established in reviewed official public material | Optional verified-event adapter only if vendor supplies supported docs | **Yes** | Never expose an endpoint based on guessed payloads |
| Zapier/automation | **No authoritative public evidence found** | No official public Zapier integration/support contract was established | Optional automation only after vendor confirmation and privacy review | **Yes** | A third-party listing is not sufficient evidence |
| External/custom IDs and duplicate control | Not established publicly for this use | Public material confirms unified constituent profiles but not our needed external-ID/merge contract | Map stable DonorView IDs in `ExternalSystemReference` if available | **Yes** | Define matching/merge ownership before any person-level import |

## Adapter contract

The domain depends on a `DonationProvider`/`ConstituentOperations` port, not a DonorView SDK or URL format. Capabilities are negotiated explicitly:

- register and validate a manually supplied donation, volunteer, or event destination;
- describe destination provider/type/designation without exposing secret configuration;
- optionally create/update a destination **only if** a supported API is confirmed;
- optionally import time-stamped aggregate progress from an approved export/report;
- optionally ingest signed events **only if** supported webhook documentation is supplied;
- health/last-verified status and a staff-visible fallback link.

Unsupported operations return a typed “capability unavailable” result. They do not trigger scraping, browser automation, or an undocumented network call.

## Required account/vendor questionnaire

### Highest-priority Campaign question

1. Can an administrator quickly create a donation page or designation for a specific Habitat Campaign/project/program?
2. Can that destination fix or preselect `For`, `Fund`, `Event`, `Appeal`, or Goal Category so the donor cannot accidentally redirect the gift?
3. Does it provide a durable hosted URL and/or officially supported embed code?
4. Can goal/progress be scoped to that destination, and what transactions contribute to it?
5. How are refunds, offline gifts, matching gifts, recurring gifts, and fees reflected in progress?

### Technical integration

6. What DonorView plan/modules does Fayette County Habitat have, and who is the vendor/account contact?
7. Is there a supported customer API? If yes, obtain current vendor documentation, terms, authentication, scopes, sandbox, rate limits, stable IDs, pagination, and deprecation policy.
8. Are signed webhooks supported? If yes, obtain event catalog, verification scheme, replay window, retry/order guarantees, and test tooling.
9. Is an official Zapier or other automation connector included/supported? What data leaves DonorView and under whose DPA?
10. Can reports/exports be scheduled or delivered securely? Which fields and stable identifiers are available?
11. What import/upsert/external-ID and duplicate-detection/merge rules exist? Who resolves ambiguous matches?
12. Is QuickBooks synchronization one-way or two-way for this account, and which system owns corrections?

### Public experience and governance

13. What are the supported link/embed, CSP, cookie, return-URL, accessibility, analytics, and branding options?
14. Which privacy notice, consent, retention, receipt, refund, and recurring-gift controls are configurable?
15. Can public URLs be changed or revoked, and is there a vendor status/incident contact?
16. Which volunteer registration, check-in, time, waiver, and aggregate reporting workflows are actually configured today?

### Security, privacy, contract, and portability

17. Which least-privilege roles, field/module restrictions, MFA enforcement, login/audit history, session controls, and privileged-administrator protections are available and enabled?
18. Supply the current security/assurance package: independent assessment or SOC 2/ISO status if any, encryption at rest/in transit, penetration-test summary, vulnerability process, backups/restore tests, recovery targets, incident-notification terms, and security contact.
19. Supply the DPA, privacy terms, data-location commitments, subprocessor/payment-processor list, cross-border terms, deletion process, and restrictions for sensitive data. Confirm that no prohibited high-sensitivity data such as SSNs will be sent.
20. Demonstrate a complete constituent/gift/volunteer/document export with field dictionary, stable identifiers, relationship preservation, timestamps, suppression/consent state, and attachment packaging. State format, limits, scheduling, cost, and support ownership.
21. Confirm the contract's termination/export request window, charges, deletion timing/certificate, read-only access, and assistance available for a tested exit. Establish an operational export cadence well before termination.
22. Demonstrate the configured duplicate rules, review/merge workflow, audit/reversal behavior, and ownership for ambiguous identity matches after campaigns or events.
23. Demonstrate actual QuickBooks direction/object coverage, deposit/refund/fee mapping, duplicate prevention, correction ownership, and reconciliation rather than relying on the marketing label.
24. Confirm newsletter consent source, suppression/unsubscribe behavior, sending identity, list ownership, export/deletion, and whether DonorView or another approved service sends messages while DonorView remains the mailing-list system of record.

Answers and vendor documents belong in the decision/evidence record; secrets and credentials do not.

## Discovery findings

### Donation page capabilities

Official DonorView support material documents several hosted page models:
one-time, recurring/pledge, select-a-fund, multi-option, peer-to-peer, and
advanced progressive donation pages. A page receives a generated HTTPS URL and
QR code; DonorView also supplies HTML embed code. Donation pages can be copied
from the Donation Pages grid, which makes a staff-created Campaign destination
operationally plausible. The exact Fayette account's enabled modules,
designation lists, URL longevity, and production configuration still require
confirmation.

Documented page controls include one-time or recurring giving, preset amounts,
processing-fee choices, acknowledgments, branding, custom fields, and page
progress display. Payment methods and recurring behavior are account/page
configuration concerns; the public feature material lists card, ACH, PayPal,
Apple Pay, Google Pay, and other payment options, while support material notes
that Apple Pay is unavailable when a donation page is embedded.

### Donation attribution and revenue semantics

DonorView's documented revenue categories must not be collapsed into one local
Campaign field:

| DonorView concept | Recommended meaning | Habitat treatment |
| --- | --- | --- |
| `Fund` | Where money is accounted or deposited | DonorView-owned accounting designation; staff confirms the correct fund |
| `Appeal` | Which solicitation or Campaign caused the gift | Primary Campaign attribution candidate |
| `For` | Program, project, or campaign purpose for which money is earmarked | Optional secondary purpose designation; do not use as an accounting substitute |
| `Event` | An actual event associated with revenue | Use for an event, not for every editorial Campaign |
| `Fundraising Goal Category` | Aggregate bucket used by goal-progress graphics | Use only when DonorView staff intentionally groups transactions for a goal |
| Donation page | Transaction intake and default category assignment | Hosted DonorView destination recorded as a reviewed external action |

The recommended starting pattern is one targeted donation page per major
fundraising Campaign, with a fixed/default Appeal and any required For/Fund or
Fundraising Goal Category set by DonorView staff. A page may feed a broader
Fund while using a Campaign-specific Appeal for attribution. Whether donors can
see or change any picklist, whether a fixed value can be hidden, and how
recurring future installments retain attribution are priority support questions.

Recurring donations are documented as pledges and can be perpetual or have a
fixed number of payments. DonorView documents separate thank-you handling for
the initial and subsequent recurring payments, but the reviewed public material
does not establish the exact future-installment attribution contract. Do not
assume that a local Campaign record can reconcile recurring installments.

### Fundraising progress

DonorView documents Goal Progress widgets using a Goal Category, goal amount or
quantity, dates, and optional inclusion of pledges or pay-later transactions.
The same Goal Category can combine transactions from multiple pages,
activities, events, auctions, and manual entries. DonorView supplies generated
HTML for widgets, and reports can filter/export transactions by revenue
categories.

This is evidence that DonorView can calculate and display aggregate progress;
it is not evidence of a supported machine-readable aggregate API, webhook, or
scheduled feed to Habitat. The current Habitat Campaign `goalAmountCents` and
`progressAmountCents` therefore remain editorial, source-stamped by staff when
appropriate, and non-authoritative. Do not scrape a widget or public page.

An aggregate sync becomes a valid future option only after DonorView confirms a
supported export/API/report delivery with totals, as-of time, inclusion rules,
refund treatment, pledge treatment, fees, and a stable Campaign/Goal Category
reference. Until then, retain manual progress.

### API and webhook findings

No authoritative public DonorView customer API, GraphQL API, webhook contract,
signature scheme, event catalog, retry policy, sandbox, or rate-limit contract
was found in the reviewed official product/support material. This means
“undocumented” rather than “does not exist.” DonorView support must confirm
whether a supported customer API or webhook program is available to Fayette
County Habitat and under which plan, credentials, scopes, and contractual terms.

No polling, browser automation, private endpoint inspection, reverse proxy, or
credential-bearing browser integration is approved by this discovery.

### Return and redirect behavior

Reviewed donation and event documentation confirms an on-screen confirmation,
configurable thank-you messages, and automatic thank-you email. It does not
establish a general post-completion redirect/return URL that can safely return
to `/campaigns/[slug]`. A special documented subscription flow can redirect to
another DonorView event, which is not evidence of a general external return
contract. Treat return-to-Habitat as unresolved. The first flow should use the
external page's own confirmation and a normal Habitat-origin link back when the
vendor/account supports it.

### Hosted page, branding, and domain findings

DonorView's public examples use generated `app.dvforms.net` URLs, while the
exact production host is account-specific. Official material documents page
colors, fonts, logos, images, themes, custom messaging, mobile-optimized pages,
and generated share links. No reviewed official source establishes a Fayette
custom domain, branded subdomain, URL alias, or supported Habitat-domain proxy.

The user should see that the action leaves the Habitat site. Do not hide
DonorView ownership with a reverse proxy. Record the exact approved HTTPS URL
and last-verified date during staff review.

### Embed versus direct handoff

| Concern | Direct hosted handoff | Embedded DonorView page |
| --- | --- | --- |
| Accessibility/payment behavior | DonorView owns the complete page; browser navigation is clear | Host must validate the embedded experience; Apple Pay is documented as disabled when embedded |
| CSP/cookies/privacy | No third-party form script or frame in Habitat | Requires frame policy, third-party cookies/storage, and provider script review |
| Mobile/reliability | DonorView's mobile page is the vendor boundary | Host layout and frame sizing add failure modes |
| Maintenance | Store one reviewed URL | Maintain embed markup and vendor/browser compatibility |
| Analytics | Habitat records only CTA click; DonorView owns conversion | Cross-site measurement becomes more complex and privacy-sensitive |

Recommendation: direct handoff. Embedding is not approved merely because an
HTML snippet exists. Reconsider only with account-specific evidence that the
embed is accessible, payment-complete, CSP-compatible, mobile-safe, and
operationally supported.

## Canonical donation and volunteer destinations

Maintain a general organization-wide Donate destination separate from Campaign
destinations:

- General Donate → general DonorView donation page, if the account has one.
- Campaign Donate → targeted DonorView donation page with reviewed attribution.

For volunteer entry:

- General volunteer interest → DonorView Survey/Form marked `Volunteer Application`.
- Specific build/workday → DonorView Event Page marked as a Volunteer Event,
  with activities/shifts, capacity, registration, attendance, and optional
  automatic time tracking.

DonorView's Volunteer Module documentation confirms that marked applications
appear in Volunteer Applications, volunteer events populate registrations and
attendance, and the Scheduler manages activities and shifts. The Habitat
platform should not create the volunteer profile, application, registration,
attendance, or hours record.

## Project, Campaign, and DonorView mapping

The conceptual cardinality is intentionally not one-to-one:

- One Habitat Project may relate to many Habitat Campaigns.
- One Habitat Campaign may relate to many Habitat Projects.
- One Habitat Campaign may have one primary donation page and, when justified,
  additional reviewed pages for distinct appeals or channels.
- One DonorView Fund may receive gifts from many Habitat Campaigns.
- One DonorView Appeal or Goal Category may be reused only when staff intends
  those gifts to share attribution or aggregate progress.
- One Habitat Campaign may link to one or more specific DonorView Volunteer
  Events; a general volunteer application is separate.

Habitat owns the narrative relationship between Project and Campaign.
DonorView owns transaction intake, accounting categories, constituents, and
volunteer operations.

## Source-of-truth matrix

| Data class | Authority | Local handling |
| --- | --- | --- |
| Campaign title, summary, body, status, dates | Habitat platform | Authoring and immutable public projection |
| Project identity and public description | Habitat platform | Typed Project domain and public projection |
| Campaign public goal | Habitat platform | Editorial display fact; source and as-of required for factual launch |
| Campaign public progress | Habitat platform or derived aggregate | Manual until supported aggregate delivery is confirmed |
| Donor/constituent profile | DonorView | Never mirror by default |
| Donation/gift/pledge | DonorView | Never store locally |
| Recurring gift schedule and installments | DonorView | Never replicate locally |
| Receipt/acknowledgment | DonorView | Link/describe ownership only |
| Donation attribution | DonorView | Staff configures external designation; local action stores reviewed URL/label |
| Volunteer profile | DonorView | Never create locally |
| Volunteer application/waiver | DonorView | Never copy contents locally |
| Volunteer Event, shifts, capacity, registration | DonorView | Local Campaign stores reviewed CTA and public editorial context only |
| Volunteer attendance and hours | DonorView | Only future approved aggregate impact projection may cross boundary |
| CTA click | Habitat platform | Optional anonymous first-party event, no conversion claim |

## Data not copied locally

Unless separately approved, the Habitat platform must not persist donor names,
emails, addresses, per-donor amounts, payment/card data, receipts, recurring
payment credentials, volunteer profiles, applications, waiver answers,
registrations, attendance, or hours. Any future aggregate import must exclude
person-level data and carry source, as-of time, inclusion rules, and freshness
state.

## Analytics and attribution

Habitat may record a Campaign CTA click with action type, local Campaign ID, and
timestamp through the platform's approved anonymous first-party analytics
boundary. A click is not evidence of a completed gift or registration.

DonorView owns conversion, receipts, and transaction reporting. DonorView
reports may provide staff-side counts/totals by Appeal, Fund, For, Event, or
Goal Category, but no automatic cross-site conversion claim should be made until
a supported aggregate export/API is confirmed.

## Security and privacy boundary

- Store only reviewed HTTPS destinations; allowlist approved DonorView hosts and
  reject credentials, non-HTTPS schemes, open redirects, and scripts.
- Never place DonorView admin credentials, API keys, or webhook secrets in
  Campaign content or browser code.
- Do not iframe or proxy DonorView without a separately accepted supported
  integration contract.
- Do not log sensitive query strings or donor/volunteer payloads.
- If an aggregate export is later approved, keep it private, access-controlled,
  provenance-bearing, time-bounded, and purgeable.
- Any future webhook must require documented authentication/signatures,
  replay protection, idempotency, ordering/retry semantics, and a vendor test
  environment.

## Staff workflows

### Fundraising Campaign

1. Create the narrative Campaign in Habitat.
2. In DonorView, create or copy a donation page.
3. Set the intended For/Fund/Appeal and, if applicable, Fundraising Goal
   Category under DonorView governance.
4. Configure recurring behavior, acknowledgments, branding, payment methods,
   and any goal widget in DonorView.
5. Publish and test the DonorView page; record its exact URL and verification
   date.
6. Add the approved URL to the Habitat Campaign Donate action.
7. Review and release the Habitat Campaign.
8. DonorView receives gifts and owns attribution, receipts, pledges, and
   reconciliation.
9. Staff updates local editorial progress manually until a supported aggregate
   feed is approved.

### Volunteer Campaign

1. For general interest, create or select the DonorView form marked Volunteer
   Application.
2. For a specific build/workday, create or select a DonorView Event Page,
   mark it as a Volunteer Event, and configure activities, shifts, capacity,
   registration questions, waivers, attendance, and time tracking.
3. Publish and test the DonorView URL.
4. Add the approved URL to the Habitat Campaign Volunteer action.
5. Review and release the Habitat Campaign.
6. DonorView owns applications, registrations, attendance, and hours.

## Link lifecycle and failure policy

Campaign release should require staff confirmation that each external URL is
the approved HTTPS destination. The platform should not automatically submit
or authenticate to DonorView. If a destination is unpublished, replaced,
expired, 404, or otherwise invalid, staff should withdraw/replace the action or
use an explicitly approved general destination; the site must not guess a URL.

Future admin tooling may perform a constrained reachability check against an
allowlisted HTTPS host, without following internal redirects or submitting a
transaction. No automatic health polling is justified at discovery time.

## Current Campaign action model assessment

The current closed action model (`DONATE`, `VOLUNTEER`, `LEARN_MORE`) with a
bounded label and reviewed HTTPS destination is sufficient for the first
DonorView boundary. It preserves provider neutrality and avoids unnecessary
schema changes. Do not add provider metadata, external IDs, or destination
creation UI until the account/vendor questions are answered. If operational
needs later require it, add provider metadata as reviewed administrative
reference data—not as credentials or transaction state.

## Implementation options

### Option A — Hosted handoff only

Habitat stores reviewed DonorView URLs and editorial Campaign context. DonorView
owns all donation and volunteer records. Manual progress remains in Habitat.

- Effort: low
- Security/privacy: smallest boundary
- Reliability: fewest vendor coupling points
- UX: clear domain transition; no embedded payment behavior
- Recommended initial option

### Option B — Hosted handoff plus aggregate sync

Keep Option A, then import only a supported aggregate progress value from a
DonorView export, report delivery, API, or signed event mechanism.

- Effort: moderate
- Security/privacy: manageable only with aggregate-only contract and freshness controls
- Operational burden: reconciliation, refunds, pledges, fees, and stale data
- Use only after vendor/account evidence defines the contract

### Option C — Deep API integration

Use a supported API for narrow, authenticated operations or read-only aggregate
data, with stable IDs, scopes, rate limits, sandbox, error semantics, privacy
review, and an anti-corruption adapter.

- Effort: highest
- Security/privacy: largest boundary and credential responsibility
- Reliability: strongest automation only if the vendor contract is durable
- Not justified by current public evidence

## Recommended architecture

Adopt Option A now: direct hosted handoff, Campaign-specific donation pages for
major fundraising efforts, DonorView Volunteer Event pages for specific
build/workday opportunities, a general DonorView donation page, a general
Volunteer Application, reviewed HTTPS actions, and manual editorial progress.

Keep the existing provider-neutral Campaign action boundary. Revisit Option B
only after DonorView support confirms a supported aggregate mechanism. Do not
start Option C based on undocumented browser behavior.

## Recommended implementation sequence

1. Obtain the DonorView account/module/contact answers below.
2. Confirm the organization's Fund, Appeal, For, Event, and Goal Category
   governance with Development/Finance.
3. Create one pilot donation page and one pilot volunteer event in DonorView.
4. Verify URL longevity, branding, mobile behavior, payment methods,
   acknowledgments, recurring attribution, and staff reporting.
5. Continue using reviewed generic HTTPS Campaign actions.
6. Add only bounded administrative destination metadata if the pilot exposes a
   real operational need.
7. Consider aggregate progress synchronization only with a documented supported
   export/API contract.
8. Defer all Giving, payment, volunteer registration, donor sync, and webhook
   implementation until those gates are accepted.

## Failure and reconciliation behavior

- If a destination fails validation or is stale, show a safe staff-visible error and disable the affected public CTA or use an explicitly configured general-giving fallback. Never guess a new URL.
- Destination verification checks only safe allowed hosts and expected HTTPS behavior; it must not follow arbitrary internal-network redirects.
- Imported progress is labeled with source and “as of” time. Failed imports retain the last verified value and visibly mark it stale in admin.
- Person-level synchronization is deferred until stable IDs, merge rules, minimum fields, consent, retention, and error ownership are approved.

## Security and privacy

- Never store DonorView administrator credentials in content records or expose them to the browser.
- Allowlist approved DonorView hosts for public destinations; prevent `javascript:`, open redirects, and arbitrary embed HTML.
- Do not log URL query strings that may contain constituent or campaign data.
- Do not place donor, gift, volunteer, waiver, or attendee payloads into the publication database by default.
- Treat exports as confidential, time-bounded working files: private storage, restricted capability, checksum/provenance, defined purge, and no source-control attachment.

## Primary sources reviewed

- [DonorView features](https://www.donorview.com/features)
- [Donation page models](https://support.donorview.com/support/solutions/articles/9000233616-examples-of-donation-pages)
- [Create/edit/copy a donation page](https://support.donorview.com/support/solutions/articles/9000145350)
- [Publish a donation page](https://support.donorview.com/support/solutions/articles/9000027398-how-do-i-publish-my-donation-page-)
- [Sharing DonorView pages and links](https://support.donorview.com/support/solutions/articles/9000239504-sharing-donorview-pages-and-links)
- [Advanced donation page designer](https://support.donorview.com/support/solutions/articles/9000239294-using-the-advanced-donation-page-designer)
- [Gift fields: For, Fund, Event, Appeal, and goal category](https://support.donorview.com/support/solutions/articles/9000026782-how-do-i-enter-a-donation-or-general-gift-)
- [Standalone fundraising graphic](https://support.donorview.com/support/solutions/articles/9000210672-can-i-have-a-stand-alone-fundraising-graphic-)
- [Fundraising reports](https://support.donorview.com/support/solutions/articles/9000258780-fundraising-reports)
- [Volunteer module overview](https://support.donorview.com/support/solutions/articles/9000237566-volunteer-module-overview)
- [Volunteer applications](https://support.donorview.com/support/solutions/articles/9000237567-volunteer-applications)
- [Volunteer management options](https://support.donorview.com/support/solutions/articles/9000277671-what-are-the-options-for-managing-volunteers-)
- [Recurring and multi-day volunteer events](https://support.donorview.com/support/solutions/articles/9000237550-creating-recurring-or-multi-day-volunteer-events)
- [Volunteer registrations](https://support.donorview.com/support/solutions/articles/9000237568-volunteer-registrations)
- [Volunteer scheduler](https://support.donorview.com/support/solutions/articles/9000237594-volunteer-scheduler)
- [DonorView pricing/module list](https://www.donorview.com/pricing)
- [Duplicate matching criteria](https://support.donorview.com/support/solutions/articles/9000247049-duplicate-record-search-criteria-prevention-identification)
- [Constituent export](https://support.donorview.com/support/solutions/articles/9000027431-can-i-export-constituent-information-)
- [Document export](https://support.donorview.com/support/solutions/articles/9000027494-can-i-export-the-documents-)
- [User rights overview](https://support.donorview.com/support/solutions/articles/9000233858-user-rights-overview-and-access-levels)
- [QuickBooks integration](https://www.donorview.com/quickbooks-integration)
- [DonorView/ConnectedView terms](https://www.connectedview.com/terms-conditions)
- [DonorView/ConnectedView privacy policy](https://www.connectedview.com/privacy-policy)
