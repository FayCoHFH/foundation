import { describe, expect, it } from "vitest";

import {
  dashboardActivitySummaryCode,
  dashboardModuleVisibility,
  deriveCurationStatus,
  isAllowlistedDashboardActivity,
  normalizeCommunicationsDashboardRequest,
} from "@/modules/communications/dashboard";

const evaluationTime = new Date("2026-08-16T12:00:00.000Z");

describe("Communications Dashboard read-model contracts", () => {
  it("requires a forward, bounded explicit upcoming window", () => {
    expect(
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: new Date("2026-08-17T12:00:00.000Z"),
      }),
    ).toMatchObject({
      evaluationTime,
      upcomingUntil: new Date("2026-08-17T12:00:00.000Z"),
    });
    expect(() =>
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: evaluationTime,
      }),
    ).toThrow("must end after evaluation time");
    expect(() =>
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: new Date("2026-12-01T00:00:00.000Z"),
      }),
    ).toThrow("cannot exceed");
  });

  it("enforces bounded Needs Attention and Recent Activity limits", () => {
    expect(
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: new Date("2026-08-17T00:00:00.000Z"),
        needsAttentionPreviewLimit: 10,
        recentActivityLimit: 50,
      }),
    ).toMatchObject({
      needsAttentionPreviewLimit: 10,
      recentActivityLimit: 50,
    });
    expect(() =>
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: new Date("2026-08-17T00:00:00.000Z"),
        needsAttentionPreviewLimit: 11,
      }),
    ).toThrow("preview limit cannot exceed");
    expect(() =>
      normalizeCommunicationsDashboardRequest({
        evaluationTime,
        upcomingUntil: new Date("2026-08-17T00:00:00.000Z"),
        recentActivityLimit: 51,
      }),
    ).toThrow("Recent Activity limit cannot exceed");
  });

  it("derives the five safe Current Curation statuses", () => {
    expect(
      deriveCurationStatus({
        hasConfiguredCurrent: false,
        currentIsPubliclyEligible: false,
        hasUpcoming: false,
      }),
    ).toBe("EMPTY");
    expect(
      deriveCurationStatus({
        hasConfiguredCurrent: false,
        currentIsPubliclyEligible: false,
        hasUpcoming: true,
      }),
    ).toBe("UPCOMING_ONLY");
    expect(
      deriveCurationStatus({
        hasConfiguredCurrent: true,
        currentIsPubliclyEligible: true,
        hasUpcoming: false,
      }),
    ).toBe("ACTIVE");
    expect(
      deriveCurationStatus({
        hasConfiguredCurrent: true,
        currentIsPubliclyEligible: true,
        hasUpcoming: true,
      }),
    ).toBe("CURRENT_AND_UPCOMING");
    expect(
      deriveCurationStatus({
        hasConfiguredCurrent: true,
        currentIsPubliclyEligible: false,
        hasUpcoming: false,
      }),
    ).toBe("CONFIGURED_BUT_INEFFECTIVE");
  });

  it("filters module visibility by capability rather than role names", () => {
    expect(
      dashboardModuleVisibility([
        "communications.dashboard.read",
        "communications.queue.read",
        "news.review",
        "news.read.draft.any",
      ]),
    ).toEqual({
      needsAttention: true,
      upcoming: true,
      currentCuration: false,
      recentActivity: true,
    });
    expect(
      dashboardModuleVisibility([
        "communications.dashboard.read",
        "communications.placements.manage",
      ]),
    ).toEqual({
      needsAttention: false,
      upcoming: true,
      currentCuration: true,
      recentActivity: true,
    });
  });

  it("allowlists real Communications actions and maps only safe summary codes", () => {
    expect(isAllowlistedDashboardActivity("story.submit", "Story")).toBe(true);
    expect(
      isAllowlistedDashboardActivity("story.revision.create", "Story"),
    ).toBe(false);
    expect(
      isAllowlistedDashboardActivity("placement.assigned", "ContentPlacement"),
    ).toBe(true);
    expect(isAllowlistedDashboardActivity("placement.assigned", "Story")).toBe(
      false,
    );
    expect(dashboardActivitySummaryCode("news.review.request_changes")).toBe(
      "NEWS_REVIEW_REQUEST_CHANGES",
    );
  });
});
