# Open gates and non-blocking verification

Status as of 2026-08-16. A gate is scoped to the first slice it can block; it is not permission to reopen accepted decisions. Content facts are listed separately because unknown content is not an unknown requirement.

## Gates

| ID | Gate | Owner/evidence needed | Blocks | Resolution criterion |
|---|---|---|---|---|
| G-02 | Live authentication environment acceptance | Technical lead plus Fayette Habitat Google/Vercel owners | Enabling production authentication; not feature development on the accepted local identity boundary | The Slice 1 scaffold pins the selected stack and directly tests the application invitation/activation hooks, provider-subject and token/session database constraints, capabilities, suspension, migration, and Node/build compatibility. Using organization-controlled clients and isolated data, complete the real Better Auth Google callback/state/origin/cookie flow, current signed claims, different-`sub`/same-email rejection, cross-instance revocation, preview policy, and production-domain exercise recorded in the [auth spike](../development/auth-spike.md). Amend the ADR before implementation only if that exercise invalidates the accepted design. |
| G-03 | DonorView account and integration contract | Fayette Habitat account admin plus DonorView/vendor | Slice 6 mechanisms beyond hosted links/manual controlled exchange | Obtain plan/module list, API/export/import/webhook/automation documentation if available, sandbox, stable IDs, rate/cost limits, security/DPA package, and supported reconciliation process. No public evidence currently proves a general API, webhook, or Zapier capability. |
| G-04 | Targeted DonorView donation destination demonstration | Fayette Habitat development admin | Launch of project/campaign-directed giving | Demonstrate that an admin can create a designated destination, obtain a stable hosted URL or supported embed, control designation/reporting, test one-time/recurring gifts and receipts, and report/reconcile the result. If it fits, use it. |
| G-05 | Infrastructure and environment decisions | Technical/product owner | Production use of Slices 1–3 | Confirm GitHub/Vercel ownership, environments, region/data residency, Neon and storage accounts, preview isolation, DNS, secret custody/rotation, backups/PITR, budget/alerts, and incident contacts. Provider adapter boundaries remain accepted. |
| G-06 | Commerce operating policy | Operations/finance and Slice 8 lead | Slice 8 implementation details and commerce launch | Approve inventory authority, unique versus quantity stock, reservation timeout, tax/shipping, pickup, fulfillment, cancellation/refund/chargeback handling, artist relationship/payment boundary, retention, and support ownership. |
| G-07 | Legal/privacy/consent publication controls | Executive/authorized policy owner with counsel where needed | Launch of the affected collection or claim, public Story intake, or submission upload; not schema/platform work | Approve privacy notice, cookie/analytics posture, media/participant/minor consent rules, public Story Submission owner and retention/contact text, private-upload handling, donation fee/usage claims, planned-giving language, raffle/event claims, and records schedule. |
| G-08 | Private grants product and security review | Grants owner and security/privacy lead | Future private grant-administration feature only | Define users, workflow, fields/documents, storage, retention, exports, audit, contacts, deadline alerts, and the deliberate public projection. |
| G-09 | Homeowner/assistance application product and security review | Program owner and security/privacy lead | Future applicant capability only | Define minimum data, secure collection, eligibility/case workflow, documents, access/segregation, retention/deletion, notices/consent, vendor involvement, and incident response. SSNs and email/PDF intake remain prohibited. |

## Resolved gates

| ID | Resolution | Evidence |
|---|---|---|
| G-01 | Resolved 2026-08-14. The Communications review fixed the V1 journeys, typed models, four lifecycle dimensions, placement scope, Dashboard/Queue, taxonomy, relations, Newsletter boundary, and V1/later split. It no longer blocks issuing Slice 1. | [Communications architecture](../architecture/communications.md) and [completed review record](../product/communications-review-runway.md) |
| C4 closure | Resolved 2026-08-15. Homepage curation and shared ContentPlacement implementation evidence is complete, including target eligibility, public projection-only resolution, windows/cancellation, concurrency, audit atomicity, successor release, migration upgrade, browser/accessibility/visual validation, and local-preview CSP coverage. No C4-specific gate remains open. | [C4 development record](../development/c4-homepage-curation.md), [Communications architecture](../architecture/communications.md), and [delivery roadmap](implementation-roadmap.md) |
| C5 closure | Resolved 2026-08-16. Publication Queue and Communications Dashboard implementation evidence is complete, including capability-filtered read models, protected server-rendered routes, typed Story/News routing, negative authorization, browser journeys, axe scans, responsive/visual review, and PostgreSQL regression. No C5-specific gate remains open. | [C5B-2B validation record](../development/c5b2b-communications-dashboard-validation.md), [C5A-2B validation record](../development/c5a2b-publication-queue-validation.md), and [delivery roadmap](implementation-roadmap.md) |
| C6A closure | Resolved 2026-08-16. Site Notice domain, protected administration, public SITE_WIDE/HOMEPAGE rendering, lifecycle/concurrency/authorization journeys, axe/manual accessibility, four-viewport visual review, dynamic/CSP/console checks, and full browser/PostgreSQL regression are complete. No C6A-specific gate remains open. | [C6A-2B validation record](../development/c6a2b-site-notice-validation.md) and [delivery roadmap](implementation-roadmap.md) |

The implementation half of the original G-02 spike was completed on 2026-08-14. Its executable evidence and intentionally unclaimed provider checks are recorded in the [Slice 1 authentication spike](../development/auth-spike.md); the narrowed live-environment criterion remains open above.

## Non-blocking human verification

The detailed backlog is in [../product/content-verification.md](../product/content-verification.md). These facts gate publication of the affected content, not implementation of an approved structure:

- current Board, committees, Executive Director/staff biographies, terms, and consent;
- founding history and reconciled impact totals/methodologies;
- active Programs, eligibility, application availability, and Camp St. Cottages status/figures;
- ReStore address, ZIP code, hours, closures, and donation guidance;
- current Events, raffle/legal facts, planned-giving language, and donation-use/fee claims;
- grant awards/impact, partner relationships, logo permission, and attribution;
- participant story/photo releases, privacy-safe location, and name/image consent;
- newsletter issues, media rights, alt text, and external-link destinations.

An unverified fact stays draft, omitted, or explicitly unavailable. It does not invite an engineer to invent a requirement or copy the Wix version.

## Not blockers by design

- Final public labels (`Stories`, `Journal`, or `The Habitat Journal`) and final navbar placement can be resolved through design/content work without changing the accepted Communications domain.
- Final Dashboard visual composition within its four accepted modules, the V1.1 derived calendar UX, press releases, and any future justified Communications Package remain later design choices.
- The absence of a documented real-time DonorView integration does not block public content, hosted handoffs, or provider-neutral ports.
- Private grant administration and applicant intake are intentionally deferred; their absence does not block launch of the public platform.
