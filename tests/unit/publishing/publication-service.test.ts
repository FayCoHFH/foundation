import { describe, expect, it } from "vitest";

import {
  InvalidPublicationTransitionError,
  StaleApprovalError,
  approvePublication,
  archivePublication,
  canonicalPublicationHash,
  createPublicationDraft,
  createSuccessorRevision,
  isEligibleForOrdinaryDiscovery,
  isPubliclyEligible,
  moveToPendingApproval,
  newsAvailability,
  publishScheduledPublication,
  schedulePublication,
  submitPublication,
  type PublicationRevisionInput,
} from "../../../src/modules/publishing";

const createdAt = "2026-08-14T12:00:00.000Z";
const approvalTime = new Date(createdAt);

function storyRevision(number = 1): PublicationRevisionInput {
  return {
    id: `story-r${number}`,
    number,
    createdByAdminUserId: "author-1",
    createdAt,
    content: {
      kind: "STORY",
      headline: "A lasting story",
      deck: null,
      excerpt: "A concise narrative summary.",
      body: { schemaVersion: 1, root: { type: "doc", content: [] } },
      showPublishedDate: true,
      showUpdatedDate: false,
    },
    seo: {
      title: null,
      description: null,
      canonicalPath: "/stories/a-lasting-story",
    },
    authors: [
      { authorProfileId: "byline-1", displayName: "A. Author", order: 1 },
    ],
    relations: [],
    media: [],
  };
}

function newsRevision(
  number = 1,
  expiresAt: string | null = null,
): PublicationRevisionInput {
  return {
    id: `news-r${number}`,
    number,
    createdByAdminUserId: "author-1",
    createdAt,
    content: {
      kind: "NEWS",
      headline: "An operational update",
      summary: "A short, dated update.",
      body: { schemaVersion: 1, root: { type: "doc", content: [] } },
      expiresAt,
      expirationPresentation: "NO_LONGER_CURRENT",
    },
    seo: {
      title: null,
      description: null,
      canonicalPath: "/news/an-operational-update",
    },
    authors: [
      { authorProfileId: "byline-1", displayName: "A. Author", order: 1 },
    ],
    relations: [],
    media: [],
  };
}

function approvedStory() {
  const draft = createPublicationDraft(
    "story-1",
    "a-lasting-story",
    storyRevision(),
  );
  const submitted = submitPublication(draft, {
    expectedVersion: 1,
    idempotencyKey: "submit-1",
  });
  const pending = moveToPendingApproval(submitted.aggregate, {
    expectedVersion: 2,
    idempotencyKey: "pending-1",
  });
  return approvePublication(pending.aggregate, {
    revisionId: "story-r1",
    approverAdminUserId: "approver-1",
    approvedAt: new Date("2026-08-14T12:05:00.000Z"),
    requirementKeys: ["STANDARD"],
    meta: { expectedVersion: 3, idempotencyKey: "approve-1" },
  }).aggregate;
}

