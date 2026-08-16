import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { communicationsNavigation } from "@/components/admin-shell";
import {
  dashboardModuleVisibility,
  type CommunicationsDashboard,
  type DashboardCurationSlot,
  type DashboardPlacementAssignment,
} from "@/modules/communications/dashboard";

import { DashboardContent } from "@/app/admin/communications/dashboard-ui";

const storyId = "33333333-3333-4333-8333-333333333333";
const newsId = "44444444-4444-4444-8444-444444444444";
const placementId = "55555555-5555-4555-8555-555555555555";
const ownerId = "11111111-1111-4111-8111-111111111111";
const evaluationTime = new Date("2026-08-16T12:00:00.000Z");
const upcomingTime = new Date("2026-08-18T12:00:00.000Z");

function assignment(
  overrides: Partial<DashboardPlacementAssignment> = {},
): DashboardPlacementAssignment {
  return {
    placementId,
    placementKey: "HOME_FEATURED_NEWS",
    publicationId: newsId,
    targetKind: "NEWS",
    headline: "A public News item",
    startsAt: evaluationTime,
    endsAt: null,
    publicPath: "/news/a-public-news-item",
    adminPath: `/admin/communications/news/${newsId}`,
    publicEligibility: "ELIGIBLE",
    ...overrides,
  };
}

function slot(
  placementKey: DashboardCurationSlot["placementKey"],
  label: string,
  status: DashboardCurationSlot["status"],
  current: DashboardPlacementAssignment | null,
  upcoming: DashboardPlacementAssignment | null,
): DashboardCurationSlot {
  return { placementKey, label, status, current, upcoming };
}

const dashboard: CommunicationsDashboard = {
  generatedAt: evaluationTime,
  needsAttention: {
    groups: [
      {
        key: "NEEDS_REVIEW",
        count: 12,
        items: [
          {
            publicationId: storyId,
            publicationKind: "STORY",
            headline: "A Story awaiting review",
            relevantAt: new Date("2026-08-15T12:00:00.000Z"),
            editorialOwner: {
              adminUserId: ownerId,
              displayName: "Editorial Owner",
            },
            detailPath: `/admin/communications/stories/${storyId}`,
            approvalBlockedReasonCode: null,
          },
        ],
      },
      {
        key: "NEEDS_APPROVAL",
        count: 0,
        items: [],
      },
      {
        key: "APPROVED_UNRELEASED",
        count: 2,
        items: [
          {
            publicationId: newsId,
            publicationKind: "NEWS",
            headline: "Approved News awaiting release",
            relevantAt: new Date("2026-08-14T12:00:00.000Z"),
            editorialOwner: null,
            detailPath: `/admin/communications/news/${newsId}`,
            approvalBlockedReasonCode: "SELF_APPROVAL",
          },
        ],
      },
    ],
  },
  upcoming: {
    evaluationTime,
    upcomingUntil: new Date("2026-08-30T12:00:00.000Z"),
    items: [
      {
        kind: "PLACEMENT_ACTIVATION",
        placementId,
        placementKey: "HOME_HERO",
        placementLabel: "Home hero",
        startsAt: upcomingTime,
        endsAt: null,
        publicationId: storyId,
        targetKind: "STORY",
        headline: "Upcoming Story",
        publicPath: "/stories/upcoming-story",
        adminPath: `/admin/communications/stories/${storyId}`,
        publicEligibility: "ELIGIBLE",
      },
      {
        kind: "NEWS_EXPIRATION",
        publicationId: newsId,
        newsId,
        headline: "News nearing expiration",
        expiresAt: new Date("2026-08-20T12:00:00.000Z"),
        publicPath: "/news/news-nearing-expiration",
        adminPath: `/admin/communications/news/${newsId}`,
        publicEligibility: "ELIGIBLE",
      },
    ],
  },
  currentCuration: {
    slots: [
      slot(
        "HOME_HERO",
        "Home hero",
        "ACTIVE",
        assignment({
          placementKey: "HOME_HERO",
          targetKind: "STORY",
          headline: "Current Story",
          adminPath: `/admin/communications/stories/${storyId}`,
        }),
        null,
      ),
      slot(
        "HOME_FEATURED_STORY",
        "Home featured Story",
        "CONFIGURED_BUT_INEFFECTIVE",
        assignment({
          placementKey: "HOME_FEATURED_STORY",
          targetKind: "STORY",
          headline: "An ineligible Story",
          publicEligibility: "INELIGIBLE",
          adminPath: `/admin/communications/stories/${storyId}`,
        }),
        null,
      ),
      slot(
        "HOME_FEATURED_NEWS",
        "Home featured News",
        "UPCOMING_ONLY",
        null,
        assignment({ startsAt: upcomingTime }),
      ),
      slot(
        "NEWS_FEATURED",
        "Featured News",
        "CURRENT_AND_UPCOMING",
        assignment(),
        assignment({
          startsAt: upcomingTime,
          placementId: "66666666-6666-4666-8666-666666666666",
        }),
      ),
    ],
  },
  recentActivity: {
    items: [
      {
        id: "activity-1",
        kind: "PUBLICATION",
        action: "story.submit",
        summaryCode: "STORY_SUBMIT",
        occurredAt: new Date("2026-08-16T11:00:00.000Z"),
        actorDisplayName: "Morgan",
        subjectKind: "STORY",
        subjectId: storyId,
        headline: "A Story awaiting review",
        detailPath: `/admin/communications/stories/${storyId}`,
      },
      {
        id: "activity-2",
        kind: "PLACEMENT",
        action: "placement.assigned",
        summaryCode: "PLACEMENT_ASSIGNED",
        occurredAt: new Date("2026-08-16T10:00:00.000Z"),
        actorDisplayName: "Taylor",
        subjectKind: "PLACEMENT",
        subjectId: placementId,
        headline: "A public News item",
        detailPath: "/admin/communications/homepage",
      },
    ],
  },
};

