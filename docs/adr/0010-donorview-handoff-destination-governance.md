# ADR-0010: Governed DonorView handoff destinations

Status: Accepted
Date: 2026-08-18

## Context

The public platform needs organization-wide and Campaign-specific Donate and
Volunteer actions, but DonorView remains the system of record for donations,
pledges, constituents, volunteer applications, registrations, attendance, and
hours. Copying raw URLs into editorial content makes review, replacement,
deactivation, and authorization difficult.

## Decision

Create a bounded `DonorViewDestination` aggregate with an explicit DonorView
provider, code-owned purpose, reviewed HTTPS URL, verification state, version,
and audited administrator mutations. A singleton engagement configuration
assigns at most one current canonical General Donate and General Volunteer
destination. Campaign Donate and Volunteer actions reference a governed
destination identity; Learn More actions retain their existing HTTPS URL
boundary.

Only active, verified destinations are publicly resolved. Public Campaign
reads resolve the current destination URL and state, so replacing or
deactivating a destination does not mutate an immutable Campaign editorial
snapshot. Invalid, inactive, or unverified destinations produce no clickable
public CTA. Destination management requires
`integrations.donorview.configure`; read/selection requires
`integrations.donorview.read`.

The application does not collect payment or volunteer data, infer conversion,
embed DonorView, scrape pages, call an undocumented API, or implement
reachability as verification. Manual administrator review is authoritative.

## Consequences

- A destination can be replaced and reverified independently of Campaign
  editorial release.
- The previous URL is not copied into audit summaries; the immutable
  destination record and audit target preserve operational history without
  exposing query data.
- Existing pre-G1 Campaign URL rows remain readable for compatibility. New G1
  admin Donate/Volunteer actions use verified destination IDs.
- A missing global assignment safely removes the corresponding public shell
  action rather than guessing a fallback.
- DonorView URL stability remains an operational review concern; copied pages
  must be recorded as new destinations and reverified.
