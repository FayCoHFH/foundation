import { describe, expect, it } from "vitest";

import {
  classifyNewsAvailability,
  isApprovedCurrentCandidateUnreleased,
  MAX_QUEUE_PAGE_SIZE,
  normalizePublicationQueueRequest,
  queueDetailPath,
} from "@/modules/communications/queue";

describe("Publication Queue contracts", () => {
  it("normalizes view, filter, pagination, and explicit clock input", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(
      normalizePublicationQueueRequest({
        view: "NEEDS_APPROVAL",
        filters: { kind: "NEWS" },
        page: 2,
        pageSize: 10,
        now,
      }),
    ).toEqual({
      view: "NEEDS_APPROVAL",
      filters: { kind: "NEWS" },
      page: 2,
      pageSize: 10,
      now,
    });
  });

  it("rejects unsupported views, invalid pagination, and invalid owner IDs", () => {
    expect(() =>
      normalizePublicationQueueRequest({ view: "SCHEDULED" as never }),
    ).toThrow(/unsupported queue view/i);
    expect(() =>
      normalizePublicationQueueRequest({ view: "ALL", page: 0 }),
    ).toThrow(/positive integer/i);
    expect(() =>
      normalizePublicationQueueRequest({
        view: "ALL",
        pageSize: MAX_QUEUE_PAGE_SIZE + 1,
      }),
    ).toThrow(/cannot exceed/i);
    expect(() =>
      normalizePublicationQueueRequest({
        view: "ALL",
        filters: { editorialOwnerAdminUserId: "not-an-id" },
      }),
    ).toThrow(/valid identifier/i);
    expect(() =>
      normalizePublicationQueueRequest({
        view: "ALL",
        page: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(/positive integer/i);
  });

  it("classifies News expiry at the explicit evaluation instant", () => {
    const at = new Date("2026-08-15T12:00:00.000Z");
    expect(classifyNewsAvailability(null, at)).toBe("CURRENT");
    expect(
      classifyNewsAvailability(new Date("2026-08-15T11:59:59.000Z"), at),
    ).toBe("EXPIRED");
    expect(classifyNewsAvailability(at, at)).toBe("EXPIRED");
    expect(
      classifyNewsAvailability(new Date("2026-08-15T12:00:01.000Z"), at),
    ).toBe("CURRENT");
  });

  it("selects type-specific administrative detail routes", () => {
    expect(queueDetailPath("STORY", "story-id")).toBe(
      "/admin/communications/stories/story-id",
    );
    expect(queueDetailPath("NEWS", "news-id")).toBe(
      "/admin/communications/news/news-id",
    );
  });

  it("requires exact approval of the current candidate, not an older public revision", () => {
    const base = {
      workflowState: "APPROVED" as const,
      currentRevisionId: "revision-2",
      approvedRevisionId: "revision-2",
      currentContentHash: "hash-2",
      approvedContentHash: "hash-2",
      activeSnapshotSourceRevisionId: "revision-1",
    };
    expect(isApprovedCurrentCandidateUnreleased(base)).toBe(true);
    expect(
      isApprovedCurrentCandidateUnreleased({
        ...base,
        approvedRevisionId: "revision-1",
        approvedContentHash: "hash-1",
      }),
    ).toBe(false);
    expect(
      isApprovedCurrentCandidateUnreleased({
        ...base,
        activeSnapshotSourceRevisionId: "revision-2",
      }),
    ).toBe(false);
  });
});