const managerVisibility = dashboardModuleVisibility([
  "communications.dashboard.read",
  "communications.queue.read",
  "communications.placements.manage",
  "stories.read.draft.any",
  "stories.review",
  "stories.publish",
  "news.approve",
  "news.publish",
]);

describe("Communications Dashboard navigation", () => {
  const principal = {
    adminUserId: ownerId,
    authUserId: "auth-user",
    capabilities: ["communications.dashboard.read"] as const,
    email: "not-rendered@example.org",
    isSuperAdmin: false,
    name: "Dashboard reader",
    sessionCreatedAt: evaluationTime,
    sessionExpiresAt: upcomingTime,
    sessionId: "session",
  };

  it("shows Dashboard only with its capability and marks only its route current", () => {
    expect(
      communicationsNavigation(principal, "/admin/communications"),
    ).toContainEqual({
      href: "/admin/communications",
      label: "Communications Dashboard",
      current: true,
    });
    expect(
      communicationsNavigation(principal, "/admin/communications/queue"),
    ).toContainEqual({
      href: "/admin/communications",
      label: "Communications Dashboard",
      current: false,
    });
    expect(
      communicationsNavigation(
        { ...principal, capabilities: [] },
        "/admin/communications",
      ),
    ).not.toContainEqual(
      expect.objectContaining({ href: "/admin/communications" }),
    );
  });
});

