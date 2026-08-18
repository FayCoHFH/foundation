# C6B-3D — Private clearance evidence documents

## Scope and boundary

C6B-3D adds `PublicStorySubmissionMediaClearanceEvidenceDocument` and its
per-page private review derivatives. This is a separate confidential aggregate
attached only to one C6B-3C clearance; it is not a `MediaAsset`, `MediaUsage`,
Publication, public projection, search record, general document library, or
case-management feature. It adds no route, UI, public form, browser work, or
public delivery.

The supported code-owned formats are PDF, JPEG/JPG, PNG, WebP, HEIC, and HEIF.
The cap is ten retained documents per clearance, 15 MB per PDF, 10 MB per
image, and 25 PDF pages. A document has the closed technical lifecycle
`PENDING_UPLOAD → UPLOADED → PROCESSING → READY`, or terminal `REJECTED` /
`REMOVED`; `READY` means only that bounded technical processing succeeded.

## Storage and authorization

Evidence uses a dedicated `SubmissionClearanceEvidenceStoragePort`, not the
submission image quarantine or a public/private-store download grant. Originals
use `submission-clearance-evidence/original/` and derivatives use
`submission-clearance-evidence/review/`; both receive opaque immutable keys,
Confidential classification, no listing capability, and no durable URL.

An issue operation requires active `communications.submissions.review` and
returns a short-lived signed token bound to exactly one clearance, reviewer
(uploader), document ID, slot, declared format family, byte ceiling, nonce, and
expiry. The nonce is persisted only as a hash and is consumed atomically. The
token is specific to evidence and cannot be exchanged for a C6B-3A image token.
All reviewer operations require the same active capability. Original delivery is
explicit server-side attachment delivery and writes a redacted audit event;
review-page delivery is separately authorized and audited. No safe DTO contains
an original filename, storage key, URL, checksum, parser exception, or binary.

## Processing and PDF safety

Images use the C6B-3B security approach: server-side signature/MIME/extension
agreement, single-frame enforcement, bounded decoding/dimensions/pixels,
orientation normalization, metadata stripping, and JPEG review re-encoding.
The original is retained privately for the review policy.

PDFs require `%PDF-` bytes and agreement with declaration/extension. The PDF
path uses one maintained parser/renderer stack: Mozilla `pdfjs-dist` 5.5.207
plus `@napi-rs/canvas` 0.1.100. PDF.js receives bytes only (never a source URL),
with automatic fetch/streaming, worker fetching, JavaScript evaluation, XFA,
and annotation rendering disabled. Preflight rejects encryption and action
names (`JavaScript`, `JS`, `Launch`, `AA`, `OpenAction`), rejects malformed
documents and dimensions outside image-style bounds, caps at 25 pages, and
rasterizes every page to a bounded private JPEG derivative. Routine review
therefore cannot inline or execute the original PDF.

The dependency choice follows the maintained primary documentation for
[Mozilla PDF.js](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
and [NAPI-RS Canvas](https://napi.rs/docs/introduction/what-is-napi-rs); it
avoids a second PDF stack and avoids host tools such as Ghostscript, ImageMagick,
or Poppler. The lockfile pins resolved packages. `pnpm audit --prod` is part of
the delivery validation; any future advisory is evaluated before an update.

## Verification, replacement, removal, and retention

Existing C6B-3C `EXISTING_HABITAT_RELEASE` references remain valid without an
uploaded file. When a reviewer chooses an uploaded evidence document as the
basis for verification, that exact document must be `READY`, belong to the
clearance, and is recorded as `verificationEvidenceDocumentId`. A selected
document for a verified clearance cannot be removed until a replacement is
ready and verification is updated. Replacements are immutable new records with
`replacesEvidenceDocumentId`; records are never overwritten.

Removal changes the document to `REMOVED`, retains its audit tombstone, and
hard-deletes original and every review derivative using compensating cleanup.
Rejected documents receive the same binary cleanup; the bounded cleanup command
can repair a failed later deletion. There is deliberately no automatic
background retention worker. Submitted-evidence retention remains manual under
G-07 until Habitat approves a schedule/owner/legal-hold procedure.

## Validation evidence

- Unit tests cover size/state/token bounds, all six detected format families,
  JPEG/PNG/WebP/HEIC processing, valid PDF rasterization, PDF page count,
  encrypted and active-content rejection, and MIME/extension mismatch.
- PostgreSQL/storage tests cover aggregate isolation, signed one-use upload,
  processing claim concurrency, safe DTO redaction, original/review capability
  denial and audit, valid PDF review derivative, `READY` verification
  precondition, verified-evidence removal block, rejected cleanup, and retained
  removal tombstone.
- The migration is one Prisma-generated, forward-only C6B-3D migration.

G-07 remains open. No C6B public intake, public evidence delivery, promotion,
or finalized retention policy is implied by this implementation.
