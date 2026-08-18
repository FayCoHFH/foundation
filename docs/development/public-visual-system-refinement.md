# Public experience visual system and homepage refinement

Status: **complete locally on 2026-08-18**. This slice refines the public
visual system and homepage composition without changing public domain
semantics, projection reads, DonorView destinations, or engagement behavior.

## Visual direction

The public experience now uses a Texas workshop and Hill Country civic
language: Habitat blue for primary structure and action, workshop green for
participation, Texas clay for editorial rules and consequence, timber for
display text, warm paper for editorial surfaces, and limestone for quiet
division. Surfaces are intentionally mostly flat and rectangular, with rules,
spacing, and typography carrying hierarchy instead of generic cards, pills,
gradients, glass, or decorative shadows.

Typography is locked to Zilla Slab for display and Source Sans 3 for body and
interface text. The public wordmark remains a truthful typographic treatment;
no unverified logo asset was introduced.

## Homepage composition

The homepage now leads with the mission, then moves through visible current
Projects, ways to help, an active Campaign when one is published, a human
Story, News, local identity, and the footer. The existing homepage placement
read model remains authoritative: selected Story, News, and Hero placements
are still rendered from their public projections, but the mission is the
entry point rather than a Featured Story hero.

No approved photography was available in the repository for this refinement.
The hero therefore uses an explicitly labelled structural image space rather
than fabricated imagery. This preserves a truthful path for approved Habitat
photography without inventing content.

Projects, Campaigns, Stories, News, Giving, and Volunteer pages share the same
public header, page-title, section-rule, action, and editorial surface
language. The mobile navigation uses native `details`/`summary` semantics;
Donate remains the governed external DonorView destination and Volunteer
remains discoverable in the public navigation.

## Validation

Focused Chromium coverage passed for the public shell and G2 public
Giving/Volunteer experience: 3/3 tests, including four responsive breakpoints,
no horizontal overflow, and axe scans. The G2 test waits for the intentional
arrival animation to reach its stable state before running the final mobile
axe assertion, avoiding a false failure on transient opacity blending.

The existing public projections, curation labels, and governed engagement
destination behavior remain covered by the repository's public browser and
unit suites. The existing visual-preview databases and port 3200 are preserved.
