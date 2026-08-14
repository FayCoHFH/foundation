# DonorView integration boundary and account questionnaire

Status: Accepted boundary; mechanisms requiring account/vendor confirmation are explicitly marked
Evidence reviewed: 2026-08-14

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
- [Gift fields: For, Fund, Event, Appeal, and goal category](https://support.donorview.com/support/solutions/articles/9000026782-how-do-i-enter-a-donation-or-general-gift-)
- [Volunteer module overview](https://support.donorview.com/support/solutions/articles/9000237566-volunteer-module-overview)
- [Recurring and multi-day volunteer events](https://support.donorview.com/support/solutions/articles/9000237550-creating-recurring-or-multi-day-volunteer-events)
- [DonorView pricing/module list](https://www.donorview.com/pricing)
- [Duplicate matching criteria](https://support.donorview.com/support/solutions/articles/9000247049-duplicate-record-search-criteria-prevention-identification)
- [Constituent export](https://support.donorview.com/support/solutions/articles/9000027431-can-i-export-constituent-information-)
- [Document export](https://support.donorview.com/support/solutions/articles/9000027494-can-i-export-the-documents-)
- [User rights overview](https://support.donorview.com/support/solutions/articles/9000233858-user-rights-overview-and-access-levels)
- [QuickBooks integration](https://www.donorview.com/quickbooks-integration)
- [DonorView/ConnectedView terms](https://www.connectedview.com/terms-conditions)
- [DonorView/ConnectedView privacy policy](https://www.connectedview.com/privacy-policy)
