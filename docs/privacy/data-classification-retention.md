# Data classification and retention

Status: Accepted classification/handling principles; proposed retention defaults require legal, accounting, contract, and operational approval before affected production collection
Last reviewed: 2026-08-14

## Principles

- Collect the minimum data needed for a defined Habitat purpose.
- Assign an owner, classification, retention profile, and disposal path before collection.
- Public content is released deliberately; “not secret” does not mean “approved for publication.”
- Keep authoritative donor/volunteer data in DonorView and payment data in Stripe rather than copying it.
- Separate source records from public projections. Consent, permission, source, approver, and as-of time travel with the projection.
- Do not collect Social Security numbers. Do not reproduce homeowner/application PDF-by-email intake.
- Unknown content is not an unknown requirement: incomplete biographies, rosters, totals, or dates do not justify collecting private data early.

## Classification levels

| Class | Definition | Examples | Minimum handling |
| --- | --- | --- | --- |
| Public | Explicitly approved for unrestricted publication | active publication snapshots, public programs/projects, approved leadership profiles, published grant impact, public media | Integrity/availability controls; immutable publication history; no private source fields |
| Internal | Routine non-public operational data whose disclosure has limited impact | drafts without sensitive narratives, content calendar, quality issues, non-secret settings, aggregate admin dashboards | Authenticated access, capabilities, no public cache/search, normal encrypted storage |
| Confidential | PII, business/contract information, or operational records that could harm people/organization | admin email/profile, invitations, buyer/shipping details, unpublished consent evidence, private grant notes/budgets, DonorView exports | Need-to-know capabilities, encrypted transport/storage, private objects, audit for sensitive actions, redacted logs |
| Restricted | Highest-impact identity/case/security/payment data | applicant/household/eligibility/case notes, supporting documents, auth/session tokens, OAuth/client/webhook/storage secrets, raw provider credentials | Dedicated boundary, least privilege, fresh auth, sensitive read/export audit, never public/search/analytics, strict retention and incident procedure |

Raw card number/CVC data is prohibited, not merely Restricted: the platform must never receive or store it. SSNs are also prohibited.

## Domain classification

| Domain/data | Class | Authoritative owner / notes |
| --- | --- | --- |
| Published Story/News snapshot and approved public media | Public | Habitat platform |
| Story/News drafts, revisions, review comments, schedule | Internal; Confidential if participant/grant-sensitive | Habitat platform; confidential content must not be used to bypass private domain boundaries |
| Author/person public profile | Public after approval | Habitat platform |
| Private contact details and admin identity link | Confidential | Habitat platform/Google identity reference |
| Roles/capabilities/audit metadata | Internal/Confidential | Habitat platform |
| Session/invitation bearer tokens, any persisted OAuth access/refresh/ID tokens, and integration secrets | Restricted | Better Auth/platform secret store; minimize or avoid OAuth-token persistence, encrypt any required token, and never place token values in responses or audit logs |
| Public Projects/Programs/Impact/GrantImpact | Public after verification | Habitat platform projection |
| Participant name/story/photo/address | Confidential source; Public only as specifically consented projection | Never infer consent; avoid public home address/geolocation |
| Donor, gift, recurring agreement, receipt | Confidential | DonorView; local copy prohibited by default |
| Volunteer application/waiver/registration/attendance/hours | Confidential, potentially Restricted by field | DonorView; local individual copy prohibited by default |
| DonorView aggregate export | Confidential | Temporary local working data with source/as-of/provenance |
| Product catalog | Public | Habitat platform |
| Order and buyer/shipping data | Confidential | Habitat platform; Stripe owns payment processing |
| Stripe IDs/status/totals | Internal/Confidential | Minimum reconciliation fields only |
| Private grant proposal/agreement/budget/report/note | Confidential; Restricted where credentials/bank/person data appear | Future private Grant Administration |
| Applicant/household/eligibility/supporting document/case note | Restricted | Future private casework; no collection until approved design |
| Analytics/correlation data with IP or stable visitor ID | Confidential until minimized/aggregated | Vendor selection must honor this policy |
| PublicStorySubmission name, email, relationship, story text, acknowledgements, sensitivity declarations, and internal review note | Confidential | Field-minimum text-only aggregate; never public/search/analytics/logs; manual content retention only until owner, privacy text, consent, and retention profile are approved; spam restoration is audited and preserves content |
| Public Story intake token hashes, HMAC rate-limit fingerprints, expiry, and bounded counters | Confidential operational security artifact | No raw token, nonce, IP, email, user agent, or request body; expire and clean through the bounded C6B-1B cleanup path; not subject to the unresolved submission-content retention profile |

