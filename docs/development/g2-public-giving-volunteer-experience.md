# G2 public Giving and Volunteer experience

Status: Implemented locally on 2026-08-18

G2 composes the public Giving and Volunteer journey on top of the governed G1
DonorView destination boundary. It does not collect donor or volunteer data,
create local forms, embed DonorView, or add a provider synchronization path.

## Public experience

The public shell keeps Donate as the primary action and adds Volunteer to the
public navigation. The footer links to the `/give` and `/volunteer` information
pages as well as the configured Donate handoff. The two pages provide Habitat
context, explain the distinction between general and Campaign-specific actions,
and show safe unavailable states when a current verified destination is not
configured.

`/give` lists current Campaigns that have a currently resolved Donate action.
`/volunteer` lists current Campaigns that have a currently resolved Volunteer
action. Neither page contains a local input, payment field, registration field,
iframe, provider script, or donor/volunteer payload.

Campaign detail actions continue to resolve from the released public Campaign
projection. A governed Donate action resolves only when its destination is the
current verified `CAMPAIGN_DONATE` destination; a Volunteer action uses the
current verified `VOLUNTEER_EVENT` destination. Unavailable actions are omitted
by the existing public resolver, so the page remains readable without a broken
anchor. The page explains that processing or registration continues securely in
DonorView without making the Habitat site look like a provider portal.

## Homepage and navigation

The homepage preserves Communications placements and adds bounded server-read
sections for current Projects, current Campaigns, and three concise ways to
help: Donate, Volunteer, and Explore Campaigns. These sections use the existing
published public projections and their existing ordering; no homepage-specific
placement or ranking data was added.

The responsive shell keeps Home, News, Projects, Campaigns, Volunteer, and the
Donate action available without a mega-menu or sticky navigation. Mobile uses
the existing native disclosure navigation. Same-tab links remain the default;
external context is provided by accessible names and the visible arrow.

## DonorView boundary and production gate

DonorView remains the system of record for donations, receipts, volunteer
applications, event registration, waivers, attendance, and hours. Habitat owns
the explanatory public pages and the reviewed destination selection. No
credentials, provider payloads, click analytics, or open redirects are added.

Production launch remains gated on staff configuring and verifying the approved
production `GENERAL_DONATE`, `GENERAL_VOLUNTEER`, and any Campaign-specific
destinations in `/admin/engagement`. Preview or test environments must use
harmless nonproduction HTTPS fixture destinations only; fixture destination
records are not committed as application data.

## Validation and preview procedure

Run the focused public handoff and composition tests, the focused G1/Campaign/
Project PostgreSQL regressions, full unit/integration/Playwright suites, axe on
the representative public routes, four viewport captures, format/lint/typecheck,
and the standard production build. If a stale generated state reproduces the
known Next/Turbopack source-map panic, use `pnpm build:clean` and then rerun the
standard build as documented in `build-stabilization-turbopack.md`.

For human review, keep the existing port 3200 server and preview databases in
place. Check `/`, `/give`, `/volunteer`, `/campaigns`, and `/projects` at
375×812, 768×1024, 1440×1100, and 1920×1200. Confirm no horizontal overflow,
visible focus, keyboard-accessible navigation, clear CTA hierarchy, and no
local form or DonorView iframe.
