# Stripe commerce integration

Status: Accepted for merchandise; donation use is a future conditional option
Last reviewed: 2026-08-14

## Decision

Use Stripe-hosted Checkout Sessions for merchandise payments. The Habitat platform owns catalog, order, line-item snapshot, and fulfillment state. Stripe owns card/payment method data and processor transaction state. Platform servers and logs must never receive or store raw card numbers, CVCs, or full payment method payloads.

Stripe is not the default donation system. DonorView remains preferred when it can supply a targeted Campaign donation destination and remain donor/gift/receipt system of record. A future Stripe donation path may be added only behind the provider-neutral donation boundary and after a separate operational decision.

## Merchandise flow

1. The server validates current local ProductVariant availability and calculates a local order/attempt from server-owned data; it never trusts client prices.
2. The server creates one Checkout Session per attempt using Stripe Price references or server-calculated line items, the local order ID as an opaque reconciliation reference, and an idempotency key.
3. The buyer enters payment and required fulfillment information on Stripe-hosted Checkout.
4. The return page displays a pending/successful experience after retrieving server-side state. It is not proof of payment.
5. The webhook endpoint verifies the raw request body and `Stripe-Signature`, stores the unique event receipt, returns promptly, and invokes idempotent processing.
6. Fulfillment retrieves/verifies the Checkout Session and payment status, records an immutable order-item/totals snapshot, and advances the local order exactly once.
7. Delayed payment success/failure, expiration, refund, and dispute state are reconciled through explicit events or a privileged reconciliation command.

Stripe explicitly requires webhooks for reliable Checkout fulfillment and warns that the success-page redirect alone is insufficient. Fulfillment must tolerate duplicate and concurrent calls.

## Ownership

| Data | Owner |
| --- | --- |
| Product narrative, variants/SKUs, local availability, artist credit | Habitat platform |
| Price shown and purchased line-item snapshot | Habitat platform, with matching Stripe price reference |
| Order and fulfillment status | Habitat platform |
| Checkout Session, PaymentIntent, Charge, payment method, dispute processor state | Stripe |
| Card/account credentials | Stripe only |
| Shipping/contact snapshot needed for fulfillment | Minimum necessary local order fields with defined retention |

Stripe IDs are opaque external references. Stripe metadata contains only non-sensitive identifiers; no applicant, donor, health, household, grant-confidential, or narrative PII.

## Webhook controls

- Separate test and production keys/endpoints/secrets; least-privilege restricted keys where supported.
- Verify signature against the unmodified raw body and enforce Stripe's timestamp tolerance.
- Subscribe only to required event types.
- Uniquely record provider event IDs and also make the domain transition idempotent by Checkout Session/order identity.
- Do not assume event ordering; retrieve current authoritative Stripe objects where needed.
- Return `2xx` before slow downstream work after durable receipt; retry processing from stored state.
- Redact payloads in logs and retain only fields needed for reconciliation/audit.
- Rotate keys/webhook secrets and document overlapping-secret rollout.

## Failure handling

- A Checkout creation timeout is reconciled by idempotency key before another Session is created.
- Duplicate or out-of-order webhook deliveries become no-ops or valid later transitions, never duplicate fulfillment.
- A paid order that failed local processing is visible in an admin reconciliation queue.
- A local “paid” state that cannot be confirmed in Stripe is blocked from fulfillment and escalated; staff cannot force payment state through a generic edit form.
- Refunds/disputes update local operational state without rewriting the original order snapshot.

## Conditional future donation use

Stripe-native donations require a new or amended ADR covering:

- one-time and recurring gift lifecycle;
- tax acknowledgments/receipts and wording ownership;
- designation/fund/accounting reconciliation;
- refunds, disputes, failed recurring payments, and donor service;
- donor consent, privacy requests, deduplication, and how DonorView remains or ceases to be system of record;
- fees, payout reconciliation, reporting, and QuickBooks workflow;
- accessibility and payment-method configuration.

Until that decision is accepted, a `DonationDestination` may reference DonorView (preferred) but no Stripe donation Checkout is implemented.

## Scaffold and test requirements

- Pin a supported Stripe SDK/API version and record upgrade policy; do not rely on an unpinned default API behavior.
- Use Stripe CLI/test mode fixtures to test completed, async succeeded/failed, expired, duplicate, invalid signature, replay, and out-of-order cases.
- Prove no fulfillment occurs from an unverified client redirect.
- Prove server pricing rejects client price/quantity tampering and unavailable variants.
- Confirm tax, shipping, returns/refunds, inventory policy, statement descriptor, receipt settings, and nonprofit account ownership before launch.

## Primary sources

- [Stripe-hosted Checkout](https://docs.stripe.com/payments/checkout)
- [Checkout Session API](https://docs.stripe.com/api/checkout/sessions)
- [Reliable, idempotent Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Webhook signature, replay, duplicate, and ordering guidance](https://docs.stripe.com/webhooks)