The C6B-2A/2B administrative inbox is a review surface, not a new collection
or retention policy. It server-renders the minimum list/detail DTOs only after
capability authorization, excludes confidential detail from list rows and
prefetch, disables shared/static caching, and does not write submission data to
browser storage, analytics, metadata, URLs, or status messages. The unresolved
G-07 decisions for owner, privacy wording, follow-up, and submission-content
retention remain prerequisites for any visible public form.

## Retention schedule

Periods below are proposed deletion targets after the triggering event, not assertions of legal requirements. The accountable policy owners must approve them before affected production collection. A grant/contract, accounting requirement, litigation/audit hold, insurer, or approved legal policy may require a different period; each exception records owner, basis, scope, and review date. Do not retain everything “just in case.”

| Record | Proposed default retention | Disposal/projection rule |
| --- | --- | --- |
| Published snapshots, approval evidence, revisions supporting published work, redirects, institutional history | Retain while of continuing institutional/historical value; review at least every 5 years after withdrawal | Keep revisions and audit evidence restricted if public display ends; do not silently rewrite history |
| Abandoned unpublished Communications drafts with no legal/historical need | 2 years after last activity | Notify owner where practical; purge content and orphaned assets through audited job |
| Rejected/quarantined uploads | 30 days after final rejection | Secure deletion; retain only non-sensitive scan/audit metadata if needed |
| Unused draft public media | 2 years after last relationship/activity | Check rights, snapshot references, and holds before deletion |
| Published media | While referenced or institutionally valuable, with 5-year review after last public use | Withdrawal can end public access immediately; retain restricted evidence as rights/consent policy requires |
| Admin invitation token | Until acceptance, cancellation, or at most 7 days | Delete/irreversibly invalidate bearer token; retain invitation audit metadata 7 years |
| Active auth session | Up to configured 12-hour maximum | Revoke/delete on expiry/logout/suspension; retain token-free security audit metadata 1 year unless incident hold |
| Google OAuth access/refresh/ID token | Do not retain after identity establishment where supported; otherwise only for the minimum authenticated-account purpose | Encrypt through the auth library, use versioned key rotation/recovery, exclude from all responses/logs/audit/fixtures/exports, and delete on unlink/deactivation or earlier expiry |
| Admin identity/access assignment history and sensitive audit events | 7 years after user deactivation/event | Append-only restricted archive; minimize IP/user-agent detail after 1 year unless incident need |
| Routine application/security logs | 30 days searchable, up to 1 year restricted archive where operationally justified | Redact before ingestion; never log tokens, private documents, card data, or unnecessary PII |
| DonorView/Stripe inbound event raw body | Prefer fields-only receipt; if raw body required, 30 days | Retain provider ID/type/result/redacted reconciliation metadata 7 years for financial events, 1 year otherwise |
| Temporary DonorView exports/import working files | 30 days after successful reconciliation, sooner when possible | Private storage only; secure delete; retain aggregate result/checksum/source/as-of metadata |
| Campaign progress/ImpactSnapshots | While attributable evidence remains useful; review every 5 years | Preserve methodology/source/as-of; remove underlying temporary PII |
| Local orders and financial/tax transaction snapshots | 7 years after transaction/fiscal close | Retain minimum accounting/reconciliation fields; legal/accounting review may adjust |
| Buyer shipping/contact fields not required for accounting | 18 months after fulfillment/return/dispute closes | Delete or irreversibly anonymize while retaining non-identifying order/accounting facts |
| Failed/abandoned checkout attempt | 30 days after expiry, absent fraud/incident need | Remove buyer/session data; retain aggregate metrics only |
| Private awarded-grant administration | 7 years after grant close/final report, or longer contract term | Contract-specific schedule/hold overrides; delete private objects and indexes together |
| Private unsuccessful grant proposal | 3 years after final decision unless reusable/institutionally required | Review and purge confidential drafts/documents; retain non-sensitive opportunity history if useful |
| Backups | 35 days rolling by default | Encrypted/access-controlled; deletion propagates by backup expiry; confirm provider/PITR configuration |
| Raw web analytics identifiers/IP | 30 days or less | Prefer privacy-preserving aggregation; retain aggregate statistics without stable identifiers |

