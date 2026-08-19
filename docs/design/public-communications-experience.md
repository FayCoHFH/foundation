# Public Communications Experience

Status: implemented experience direction, 2026-08-15; visual tokens and
typography superseded by the June 2025 brand-compliance package.

## Design purpose

The public experience treats the community as the hero and Habitat as the
catalyst. It should help a reader understand what happened, why it mattered,
and how they can participate without turning every page into a solicitation.
"Answers" is an internal usefulness check, not a public slogan.

## Visual language

The June 2025 Habitat brand guide is the visual authority. The public system
uses its Bright Blue, Bright Green, Cool Gray, Black, White, Traditional Blue,
Yellow, Traditional Green, Orange, and Red tokens through the centralized
implementation documented in [brand compliance](./brand-compliance.md).

Neue Haas Grotesk Display leads display typography, Neue Haas Grotesk Text
supports interface and short copy, and Minion Pro is reserved for substantial
editorial prose. The earlier regional palette and Google-hosted Literata/Source
Sans treatment are historical context only and must not be used for new work.

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
