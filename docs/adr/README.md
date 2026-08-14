# Architecture decision records

ADRs record consequential decisions and their rationale. An accepted ADR changes only through a later superseding ADR; implementation detail discovered during a slice is recorded in that slice unless it changes the decision.

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-0001](./0001-modular-monolith.md) | Modular Next.js monolith | Accepted |
| [ADR-0002](./0002-authentication-and-sessions.md) | Better Auth, Google OIDC, database sessions, local capabilities | Accepted |
| [ADR-0003](./0003-publication-revisions-and-snapshots.md) | Shared publication infrastructure with typed Stories/News and immutable snapshots | Accepted |
| [ADR-0004](./0004-donorview-donation-boundary.md) | DonorView system-of-record and provider-neutral donation destinations | Accepted |
| [ADR-0005](./0005-public-private-object-storage.md) | Separate public/private object storage behind an adapter | Accepted |
| [ADR-0006](./0006-stripe-commerce-and-donation-optionality.md) | Stripe Checkout for commerce; donations remain conditional | Accepted |
| [ADR-0007](./0007-structured-rich-text.md) | Schema-versioned Tiptap/ProseMirror JSON | Accepted |

## Lightweight process

1. Use the next available four-digit number.
2. Record context, decision, consequences, alternatives, and validation/follow-up.
3. Status is `Proposed`, `Accepted`, `Superseded`, or `Rejected`; add a superseding link rather than rewriting history.
4. Do not create ADRs for reversible mechanics unless they affect security, ownership, interoperability, or long-lived architecture.