describe("publication contracts", () => {
  it("keeps Story and News revisions structurally and semantically distinct", () => {
    const story = storyRevision();
    const news = newsRevision(1, "2026-08-20T15:00:00.000Z");

    expect(story.content.kind).toBe("STORY");
    expect(news.content.kind).toBe("NEWS");
    expect(canonicalPublicationHash(story)).not.toBe(
      canonicalPublicationHash(news),
    );
  });

  it("uses a deterministic, complete canonical hash", () => {
    const first = storyRevision();
    const reordered = {
      ...storyRevision(),
      seo: {
        canonicalPath: "/stories/a-lasting-story",
        description: null,
        title: null,
      },
    };

    expect(canonicalPublicationHash(first)).toBe(
      canonicalPublicationHash(reordered),
    );
    expect(
      canonicalPublicationHash({
        ...first,
        content: { ...first.content, headline: "A corrected story" },
      }),
    ).not.toBe(canonicalPublicationHash(first));
  });

  it("rejects non-JSON containers before hashing or freezing publication state", () => {
    const withMap = storyRevision();
    (withMap.content.body.root as Record<string, unknown>).unsupported =
      new Map([["hidden", "value"]]);
    expect(() => canonicalPublicationHash(withMap)).toThrow(
      /only JSON primitives, arrays, and plain string-keyed objects/,
    );
    expect(() =>
      createPublicationDraft("story-map", "story-map", withMap),
    ).toThrow(InvalidPublicationTransitionError);

    const withSet = storyRevision();
    (withSet.content.body.root as Record<string, unknown>).unsupported =
      new Set(["hidden"]);
    expect(() =>
      createPublicationDraft("story-set", "story-set", withSet),
    ).toThrow(InvalidPublicationTransitionError);
  });

  it("binds approval, schedule, and immutable public snapshot to one exact revision hash", () => {
    const approved = approvedStory();
    const scheduled = schedulePublication(approved, {
      revisionId: approved.currentRevision.id,
      contentHash: approved.currentRevision.contentHash,
      activateAt: new Date("2026-11-01T07:30:00.000Z"),
      editorialTimeZone: "America/Chicago",
      meta: { expectedVersion: 4, idempotencyKey: "schedule-1" },
    });
    const published = publishScheduledPublication(scheduled.aggregate, {
      now: new Date("2026-11-01T07:30:00.000Z"),
      snapshotId: "snapshot-1",
      meta: { expectedVersion: 5, idempotencyKey: "publish-1" },
    });

    expect(published.aggregate.release).toBe("PUBLISHED");
    expect(published.aggregate.snapshots).toHaveLength(1);
    expect(published.aggregate.snapshots[0]?.approvalHash).toBe(
      approved.currentRevision.contentHash,
    );
    expect(published.aggregate.snapshots[0]?.payload).not.toHaveProperty(
      "createdByAdminUserId",
    );
    expect(published.aggregate.snapshots[0]?.payload).not.toHaveProperty("id");
    expect(isPubliclyEligible(published.aggregate)).toBe(true);
  });

  it("invalidates a previous approval after a material successor revision", () => {
    const approved = approvedStory();
    const successor = createSuccessorRevision(approved, storyRevision(2), {
      expectedVersion: 4,
      idempotencyKey: "edit-2",
    }).aggregate;

    expect(successor.approval).toBeNull();
    expect(() =>
      schedulePublication(successor, {
        revisionId: "story-r1",
        contentHash: approved.currentRevision.contentHash,
        activateAt: new Date("2026-08-15T12:00:00.000Z"),
        editorialTimeZone: "America/Chicago",
        meta: { expectedVersion: 5, idempotencyKey: "stale-schedule" },
      }),
    ).toThrow(StaleApprovalError);
  });

  it("denies self-approval and rejects News whose relevance ends before activation", () => {
    const draft = createPublicationDraft(
      "news-1",
      "an-operational-update",
      newsRevision(1, "2026-08-15T12:00:00.000Z"),
    );
    const submitted = submitPublication(draft, {
      expectedVersion: 1,
      idempotencyKey: "submit-news",
    });
    const pending = moveToPendingApproval(submitted.aggregate, {
      expectedVersion: 2,
      idempotencyKey: "pending-news",
    });

    expect(() =>
      approvePublication(pending.aggregate, {
        revisionId: "news-r1",
        approverAdminUserId: "author-1",
        approvedAt: approvalTime,
        requirementKeys: ["STANDARD"],
        meta: { expectedVersion: 3, idempotencyKey: "self-approve" },
      }),
    ).toThrow(InvalidPublicationTransitionError);

    const overridden = approvePublication(pending.aggregate, {
      revisionId: "news-r1",
      approverAdminUserId: "author-1",
      approvedAt: approvalTime,
      requirementKeys: ["STANDARD"],
      selfApprovalOverride: {
        authorizedBySuperAdminUserId: "author-1",
        reason: "Emergency publication continuity",
      },
      meta: { expectedVersion: 3, idempotencyKey: "self-approve-override" },
    }).aggregate;
    expect(overridden.approval?.selfApprovalOverride).toEqual({
      kind: "SUPER_ADMIN_SELF_APPROVAL",
      authorizedBySuperAdminUserId: "author-1",
      reason: "Emergency publication continuity",
    });
    expect(() =>
      approvePublication(pending.aggregate, {
        revisionId: "news-r1",
        approverAdminUserId: "author-1",
        approvedAt: approvalTime,
        requirementKeys: ["STANDARD"],
        selfApprovalOverride: {
          authorizedBySuperAdminUserId: "arbitrary-admin-id",
          reason: "Fabricated authorization evidence",
        },
        meta: {
          expectedVersion: 3,
          idempotencyKey: "fabricated-self-approve-override",
        },
      }),
    ).toThrow(InvalidPublicationTransitionError);

    const approved = approvePublication(pending.aggregate, {
      revisionId: "news-r1",
      approverAdminUserId: "approver-1",
      approvedAt: approvalTime,
      requirementKeys: ["STANDARD"],
      meta: { expectedVersion: 3, idempotencyKey: "approve-news" },
    }).aggregate;

    expect(() =>
      schedulePublication(approved, {
        revisionId: "news-r1",
        contentHash: approved.currentRevision.contentHash,
        activateAt: new Date("2026-08-16T12:00:00.000Z"),
        editorialTimeZone: "America/Chicago",
        meta: { expectedVersion: 4, idempotencyKey: "bad-news-schedule" },
      }),
    ).toThrow(InvalidPublicationTransitionError);
  });

  it("treats News expiry as derived availability, not deletion", () => {
    const draft = createPublicationDraft(
      "news-2",
      "time-bound-update",
      newsRevision(1, "2026-08-15T12:00:00.000Z"),
    );

    expect(newsAvailability(draft, new Date("2026-08-15T11:59:59.000Z"))).toBe(
      "CURRENT",
    );
    expect(newsAvailability(draft, new Date("2026-08-15T12:00:00.000Z"))).toBe(
      "EXPIRED",
    );
  });

  it("keeps expired News canonically public while removing it from ordinary discovery", () => {
    const revision = newsRevision(1, "2026-08-15T12:00:00.000Z");
    const submitted = submitPublication(
      createPublicationDraft("news-expiry", "time-bound-update", revision),
      { expectedVersion: 1, idempotencyKey: "submit-expiring" },
    ).aggregate;
    const pending = moveToPendingApproval(submitted, {
      expectedVersion: 2,
      idempotencyKey: "pending-expiring",
    }).aggregate;
    const approved = approvePublication(pending, {
      revisionId: revision.id,
      approverAdminUserId: "approver-1",
      approvedAt: approvalTime,
      requirementKeys: ["STANDARD"],
      meta: { expectedVersion: 3, idempotencyKey: "approve-expiring" },
    }).aggregate;
    const scheduled = schedulePublication(approved, {
      revisionId: revision.id,
      contentHash: approved.currentRevision.contentHash,
      activateAt: new Date("2026-08-14T13:00:00.000Z"),
      editorialTimeZone: "America/Chicago",
      meta: { expectedVersion: 4, idempotencyKey: "schedule-expiring" },
    }).aggregate;
    const published = publishScheduledPublication(scheduled, {
      now: new Date("2026-08-14T13:00:00.000Z"),
      snapshotId: "expired-news-snapshot",
      meta: { expectedVersion: 5, idempotencyKey: "publish-expiring" },
    }).aggregate;
    const afterExpiry = new Date("2026-08-15T12:00:00.000Z");

    expect(isPubliclyEligible(published)).toBe(true);
    expect(isEligibleForOrdinaryDiscovery(published, afterExpiry)).toBe(false);
  });

  it("derives public News availability from the active snapshot, not a later draft", () => {
    const firstRevision = newsRevision(1, "2026-08-20T12:00:00.000Z");
    const submitted = submitPublication(
      createPublicationDraft("news-successor", "successor", firstRevision),
      { expectedVersion: 1, idempotencyKey: "successor-submit-v1" },
    ).aggregate;
    const pending = moveToPendingApproval(submitted, {
      expectedVersion: 2,
      idempotencyKey: "successor-pending-v1",
    }).aggregate;
    const approved = approvePublication(pending, {
      revisionId: firstRevision.id,
      approverAdminUserId: "approver-1",
      approvedAt: approvalTime,
      requirementKeys: ["STANDARD"],
      meta: { expectedVersion: 3, idempotencyKey: "successor-approve-v1" },
    }).aggregate;
    const scheduled = schedulePublication(approved, {
      revisionId: firstRevision.id,
      contentHash: approved.currentRevision.contentHash,
      activateAt: new Date("2026-08-14T13:00:00.000Z"),
      editorialTimeZone: "America/Chicago",
      meta: { expectedVersion: 4, idempotencyKey: "successor-schedule-v1" },
    }).aggregate;
    const published = publishScheduledPublication(scheduled, {
      now: new Date("2026-08-14T13:00:00.000Z"),
      snapshotId: "successor-active-v1",
      meta: { expectedVersion: 5, idempotencyKey: "successor-publish-v1" },
    }).aggregate;
    const draftSuccessor = createSuccessorRevision(
      published,
      newsRevision(2, "2026-08-15T12:00:00.000Z"),
      {
        expectedVersion: 6,
        idempotencyKey: "successor-draft-v2",
      },
    ).aggregate;

    expect(
      newsAvailability(draftSuccessor, new Date("2026-08-16T12:00:00.000Z")),
    ).toBe("CURRENT");
    expect(
      isEligibleForOrdinaryDiscovery(
        draftSuccessor,
        new Date("2026-08-16T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("deeply detaches revisions and snapshots from mutable caller input", () => {
    const input = storyRevision();
    const draft = createPublicationDraft("story-copy", "copy", input);
    const mutableRoot = input.content.body.root as Record<string, unknown>;
    mutableRoot.content = [{ type: "paragraph" }];
    (input as { createdAt: string }).createdAt = "2030-01-01T00:00:00.000Z";

    expect(draft.currentRevision.content.body.root.content).toEqual([]);
    expect(draft.currentRevision.createdAt).toBe(createdAt);
    expect(typeof draft.currentRevision.createdAt).toBe("string");
    expect(Object.isFrozen(draft.currentRevision.content.body.root)).toBe(true);

    const submitted = submitPublication(draft, {
      expectedVersion: 1,
      idempotencyKey: "copy-submit",
    }).aggregate;
    const pending = moveToPendingApproval(submitted, {
      expectedVersion: 2,
      idempotencyKey: "copy-pending",
    }).aggregate;
    const approved = approvePublication(pending, {
      revisionId: input.id,
      approverAdminUserId: "approver-1",
      approvedAt: approvalTime,
      requirementKeys: ["STANDARD"],
      meta: { expectedVersion: 3, idempotencyKey: "copy-approve" },
    }).aggregate;
    const scheduled = schedulePublication(approved, {
      revisionId: input.id,
      contentHash: approved.currentRevision.contentHash,
      activateAt: new Date("2026-08-15T12:00:00.000Z"),
      editorialTimeZone: "America/Chicago",
      meta: { expectedVersion: 4, idempotencyKey: "copy-schedule" },
    }).aggregate;
    const published = publishScheduledPublication(scheduled, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      snapshotId: "copy-snapshot",
      meta: { expectedVersion: 5, idempotencyKey: "copy-publish" },
    }).aggregate;

    expect(Object.isFrozen(published.snapshots[0]?.payload.content)).toBe(true);
  });

  it("makes an idempotent duplicate publish a no-op and retains archive history", () => {
    const approved = approvedStory();
    const scheduled = schedulePublication(approved, {
      revisionId: "story-r1",
      contentHash: approved.currentRevision.contentHash,
      activateAt: new Date("2026-08-15T12:00:00.000Z"),
      editorialTimeZone: "America/Chicago",
      meta: { expectedVersion: 4, idempotencyKey: "schedule-publish" },
    }).aggregate;
    const publishedTransition = publishScheduledPublication(scheduled, {
      now: new Date("2026-08-15T12:00:00.000Z"),
      snapshotId: "snapshot-2",
      meta: { expectedVersion: 5, idempotencyKey: "publish-once" },
    });
    const published = publishedTransition.aggregate;
    const duplicatePublish = publishScheduledPublication(published, {
      now: new Date("2026-08-15T12:05:00.000Z"),
      snapshotId: "snapshot-2",
      meta: { expectedVersion: 5, idempotencyKey: "publish-once" },
    });
    expect(duplicatePublish.outcome).toBe("ALREADY_APPLIED");
    expect(duplicatePublish.aggregate).toBe(published);
    expect(() =>
      publishScheduledPublication(published, {
        now: new Date("2026-08-15T12:00:00.000Z"),
        snapshotId: "different-command-payload",
        meta: { expectedVersion: 5, idempotencyKey: "publish-once" },
      }),
    ).toThrow(/cannot be reused/);
    const archived = archivePublication(published, {
      expectedVersion: 6,
      idempotencyKey: "archive-1",
    }).aggregate;

    const replay = archivePublication(archived, {
      expectedVersion: 6,
      idempotencyKey: "archive-1",
    });
    expect(replay.outcome).toBe("ALREADY_APPLIED");
    expect(replay.aggregate).toBe(archived);
  });
});
