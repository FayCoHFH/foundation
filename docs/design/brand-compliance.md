# June 2025 Habitat brand implementation

Status: implemented for the public shell; editorial and ReStore records remain
subject to human verification when those records become publishable.

## Authority

The normative source is the supplied **Habitat for Humanity Brand User Guide,
June 2025** (`HFH_Brand_Guide_2025_English-Guide.pdf`). It states that the
guide, together with the May 2024 ReStore Style Guide, replaces previous brand
guidance. The supplied Fayette County logo archive and HFHI Neue Haas Grotesk
webfont archive are the asset sources used here.

## Typography

- `Neue Haas Grotesk Display` is the public display and headline family.
- `Neue Haas Grotesk Text` is the public interface, navigation, label, caption,
  metadata, and short-copy family.
- `Minion Pro` is the semantic long-form/editorial family for substantial
  narrative prose, quotes, and article body content.
- Public code chooses semantic classes such as `type-display`, `type-text`, and
  `type-article-body`; authors do not select font filenames.
- The supplied Minion Pro files are webfont assets. Formal license provenance
  and documentation are pending delivery; the binaries are not copied into
  audit evidence.

## Color

Canonical tokens are the June 2025 palette: Bright Blue `#0099CC`, Bright Green
`#C4D600`, Cool Gray `#888B8D`, Black `#000000`, White `#FFFFFF`, Traditional
Blue `#002F6C`, Yellow `#FFD100`, Traditional Green `#3AA047`, Orange `#E55D25`,
and Red `#A4343A`.

Public surfaces are primarily white and black with selective full-strength
brand color. White text is not placed on Bright Green, and small or thin white
text is not placed on Bright Blue. Cool Gray is reserved for quiet borders and
non-text structure; readable muted text uses Traditional Blue.

## Logo

`HabitatLogo` is the only public logo component. Its default is the official
horizontal extended Fayette County black logo. The official white horizontal
variant is used on the black footer. Artwork is not recolored, filtered,
redrawn, clipped, distorted, or reconstructed. The component exposes the June
2025 digital minimum of 10px capital-H height as a data contract for browser
verification; clear space is owned by its surrounding layout.

## Programs, events, and ReStore

Programs and events do not receive mini-brands or logo lockups. Habitat identity
must lead, and names remain separate headline treatments. ReStore is the
authorized identifier exception. No ReStore experience is currently present in
the implemented public shell, so May 2024 ReStore-specific checks remain
`NOT APPLICABLE` until a verified route/content record exists.

## Content and imagery

The copy linter flags retired statements and passive/possessive people language
without mechanically rewriting context. Narrative tone, dignity, imagery
authenticity, consent, provenance, and local/DAN approval remain human review
items. No AI-generated photography or fabricated replacement imagery is added.

## Enforcement

`scripts/brand-compliance-audit.ts` emits machine-readable baseline/final
artifacts. Static checks cover typography, colors, gradients, logo references,
copy, imagery scope, program/ReStore scope, and link destinations. Runtime
checks cover computed typography, logo dimensions/variants, visible colors,
axe, responsive overflow, and rendered public links. Manual-review findings
remain explicit and do not become automated PASS results.