describe("Communications Dashboard rendering", () => {
  it("renders one title and the four modules in operational order", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).toContain("Communications Dashboard");
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup.indexOf("Needs Attention")).toBeLessThan(
      markup.indexOf("Upcoming"),
    );
    expect(markup.indexOf("Upcoming")).toBeLessThan(
      markup.indexOf("Current Curation"),
    );
    expect(markup.indexOf("Current Curation")).toBeLessThan(
      markup.indexOf("Recent Activity"),
    );
  });

  it("renders full authorized counts, bounded previews, and typed Queue links", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).toContain("Needs Review");
    expect(markup).toContain(">12</span>");
    expect(markup).toContain("Approved, Not Released");
    expect(markup).toContain(">2</span>");
    expect(markup).toContain("/admin/communications/queue?view=NEEDS_REVIEW");
    expect(markup).toContain(
      "/admin/communications/queue?view=APPROVED_UNRELEASED",
    );
    expect(markup).toContain(`/admin/communications/stories/${storyId}`);
    expect(markup).toContain(`/admin/communications/news/${newsId}`);
    expect(markup).toContain("Editorial Owner");
    expect(markup).toContain("Another qualified approver is required.");
    expect(markup).not.toContain("not-rendered@example.org");
    expect(markup).not.toContain("revision");
    expect(markup).not.toContain("contentHash");
  });

  it("does not render zero or unauthorized Needs Attention groups", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).not.toContain("Needs Approval");
    const contributorMarkup = renderToStaticMarkup(
      <DashboardContent
        dashboard={dashboard}
        visibility={dashboardModuleVisibility([
          "communications.dashboard.read",
          "communications.queue.read",
        ])}
      />,
    );
    expect(contributorMarkup).not.toContain("Current Curation");
  });

  it("clearly types Upcoming items and preserves DTO order", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup.indexOf("Placement activation · Home hero")).toBeLessThan(
      markup.indexOf("News expiration"),
    );
    expect(markup).toContain("Upcoming Story");
    expect(markup).toContain("News nearing expiration");
    expect(markup).toContain("Manage Homepage curation");
    expect(markup).toContain("Expires");
    expect(markup).toContain("Activates");
  });

  it("renders all four curation slots and derived status language", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).toContain("Home hero");
    expect(markup).toContain("Home featured Story");
    expect(markup).toContain("Home featured News");
    expect(markup).toContain("Featured News");
    expect(markup).toContain("Configured but not currently effective");
    expect(markup).toContain("Current and upcoming");
    expect(markup).toContain(
      "The configured item is no longer publicly eligible.",
    );
  });

  it("renders the Empty curation status without inventing an assignment", () => {
    const emptyCuration = {
      ...dashboard.currentCuration!,
      slots: [
        dashboard.currentCuration!.slots[0]!,
        slot("HOME_FEATURED_STORY", "Home featured Story", "EMPTY", null, null),
        dashboard.currentCuration!.slots[2]!,
        dashboard.currentCuration!.slots[3]!,
      ] as const,
    };
    const markup = renderToStaticMarkup(
      <DashboardContent
        dashboard={{ ...dashboard, currentCuration: emptyCuration }}
        visibility={managerVisibility}
      />,
    );
    expect(markup).toContain("Home featured Story");
    expect(markup).toContain("Empty");
    expect(markup).toContain("No assignment is configured.");
  });

  it("omits Current Curation without placement capability", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent
        dashboard={dashboard}
        visibility={dashboardModuleVisibility([
          "communications.dashboard.read",
          "communications.queue.read",
        ])}
      />,
    );
    expect(markup).not.toContain("Current Curation");
    expect(markup).not.toContain("Home hero");
  });

  it("uses safe Recent Activity labels and typed links without raw metadata", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).toContain(
      "Morgan submitted a Story for review: A Story awaiting review",
    );
    expect(markup).toContain("Taylor assigned a placement: A public News item");
    expect(markup).toContain("/admin/communications/homepage");
    expect(markup).not.toContain("STORY_SUBMIT");
    expect(markup).not.toContain("actorAdminUser");
    expect(markup).not.toContain("requestPayload");
  });

  it("renders module-specific empty and safe error states", () => {
    const emptyDashboard: CommunicationsDashboard = {
      ...dashboard,
      needsAttention: null,
      upcoming: { ...dashboard.upcoming!, items: [] },
      recentActivity: { items: [] },
    };
    const markup = renderToStaticMarkup(
      <DashboardContent
        dashboard={emptyDashboard}
        visibility={managerVisibility}
      />,
    );
    expect(markup).toContain("There are no actionable publication items");
    expect(markup).toContain("No Communications deadlines or curation changes");
    expect(markup).toContain("No recent Communications activity");
    const errorMarkup = renderToStaticMarkup(
      <DashboardContent
        dashboard={null}
        errorMessage="That Dashboard window is invalid. Choose a window from 1 to 90 days."
        visibility={managerVisibility}
      />,
    );
    expect(errorMarkup).toContain("Dashboard unavailable");
    expect(errorMarkup).toContain("1 to 90 days");
    expect(errorMarkup).not.toContain("Prisma");
    expect(errorMarkup).not.toContain("stack");
  });

  it("has one responsive structure and no inline workflow or placement mutations", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent dashboard={dashboard} visibility={managerVisibility} />,
    );
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain(">Approve<");
    expect(markup).not.toContain(">Release<");
    expect(markup).not.toContain(">Assign<");
    expect(markup).not.toContain(">Clear<");
    expect(markup).not.toContain("hidden");
    expect(markup).toContain("dateTime=");
    expect(markup).toContain("sm:grid-cols");
  });
});
