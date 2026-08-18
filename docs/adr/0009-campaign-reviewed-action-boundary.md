# ADR-0009: Reviewed Campaign action and provider handoff boundary

- Status: Accepted
- Date: 2026-08-18

## Context

The Campaign public/admin experience needs explicit Donate, Volunteer, and Learn
More actions without turning the Campaign domain into a payment, donor, or
volunteer-registration system. Public action configuration is durable content
and must remain auditable, bounded, and safe for projection.

## Decision

Campaign revisions may contain up to five ordered actions from the closed
`DONATE`, `VOLUNTEER`, and `LEARN_MORE` types. Each action has a bounded label
and an HTTPS-only destination. Release copies the reviewed actions into the
immutable public Campaign projection. Public rendering uses ordinary external
links with no iframe, script, credential, token, or browser-side provider
integration.

Donate and Volunteer destinations are provider-neutral handoff points. When
DonorView is the approved system of record, staff may configure its approved
destination, but Campaign does not collect, mirror, reconcile, or own donor,
gift, constituent, volunteer-application, or registration data. The destination
must be replaced only through a separately authorized provider decision.

## Consequences

- Action labels and destinations are reviewed as part of the exact Campaign
  revision and remain in the immutable public snapshot.
- HTTPS parsing, bounded cardinality, and external-link semantics reduce
  credential leakage, script injection, and accidental provider coupling.
- Provider-specific checkout, volunteer intake, receipt, reconciliation, and
  integration behavior remain outside Campaign.

## Alternatives considered

- Embedded provider forms were rejected because they expand the trust boundary
  and would require a separately accepted integration contract.
- Arbitrary action types and JavaScript destinations were rejected because they
  bypass editorial review and could create unsafe or unbounded behavior.

## Validation and follow-up

C2 validates action input and hashing in unit tests, release projection in
PostgreSQL integration tests, public external-link behavior in Playwright, and
strict CSP/privacy checks. DonorView destination confirmation remains a future
integration-discovery item.
