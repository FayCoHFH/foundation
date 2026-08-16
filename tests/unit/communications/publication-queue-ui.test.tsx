import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getAvailablePublicationQueueViews,
  type PublicationQueueItem,
  type PublicationQueueSummary,
} from "@/modules/communications/queue";

import {
  PublicationQueueContent,
  QUEUE_VIEW_DEFINITIONS,
  queueHref,
  queueViewCount,
  queueViewLabel,
  renderQueueStatus,
  type QueuePageState,
} from "@/app/admin/communications/queue/queue-ui";
import { parseQueueSearchParams } from "@/app/admin/communications/queue/queue-query";
import { communicationsNavigation } from "@/components/admin-shell";

const ownerId = "11111111-1111-4111-8111-111111111111";
const summary: PublicationQueueSummary = {
  all: 2,
  myDrafts: 1,
  needsReview: 0,
  needsApproval: 1,
  approvedUnreleased: 0,
  recentlyPublished: 0,
  expiredNews: 0,
  archived: 0,
};

const story: PublicationQueueItem = {
  publicationId: "22222222-2222-4222-8222-222222222222",
  publicationKind: "STORY",
  headline: "A queue Story",
  workflowState: "PENDING_APPROVAL",
  releaseState: "UNPUBLISHED",
  discoveryDisposition: "ACTIVE",
  newsAvailability: null,
  editorialOwner: { adminUserId: ownerId, displayName: "Editorial Owner" },
  currentRevisionNumber: 1,
  updatedAt: new Date("2026-08-16T10:00:00.000Z"),
  submittedAt: new Date("2026-08-15T10:00:00.000Z"),
  approvedAt: null,
  publishedAt: null,
  expiresAt: null,
  archivedAt: null,
  detailPath:
    "/admin/communications/stories/33333333-3333-4333-8333-333333333333",
  canOpenForApproval: false,
  approvalBlockedReasonCode: "SELF_APPROVAL",
};

const state: QueuePageState = {
  view: "NEEDS_APPROVAL",
  kind: "STORY",
  owner: ownerId,
  page: 2,
  pageSize: 25,
};

describe("Publication Queue admin UI configuration", () => {
  it("maps every supported view to a human label and count", () => {
    expect(QUEUE_VIEW_DEFINITIONS.map(({ view }) => view)).toEqual([
      "MY_DRAFTS",
      "NEEDS_REVIEW",
      "NEEDS_APPROVAL",
      "APPROVED_UNRELEASED",
      "RECENTLY_PUBLISHED",
      "EXPIRED_NEWS",
      "ARCHIVED",
      "ALL",
    ]);
    expect(queueViewLabel("APPROVED_UNRELEASED")).toBe(
      "Approved, Not Released",
    );
    expect(queueViewCount(summary, "ALL")).toBe(2);
    expect(queueViewCount(summary, "NEEDS_APPROVAL")).toBe(1);
  });

  it("presents only capability-available views", () => {
    expect(
      getAvailablePublicationQueueViews({
        adminUserId: ownerId,
        capabilities: [
          "communications.queue.read",
          "stories.read.draft.own",
          "news.read.draft.own",
        ],
      }),
    ).toEqual(["MY_DRAFTS", "ALL"]);
    expect(
      getAvailablePublicationQueueViews({
        adminUserId: ownerId,
        capabilities: [],
      }),
    ).toEqual([]);
  });

  it("shows the Queue navigation entry only for Queue readers and marks it current", () => {
    expect(
      communicationsNavigation(
        {
          adminUserId: ownerId,
          authUserId: "auth-user",
          capabilities: ["communications.queue.read"],
          email: "not-rendered@example.org",
          isSuperAdmin: false,
          name: "Queue reader",
          sessionCreatedAt: new Date(),
          sessionExpiresAt: new Date(),
          sessionId: "session",
        },
        "/admin/communications/queue",
      ),
    ).toContainEqual({
      href: "/admin/communications/queue",
      label: "Publication Queue",
      current: true,
    });
    expect(
      communicationsNavigation(
        {
          adminUserId: ownerId,
          authUserId: "auth-user",
          capabilities: [],
          email: "not-rendered@example.org",
          isSuperAdmin: false,
          name: "No Queue reader",
          sessionCreatedAt: new Date(),
          sessionExpiresAt: new Date(),
          sessionId: "session",
        },
        "/admin",
      ),
    ).not.toContainEqual(
      expect.objectContaining({ href: "/admin/communications/queue" }),
    );
  });

  it("preserves filters in navigation and resets to page one for view changes", () => {
    expect(queueHref(state)).toBe(
      `/admin/communications/queue?view=NEEDS_APPROVAL&kind=STORY&owner=${ownerId}&page=2`,
    );
    expect(queueHref({ ...state, view: "MY_DRAFTS", page: 1 })).toBe(
      `/admin/communications/queue?view=MY_DRAFTS&kind=STORY&owner=${ownerId}`,
    );
  });

  it("normalizes absent query state and flags invalid values safely", () => {
    expect(parseQueueSearchParams({}).state).toEqual({
      view: "MY_DRAFTS",
      kind: "ALL",
      page: 1,
      pageSize: 25,
    });
    expect(
      parseQueueSearchParams({
        view: "SCHEDULED",
        kind: "VIDEO",
        page: "0",
        pageSize: "101",
      }).invalid,
    ).toEqual({ view: true, kind: true, page: true, pageSize: true });
  });
});