### Applicant/casework retention gate

No applicant, household, eligibility, supporting-document, or case-note collection may begin until Habitat approves a program-specific schedule covering application outcomes, funding/contract requirements, fair-housing/legal counsel input, document-by-document need, deletion, holds, appeals, access logs, backups, and consented public projections. The product must reject or omit collection where no approved profile exists. “Keep forever” and reuse of the legacy email/PDF process are not acceptable defaults.

## Collection and field rules

- Each form field has purpose, owner, required/optional status, classification, validation, retention profile, and downstream recipients.
- Avoid free text where structured minimum data works; free text can accidentally capture Restricted data.
- Never ask editors to place private applicant/grant/donor facts in Story/News drafts as a workaround.
- Object keys, URLs, filenames, Stripe metadata, analytics events, and logs use opaque identifiers rather than names, email, addresses, grant secrets, or case facts.
- Do not publicly reveal participant/home addresses, precise geolocation, routine schedules, eligibility details, or household composition.
- Newsletter signup must record consent source/time and honor suppression in the selected delivery system of record; the platform does not maintain a shadow mailing list.

## Consent, rights, and public projections

- A participant photo/story projection records what uses/channels were approved, subject(s), asset/version, date, approver, expiration/revocation if applicable, and evidence location.
- A partner/funder relationship does not imply logo/testimonial permission.
- Alt text and captions must not reveal private disability, eligibility, address, financial, household, or case information.
- Consent withdrawal removes future public use promptly while restricted evidence and immutable audit facts follow their retention/legal basis.
- Corrections, access, deletion, and suppression requests are routed to the authoritative owner: Habitat for local data, DonorView for donor/volunteer truth, Stripe for processor data, with coordinated tracking so the requester is not sent in circles.

## Access and handling

- Public data still requires integrity approval; only publication snapshots or explicit public projections are served publicly.
- Internal/Confidential/Restricted data is excluded from public caches, search indexes, sitemaps, analytics payloads, error reports, support screenshots, and non-production fixtures.
- Confidential exports require a stated purpose and expire automatically. Restricted exports additionally require fresh authentication, narrow capability, reason, and audit.
- Private documents stream through an authorized server path with safe content-disposition and no shared permanent URL.
- Production data is not copied into preview/development. Use synthetic fixtures.
- Vendor selection must review data processing terms, subprocessors, breach/support process, deletion/export, region, backup, and role access proportional to classification.

## Deletion and holds

Deletion is a domain operation that covers database rows, search indexes, cache keys, object variants, provider copies under Habitat control, queued jobs, and eventual backup expiry. It records actor, scope, reason, result, and exceptions without retaining the deleted sensitive content in the audit event.

A hold suspends only the relevant scheduled deletion, has an authorized owner and basis, and is reviewed at least annually. Ending a hold restarts the normal retention clock; it does not create permanent retention automatically.

## Review cadence

Review this policy before launching Communications uploads, commerce, analytics/newsletter integration, private Grant Administration, or applicant intake; after a material vendor/data-flow change; after an incident; and at least annually once production data is collected.
