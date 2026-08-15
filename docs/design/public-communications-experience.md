# Public Communications Experience

Status: implemented experience direction, 2026-08-15.

## Design purpose

The public experience treats the community as the hero and Habitat as the
catalyst. It should help a reader understand what happened, why it mattered,
and how they can participate without turning every page into a solicitation.
"Answers" is an internal usefulness check, not a public slogan.

## Visual language

The palette draws from Fayette County material and light: limestone ground,
pecan text, faded denim/sky openness, oak restraint, and small bluebonnet or
paintbrush moments. The public system uses these as semantic tokens, with the
wildflower accents limited to emphasis, rules, and links rather than surfaces.

Literata supplies the deliberate, regional editorial voice for display and
long-form reading. Source Sans 3 keeps navigation, metadata, controls, and
supporting copy direct and highly legible. Both are loaded through Next.js from
Google Fonts with system fallbacks.

## Story rhythm

A Story moves from a broad open-sky introduction into a narrower reading
column. Headline, deck, date, and excerpt establish context before prose.
Structured headings, lists, links, and block quotes have distinct semantic
presentation without any raw HTML or layout-builder behavior. When real media
is approved in a future slice, it should document people and participation,
retain contextual alternatives, and enter the established wide/narrow rhythm;
no synthetic or placeholder Habitat imagery substitutes for it.

Stories close with a generic participation invitation and a standards-based
email share link. The invitation names several forms of contribution without
claiming a currently configured external volunteer, giving, or ReStore route.
Donation destinations remain truthfully unavailable until configured.

## Responsive and motion rules

Reading width stays near 43rem, with a fluid headline and 18-19px body text.
The masthead uses broad spacing at desktop and compact, complete context on a
phone. Motion is limited to a brief entrance transition and link/control state
changes; global reduced-motion rules remove it without removing meaning.

## Accessibility and performance

The system preserves semantic landmarks, skip navigation, visible focus,
semantic headings, readable date markup, keyboard-operable links, and no
hover-only actions. Public Story rendering remains a Server Component and has
no animation or social SDK dependency. Optional future media must not become a
prerequisite for reading or understanding the Story.
