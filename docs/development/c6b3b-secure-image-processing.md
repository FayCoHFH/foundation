# C6B-3B Secure Story Submission image processing

Status: Complete locally on 2026-08-17.

## Delivered boundary

C6B-3B turns an already-authorized confidential Story Submission original into
one confidential, review-only JPEG derivative. The server-only processor first
claims `UPLOADED` media with an optimistic version transition to `PROCESSING`,
then reads the private quarantine object, validates it from bytes, decodes and
sanitizes it, writes the derivative under a separate opaque private namespace,
and atomically records `READY` plus safe technical facts. `READY` remains only
technical readiness: it is not malware clearance, rights/consent approval,
MediaAsset promotion, Story conversion, or public eligibility.

JPEG/JPG, PNG, WebP, HEIC, and HEIF inputs are accepted only when their
signature, declared MIME type, and a supplied filename extension agree. JPEG,
PNG, and WebP use Sharp 0.35.3. HEIC/HEIF uses `heic-decode` 2.1.0 and its
WASM libheif decoder before the same Sharp JPEG encoding path; this avoids the
absence of an HEVC decoder in Sharp's macOS prebuilt binary and is not tied to a
native decoder platform. A real generated single-image HEIC fixture is covered
on macOS ARM64. Sharp remains the locked production image encoder and installs
its supported Linux binary for production deployments.

The processor re-checks the 10 MB byte limit, allows at most 12,000 pixels per
axis and 80 million pixels total, rejects animation/multi-image input, applies
orientation normalization, strips metadata by decode/re-encode, and never
upscales. The review JPEG's longest edge is at most 2,400 pixels. Transparent
PNG/WebP/HEIF input is intentionally flattened onto white before JPEG encoding;
the policy is deterministic and review-only.

`MIME_TYPE_MISMATCH` and `MULTI_FRAME_UNSUPPORTED` are new safe rejection
codes. Content failures move `PROCESSING` to `REJECTED`, clear ordering, and
delete confidential original/partial derivative objects. A transient storage
failure returns only the unchanged original to `UPLOADED` for one later
server-side retry; no job system or automatic retry loop is introduced. A
version-protected final write prevents stale processors from replacing a ready,
removed, expired, or submitted-media result. Removing ready media and expiry
cleanup delete both private objects; successful processing deliberately retains
the original under the unresolved submitted-media retention policy.

Separate malware scanning is not required for the initial image pipeline; it
remains an optional future defense-in-depth enhancement. There is no
public route, upload form, admin media UI, download URL, public derivative,
rights/consent/evidence model, clearance, promotion, or browser work. DTOs
continue to omit raw or derivative object keys, checksums, bytes, decoder
details, EXIF/GPS, upload authorizations, and credentials. Processing logs do
not introduce those values.

## Resource and validation notes

The processor is server-only and invoked one item at a time; it adds no
unbounded fan-out or storage listing. Byte and decoded-pixel guards execute
before derivative creation, derivative output is bounded, PostgreSQL stores
facts only (never binary/base64), and cleanup uses bounded row batches.
Synchronous processing is acceptable for this 10 MB/80 MP bounded private path
while public intake remains disabled; asynchronous orchestration can be
evaluated before any public upload launch.

Focused unit coverage exercises signatures and mismatches, corrupt input,
orientation/EXIF stripping, transparency flattening, no-upscale/bounded output,
real HEIC conversion, multi-frame WebP rejection, and dimension limits.
PostgreSQL/storage coverage exercises ready persistence, private derivative
separation, original retention, removal cleanup, permanent rejection cleanup,
transient reset, and two-processor ownership. Full regression, migration,
format, lint, type, and production-build commands are recorded with the slice
delivery result. The C6B visible form and G-07 policy, retention, abuse,
rights, consent, clearance, and public-delivery gates remain open.
