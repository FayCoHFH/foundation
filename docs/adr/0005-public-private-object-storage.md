# ADR-0005: Separate public and private object storage

- Status: Accepted
- Date: 2026-08-14

## Context

The platform needs publicly delivered editorial/project/commerce media and, later, confidential grant/applicant documents. Public object URLs cannot be made safely private after disclosure, and application authorization cannot protect a permanently public URL. Uploads also introduce spoofed file types, malware, metadata disclosure, and immutable-publication concerns.

## Decision

Use distinct public and private object-storage stores behind a small application adapter.

- Public store: only validated, scan-complete, publication-eligible assets intended for unrestricted delivery.
- Private store: drafts not intended for direct delivery, consent/license evidence, private grant documents, and all future applicant/case documents.
- Private downloads stream through an authenticated and capability-authorized server route; no permanent bearer URL is persisted in content.
- Object keys are opaque, server-generated, immutable/versioned, and contain no PII.
- `MediaAsset` metadata in PostgreSQL records classification, storage key, checksum, server-determined type/size, scan state, source description/credit, consent/license, uploader, and eligibility. The relationship or publication snapshot records the contextual alt text/decorative treatment and caption used in that presentation.
- Replacing a file creates a new object/version; published snapshots retain the approved version.

Vercel Blob is the preferred first provider because it currently offers separate public/private stores and integrates with the chosen deployment, but the adapter keeps the domain portable. Final provider use requires cost, DPA/subprocessor, region, retention/deletion, private-delivery, processing, and malware-scanning review. The boundary does not depend on that vendor choice.

## Consequences

- Public delivery can use CDN caching while confidential access remains application-authorized.
- Moving an asset from draft/private to public is a controlled copy/publication event, not an ACL toggle.
- Private delivery consumes function bandwidth/latency and must set safe caching/content-disposition headers.
- Database deletion and object/variant deletion need a coordinated lifecycle and backup-expiry behavior.
- Upload/media processing must be selected before accepting each risky format.

## Rejected alternatives

- **One public bucket with unguessable URLs:** secrecy of a URL is not authorization.
- **One private bucket proxying all public media:** unnecessary cost/latency and weaker CDN behavior.
- **Store files in PostgreSQL or Git:** poor fit for large media, delivery, and lifecycle.
- **Trust extension/client MIME/original filename:** trivial to spoof.
- **Overwrite published object keys:** cache and audit ambiguity.

## Validation

Before uploads launch, confirm provider configuration and least privilege, size/type allowlists, magic-byte/decode validation, metadata stripping, quarantine/scan behavior, safe SVG/PDF policy, signed upload constraints, private-download authorization, cache headers, deletion/backup lifecycle, and public/private leakage tests.

## Primary references

- [Vercel Blob public/private storage and immutable-object guidance](https://vercel.com/docs/vercel-blob)
- [Vercel Blob security](https://vercel.com/docs/vercel-blob/security)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
