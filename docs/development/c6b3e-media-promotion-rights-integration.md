# C6B-3E — Media Library promotion and rights restriction integration

Status: bounded implementation slice, 2026-08-17

C6B-3E adds the explicit bridge from a cleared private Story Submission image
to the public Media Library. It is not a Story conversion, public form, or
automatic attachment. It accepts only a server-generated private review JPEG
derivative from a `READY` source, writes a new public object, and records
provenance in the same serializable operation.

`MediaAsset` is a public sanitized derivative record. Original bytes, original
filename, private quarantine key, suggested credit, confidential notes,
clearance contents, and evidence bytes never cross the boundary. A unique
`PublicStorySubmissionMediaPromotion` records source media/submission, source
version and processing time, actor/time, baseline `WEBSITE_PUBLICATION`, credit
decision, and immutable clearance snapshots.

The only public credit decisions are `VERIFIED_CREDIT`,
`ORGANIZATIONAL_CREDIT`, and `NO_PUBLIC_CREDIT`. The first two require an
explicit bounded credit; the last forbids one. Suggested contributor credit is
never copied automatically.

Promotion delegates eligibility to C6B-3C for `WEBSITE_PUBLICATION`: the
source is Ready, unrestricted, has IMAGE_RIGHTS and all declared/subject
clearances, and current clearances permit website publication. It does not
infer Social, Print, Fundraising Promotional, or Paid Advertising permission.

`MediaUsage` is explicit and narrowly references Story revisions, News
revisions, or Publications. New use re-evaluates current source rights and
restrictions and fails closed. Existing uses are surfaced for bounded review
when a source becomes restricted; no historical use is silently rewritten,
deleted, or withdrawn. Restore remains the existing high-authority review flow.

The public object is written from the review derivative, never the original.
Database, audit, uniqueness-race, and transaction failures compensate the
just-written object. Serializable execution plus unique source provenance
yields one canonical promotion; retries return the existing asset. Public
reads expose only a safe asset DTO.

Promotion requires `communications.media.promote`; MediaUsage creation keeps
the separate `media.public.use` capability. No public route, media picker,
automatic Story/News attachment, social post, print export, or visual work is
part of this slice. G-07 continues to govern production collection, retention,
and policy approval.

## Pre-existing dependency advisory

`pnpm audit --prod` continues to report the previously recorded transitive
`deepmerge-ts@7.1.5` advisory through the Prisma configuration dependency
chain. C6B-3E makes no broad dependency upgrade; remediation remains separately
owned so the bounded promotion change does not alter the locked foundation.