describe("Publication Queue admin UI rendering", () => {
  it("renders typed rows, accessible navigation, filters, pagination, and safe status copy", () => {
    const markup = renderToStaticMarkup(
      <PublicationQueueContent
        availableViews={["MY_DRAFTS", "NEEDS_APPROVAL", "ALL"]}
        ownerOptions={[
          { adminUserId: ownerId, displayName: "Editorial Owner" },
        ]}
        result={{
          items: [story],
          page: 2,
          pageSize: 25,
          total: 26,
          hasNextPage: false,
          summary,
          evaluatedAt: new Date("2026-08-16T12:00:00.000Z"),
        }}
        state={state}
        errorMessage={undefined}
        unavailableMessage={undefined}
        canCreateStory={false}
        canCreateNews={false}
      />,
    );
    expect(markup).toContain('aria-label="Publication Queue views"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Filter Publication Queue"');
    expect(markup).toContain("A queue Story");
    expect(markup).toContain("Open Story");
    expect(markup).toContain("Needs approval");
    expect(markup).toContain("Another qualified approver is required.");
    expect(markup).toContain("Editorial Owner");
    expect(markup).toContain('name="page" value="1"');
    expect(markup).toContain("kind=STORY");
    expect(markup).toContain(`owner=${ownerId}`);
    expect(markup).not.toContain("body");
    expect(markup).not.toContain("email");
    expect(markup).not.toContain("contentHash");
  });

  it("keeps Story and News status presentation distinct", () => {
    expect(renderQueueStatus(story)).toMatchObject({
      workflow: "Needs approval",
      release: "Not released",
      availability: null,
    });
    expect(
      renderQueueStatus({
        ...story,
        publicationKind: "NEWS",
        newsAvailability: "EXPIRED",
        detailPath:
          "/admin/communications/news/44444444-4444-4444-8444-444444444444",
      }),
    ).toMatchObject({ availability: "Expired" });
  });

  it("renders a view-specific empty state and hides unauthorized owner controls", () => {
    const markup = renderToStaticMarkup(
      <PublicationQueueContent
        availableViews={["MY_DRAFTS"]}
        ownerOptions={[]}
        result={{
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          hasNextPage: false,
          summary,
          evaluatedAt: new Date("2026-08-16T12:00:00.000Z"),
        }}
        state={{ view: "MY_DRAFTS", kind: "ALL", page: 1, pageSize: 25 }}
        errorMessage={undefined}
        unavailableMessage={undefined}
        canCreateStory
        canCreateNews={false}
      />,
    );
    expect(markup).toContain("You have no draft communications.");
    expect(markup).toContain("Create Story draft");
    expect(markup).not.toContain("Editorial owner");
  });
});
