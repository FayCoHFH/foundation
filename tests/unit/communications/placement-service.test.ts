import { describe, expect, it } from "vitest";

import {
  allowsPlacementTarget,
  placementIsActive,
} from "@/modules/communications/placements";

describe("content placements", () => {
  it("keeps placement target kinds closed", () => {
    expect(allowsPlacementTarget("HOME_HERO", "STORY")).toBe(true);
    expect(allowsPlacementTarget("HOME_HERO", "NEWS")).toBe(true);
    expect(allowsPlacementTarget("HOME_FEATURED_STORY", "NEWS")).toBe(false);
    expect(allowsPlacementTarget("NEWS_FEATURED", "STORY")).toBe(false);
  });

  it("resolves half-open activation windows deterministically", () => {
    const start = new Date("2026-08-15T12:00:00.000Z");
    expect(
      placementIsActive(
        { startsAt: start, endsAt: new Date("2026-08-15T13:00:00.000Z") },
        start,
      ),
    ).toBe(true);
    expect(
      placementIsActive(
        { startsAt: start, endsAt: new Date("2026-08-15T13:00:00.000Z") },
        new Date("2026-08-15T13:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
