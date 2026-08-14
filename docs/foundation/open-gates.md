# Open gates and non-blocking verification

Status as of 2026-08-14. A gate is scoped to the first slice it can block; it is not permission to reopen accepted decisions. Content facts are listed separately because unknown content is not an unknown requirement.

## Gates

| ID | Gate | Owner/evidence needed | Blocks | Resolution criterion |
|---|---|---|---|---|
| G-01 | Communications product/architecture review | Sven and product/architecture team | Issuing Slice 1 under the agreed planning sequence; detailed Slice 2/4 contracts | Approve MVP journeys, Story/News lifecycle invariants, placement scope, dashboard/queue MVP, classification, relationships, Newsletter boundary, and what remains future. |
| G-02 | Authentication scaffold spike | Slice 1 technical lead, using the accepted auth ADR and then-current primary docs | Completing Slice 1 dependency selection and starting production auth in Slice 3 | Pin supported versions; prove Google sign-in, invitation-only creation, disabled implicit/user-initiated linking and implicit sign-up, different-`sub`/same-email rejection before persistence, OAuth-token non-retention or encrypted Restricted handling, revocable database sessions, active-user/capability lookup, suspension, CSRF/origin behavior, and Vercel/Node compatibility in a disposable branch or focused test harness. Record any ADR amendment before domain implementation. |
| G-03 | DonorView account and integration contract | Fayette Habitat account admin plus DonorView/vendor | Slice 6 mechanisms beyond hosted links/manual controlled exchange | Obtain plan/module list, API/export/import/webhook/automation documentation if available, sandbox, stable IDs, rate/cost limits, security/DPA package, and supported reconciliation process. No public evidence currently proves a general API, webhook, or Zapier capability. |
| G-04 | Targeted DonorView donation destination demonstration | Fayette Habitat development admin | Launch of project/campaign-directed giving | Demonstrate that an admin can create a designated destination, obtain a stable hosted URL or supported embed, control designation/reporting, test one-time/recurring gifts and receipts, and report/reconcile the result. If it fits, use it. |
| G-05 | Infrastructure and environment decisions | Technical/product owner | Production use of Slices 1–3 | Confirm GitHub/Vercel ownership, environments, region/data residency, Neon and storage accounts, preview isolation, DNS, secret custody/rotation, backups/PITR, budget/alerts, and incident contacts. Provider adapter boundaries remain accepted. |
| G-06 | Commerce operating policy | Operations/finance and Slice 8 lead | Slice 8 implementation details and commerce launch | Approve inventory authority, unique versus quantity stock, reservation timeout, tax/shipping, pickup, fulfillment, cancellation/refund/chargeback handling, artist relationship/payment boundary, retention, and support ownership. |
| G-07 | Legal/privacy/consent publication controls | Executive/authorized policy owner with counsel where needed | Launch of the affected collection or claim, not schema/platform work | Approve privacy notice, cookie/analytics posture, media/participant consent rules, donation fee/usage claims, planned-giving language, raffle/event claims, and records schedule. |
| G-08 | Private grants product and security review | Grants owner and security/privacy lead | Future private grant-administration feature only | Define users, workflow, fields/documents, storage, retention, exports, audit, contacts, deadline alerts, and the deliberate public projection. |
| G-09 | Homeowner/assistance application product and security review | Program owner and security/privacy lead | Future applicant capability only | Define minimum data, secure collection, eligibility/case workflow, documents, access/segregation, retention/deletion, notices/consent, vendor involvement, and incident response. SSNs and email/PDF intake remain prohibited. |

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
- Exact dashboard widgets, editorial calendar implementation, press releases, and Story/Communications Package naming/models are future design choices.
- The absence of a documented real-time DonorView integration does not block public content, hosted handoffs, or provider-neutral ports.
- Private grant administration and applicant intake are intentionally deferred; their absence does not block launch of the public platform.
