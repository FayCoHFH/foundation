# Slice 1 accessibility checklist

This checklist records the acceptance evidence for the application shell. It complements automated checks; a clean automated scan is not a complete accessibility review.

## Automated shell assertions

- The public root has one page `<h1>`, a descriptive document title, `header`, a named navigation landmark, `main`, and `footer`.
- The public root and the sign-in, unauthenticated-admin, access-denied, and authenticated-admin responses have no axe violations.
- The first Tab on public and admin pages reveals a skip link. Activating it moves focus to the corresponding main region.
- Every rendered navigation link is reachable by keyboard. Disclosure navigation, if used, is operable with native keyboard behavior and exposes its state.
- A request to an admin route without a session receives the approved sign-in/redirect response. An authenticated identity with no active local authorization receives access-denied content, never an empty admin shell.
- At 320 CSS pixels and at 400% zoom, no page-level horizontal scrolling, clipped labels, obscured focus, or unavailable shell action occurs.
- With `prefers-reduced-motion: reduce`, nonessential transitions are suppressed.
- The representative administrative form supplies a persistent label, required/instruction text before entry, associated field errors, retained valid input, and a restrained status announcement after completion.

## Manual checks before accepting Slice 1

1. Test public root, sign-in, denial, and admin shell with keyboard only: Tab, Shift+Tab, Enter, Space, and Escape where a disclosure is present.
2. Test landmarks, heading order, skip links, navigation state, sign-in/error wording, form labels, form errors, and live status with VoiceOver/Safari and NVDA/Firefox or NVDA/Chrome.
3. Check 200%, 300%, and 400% browser zoom; a 320 CSS-pixel viewport; user text-spacing overrides; and touch target use on a mobile device or simulator.
4. Check default, hover, focus, selected, disabled, and error contrast states. State must never be communicated by color alone.
5. Check `prefers-reduced-motion` and Windows forced-colors. Visible focus and control boundaries must remain perceptible.
6. Confirm error and access-denied pages do not disclose stack traces, invitation existence, capabilities, protected content, or other authorization details.

## Deferred feature checks

Future Story/News authoring, media, publication, placement, provider-handoff, commerce, and administrative workflows require their own accessibility coverage. In particular, publication readiness must validate contextual alternative text, rights/consent, dates/status, and accessible rich-editor output before public release.
