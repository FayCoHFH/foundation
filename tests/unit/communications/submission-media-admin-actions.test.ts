import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSubject: vi.fn(),
  createClearance: vi.fn(),
  updateClearance: vi.fn(),
  promote: vi.fn(),
  resolveAdminAccess: vi.fn(),
  hasCapability: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  prisma: {},
}));

vi.mock("@/modules/communications/submissions", () => ({
  createPublicStorySubmissionMediaSubject: mocks.createSubject,
  createPublicStorySubmissionMediaClearance: mocks.createClearance,
  updatePublicStorySubmissionMediaClearance: mocks.updateClearance,
  promotePublicStorySubmissionMediaToLibrary: mocks.promote,
}));
vi.mock("@/platform/auth/principal", () => ({
  hasCapability: mocks.hasCapability,
  resolveAdminAccess: mocks.resolveAdminAccess,
}));
vi.mock("@/platform/database/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/platform/storage", () => ({
  getRuntimePublicObjectStore: vi.fn(),
  getRuntimeSubmissionClearanceEvidenceStorage: vi.fn(),
  getRuntimeSubmissionQuarantineStorage: vi.fn(),
}));
vi.mock("@/platform/config/environment", () => ({
  readServerEnvironment: vi.fn(() => ({ authSecret: "a".repeat(32) })),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  createSubmissionMediaClearanceAction,
  createSubmissionMediaSubjectAction,
  updateSubmissionMediaClearanceAction,
  promoteSubmissionMediaAction,
} from "@/app/admin/communications/submissions/media-actions";

const submissionId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const principal = {
  adminUserId: submissionId,
  capabilities: [
    "communications.submissions.review",
    "communications.media.promote",
  ],
};

function form(fields: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(fields)) value.set(key, item);
  return value;
}

describe("administrative submission media actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdminAccess.mockResolvedValue({
      status: "authorized",
      principal,
    });
    mocks.hasCapability.mockReturnValue(true);
  });

  it("uses the review capability and exact media association for subject creation", async () => {
    mocks.createSubject.mockResolvedValue({ id: "subject", version: 1 });
    await expect(
      createSubmissionMediaSubjectAction(
        form({
          submissionId,
          mediaId,
          displayLabel: "Volunteer in blue shirt",
          subjectType: "IDENTIFIABLE_ADULT",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.createSubject).toHaveBeenCalledWith(
      expect.anything(),
      principal,
      expect.objectContaining({ submissionId, mediaIds: [mediaId] }),
    );
  });

  it("preserves unchecked usage permissions when creating a clearance", async () => {
    mocks.createClearance.mockResolvedValue({ id: "clearance", version: 1 });
    await expect(
      createSubmissionMediaClearanceAction(
        form({
          submissionId,
          mediaId,
          clearanceType: "IMAGE_RIGHTS",
          evidenceType: "EXISTING_HABITAT_RELEASE",
          existingEvidenceReference: "release-42",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.createClearance).toHaveBeenCalledWith(
      expect.anything(),
      principal,
      expect.objectContaining({
        websitePublicationAllowed: false,
        paidAdvertisingAllowed: false,
        mediaIds: [mediaId],
      }),
    );
  });

  it("does not allow promotion when the capability is absent", async () => {
    mocks.hasCapability.mockReturnValue(false);
    const result = await promoteSubmissionMediaAction(
      form({
        submissionId,
        mediaId,
        expectedMediaVersion: "3",
        creditTreatment: "NO_PUBLIC_CREDIT",
      }),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("requested action is not permitted");
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it("updates clearance details with an expected version through the review capability", async () => {
    mocks.updateClearance.mockResolvedValue({ id: "clearance", version: 2 });
    await expect(
      updateSubmissionMediaClearanceAction(
        form({
          submissionId,
          mediaId,
          clearanceId: "33333333-3333-4333-8333-333333333333",
          expectedClearanceVersion: "1",
          evidenceType: "EXISTING_HABITAT_RELEASE",
          existingEvidenceReference: "release-42",
          websitePublicationAllowed: "on",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.updateClearance).toHaveBeenCalledWith(
      expect.anything(),
      principal,
      expect.objectContaining({
        clearanceId: "33333333-3333-4333-8333-333333333333",
        expectedClearanceVersion: 1,
        evidenceType: "EXISTING_HABITAT_RELEASE",
        websitePublicationAllowed: true,
        paidAdvertisingAllowed: false,
      }),
    );
  });
});
