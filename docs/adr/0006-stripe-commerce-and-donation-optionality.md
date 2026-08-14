# ADR-0006: Use Stripe Checkout for commerce and keep donations conditional

- Status: Accepted
- Date: 2026-08-14

## Context

The Shop needs payments for Habitat merchandise and local-artist collaborations. The platform must not store card data. Donations have different donor, recurring-gift, designation, receipt/tax acknowledgment, refund, accounting, consent, and CRM responsibilities already centered in DonorView.

## Decision

Use Stripe-hosted Checkout Sessions for merchandise. The platform owns Product, ProductVariant, Order, immutable OrderItem/totals snapshots, and fulfillment; Stripe owns payment methods and processor state.

Create Checkout Sessions server-side from server-owned price/availability, correlate with an opaque local order reference/idempotency key, verify Stripe webhooks against the raw body and timestamp, record provider event IDs, retrieve authoritative state where needed, and fulfill idempotently. A success redirect never proves payment.

Keep donation calls to action provider-neutral. Prefer DonorView targeted destinations while it meets the operational need. Stripe donation processing is a future option only after a separate decision covering donor/receipt/recurring/accounting and DonorView synchronization responsibilities.

## Consequences

- Card data remains on Stripe-hosted surfaces and out of Habitat servers/logs.
- Local orders remain useful for fulfillment without becoming a payment ledger.
- Webhook/reconciliation code must handle duplicate, concurrent, delayed, and out-of-order events.
- Stripe product/price identifiers are references; they do not replace the Habitat catalog.
- Donation-provider flexibility is preserved without prematurely operating two donor systems.

## Rejected alternatives

- **Custom card form/direct card handling:** unnecessary PCI/security scope.
- **Fulfill on success redirect:** spoofable and unreliable.
- **Stripe as product/order system of record:** insufficient for Habitat-specific catalog, artist, and fulfillment relationships.
- **Stripe donations by default:** unresolved donor/receipt/accounting duplication.
- **Use DonorView for merchandise:** not established as the desired commerce/fulfillment platform.

## Validation

Test invalid signature, replay, duplicate/concurrent and out-of-order events, delayed success/failure, Checkout expiration, client price tampering, refund/dispute reconciliation, and “fulfill exactly once.” Confirm tax, shipping, inventory, return/refund, receipt, statement descriptor, and nonprofit account operations before launch.

## Primary references

- [Stripe Checkout](https://docs.stripe.com/payments/checkout)
- [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe webhook guidance](https://docs.stripe.com/webhooks)
