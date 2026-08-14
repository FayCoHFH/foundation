# ADR-0007: Store schema-versioned Tiptap/ProseMirror JSON

- Status: Accepted
- Date: 2026-08-14

## Context

Stories need rich editorial structure—headings, quotations, galleries, media, relationships, calls to action, and accessible semantics—and News needs a smaller set. Storing arbitrary HTML creates persistent XSS, inconsistent presentation, inaccessible markup, fragile migrations, and editor lock-in. Plain Markdown alone does not cleanly represent typed Habitat relationships and rich-media blocks.

## Decision

Use Tiptap as the initial editor toolkit and canonical ProseMirror-style JSON as the stored rich-text document.

- Each document records a Habitat-owned `schemaVersion` separate from package versions.
- Each publication type has an explicit node/mark/attribute allowlist; News can use a subset of Story nodes.
- Store semantic nodes and stable local references (for example, media/CTA/metric references), never arbitrary component props, raw HTML, executable code, permanent signed URLs, or embedded secret/provider payloads.
- Validate the complete JSON against the exact server schema on save, submit, approve, and publish.
- Render through a server-owned mapping of known nodes to accessible components with escaped text and allowlisted URL protocols/hosts.
- Publication snapshots freeze the validated JSON, schema version, referenced asset versions/relations, renderer version, and approval hash.
- Schema upgrades are explicit, deterministic, tested migrations that retain the original revision/snapshot.

Legacy HTML is sanitized, parsed into the allowed schema, and human-reviewed during migration. Unsupported markup becomes an explicit migration issue rather than a raw-HTML escape hatch.

## Consequences

- Structured documents are queryable, validateable, renderable across channels, and safer than arbitrary HTML.
- Editor extensions and renderer/schema versions need coordinated tests and migrations.
- Tiptap is the editor implementation; the Habitat schema and JSON contract remain application-owned.
- Custom rich blocks require accessible authoring, preview, validation, public rendering, and migration behavior.
- HTML/metadata sanitization and CSP remain defense in depth, especially for imported content, embeds, URLs, and uploaded formats.

## Rejected alternatives

- **Raw HTML as source:** unsafe, hard to validate/migrate, and presentation-coupled.
- **MDX or executable JSX:** gives authored content code execution and build coupling.
- **Unversioned generic JSON/page builder:** schema drift and excessive layout freedom.
- **Markdown as the only source:** insufficient typed relationships/rich blocks for the accepted Story experience.
- **Store rendered HTML only:** loses structure and deterministic evolution.

## Validation

The Communications design review must approve the smallest node set. The implementation must test malformed/unknown nodes, dangerous link protocols, hostile pasted HTML, accessibility semantics/keyboard behavior, deterministic rendering/hash, old-schema migrations, snapshot stability, and editor/renderer parity. No raw-HTML node ships.

## Primary references

- [Tiptap JSON content model](https://tiptap.dev/docs/editor/core-concepts/introduction)
- [Tiptap schema constraints and JSON validation](https://tiptap.dev/docs/editor/core-concepts/schema)
- [ProseMirror schema guide](https://prosemirror.net/docs/guide/#schema)
- [OWASP XSS prevention for rich HTML](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
