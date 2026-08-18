# Giving & Volunteer G1 — DonorView handoff foundation

Status: Implemented locally on 2026-08-18
Branch: `codex/g1-donorview-handoff`

G1 adds a bounded destination-governance layer without implementing donation,
payment, donor, volunteer, API, webhook, embedded-form, or aggregate-progress
features.

## Implemented boundary

`DonorViewDestination` records the explicit DonorView provider, code-owned
purpose, administrative label, approved HTTPS URL, optional page/reference
label, verification state, reviewer, version, and timestamps. URLs are
restricted to known DonorView public hosts (`app.donorview.com` and
`app.dvforms.net`) plus exact server-configured hosts from
`DONORVIEW_APPROVED_HOSTS`; credentials, fragments, local/private/link-local
IP literals, and arbitrary HTTPS hosts are rejected.

The administrative surface is `/admin/engagement` and is labeled “DonorView
Destinations.” Authorized readers can inspect destinations and bounded usage;
configuration capability holders can create, edit, verify, deactivate, and
assign the two global entry points. URL changes reset verification. Every
consequential mutation requires the expected version and writes a redacted
audit event.

The public header/footer resolve only verified global destinations. Campaign
Donate and Volunteer actions select verified Campaign Donate or Volunteer Event
destinations. Public Campaign resolution checks the current destination state;
inactive, unverified, missing, or mismatched destinations are omitted rather
than rendered as broken links. Handoffs use same-tab external links and do not
claim conversion.

## Explicitly deferred

- DonorView payment or volunteer forms, payment SDKs, Stripe, and local
  receipts;
- donor/constituent or volunteer synchronization;
- API, webhooks, scraping, embedded pages, iframes, and automatic redirects;
- reachability checks as a verification mechanism;
- Goal Progress or any other aggregate synchronization;
- local click analytics.

Existing pre-G1 Campaign URL actions remain readable for compatibility. New
Campaign Donate/Volunteer controls expose governed destination selection; the
URL itself is not copied into the new action form.

## Operational guidance

Copied DonorView pages receive new URLs. Staff must create/copy the page,
configure DonorView attribution, publish/test it, record the new URL as a
destination, verify it, and only then assign or attach it publicly. Recurring
pledge attribution remains entirely in DonorView; no local installment model is
introduced.
