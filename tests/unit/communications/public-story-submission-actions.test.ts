import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  begin: vi.fn(),
  decline: vi.fn(),
  followUp: vi.fn(),
  spam: vi.fn(),
  restore: vi.fn(),
  updateNote: vi.fn(),
  resolveAdminAccess: vi.fn(),
  hasCapability: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  prisma: {},
}));

vi.mock("@/modules/communications/submissions", () => ({
  acceptPublicStorySubmission: mocks.accept,
  beginPublicStorySubmissionReview: mocks.begin,
  declinePublicStorySubmission: mocks.decline,
  markPublicStorySubmissionFollowUp: mocks.followUp,
  markPublicStorySubmissionSpam: mocks.spam,
  restoreSpamPublicStorySubmission: mocks.restore,
  updatePublicStorySubmissionReviewNote: mocks.updateNote,
}));
vi.mock("@/platform/auth/principal", () => ({
  hasCapability: mocks.hasCapability,
  resolveAdminAccess: mocks.resolveAdminAccess,
}));
vi.mock("@/platform/database/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  submissionReviewNoteAction,
  submissionWorkflowAction,
} from "@/app/admin/communications/submissions/actions";
import { ConcurrencyError } from "@/platform/errors/app-error";

const id = "11111111-1111-4111-8111-111111111111";
const principal = {
  adminUserId: id,
  capabilities: ["communications.submissions.review"],
};

function workflowForm(action: string) {
  const form = new FormData();
  form.set("submissionId", id);
  form.set("expectedVersion", "7");
  form.set("action", action);
  return form;
}

function noteForm(value: string, version = "7") {
  const form = new FormData();
  form.set("submissionId", id);
  form.set("expectedVersion", version);
  form.set("internalReviewNote", value);
  return form;
}

describe("Story Submission administrative server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAdminAccess.mockResolvedValue({
      status: "authorized",
      principal,
    });
    mocks.hasCapability.mockReturnValue(true);
  });

  it("invokes the explicit domain command with the expected version and allowlisted redirect", async () => {
    mocks.accept.mockResolvedValue({});
    await expect(
      submissionWorkflowAction({ status: "idle" }, workflowForm("accept")),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.accept).toHaveBeenCalledWith(mocks.prisma, principal, id, 7);
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/admin/communications/submissions/${id}?submission=submission-accepted`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/communications/submissions",
    );
  });

  it("maps resume review separately while using the same authoritative command", async () => {
    mocks.begin.mockResolvedValue({});
    await expect(
      submissionWorkflowAction(
        { status: "idle" },
        workflowForm("resume-review"),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.begin).toHaveBeenCalledWith(mocks.prisma, principal, id, 7);
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/admin/communications/submissions/${id}?submission=submission-review-resumed`,
    );
  });

  it("requires the higher restore capability for spam restoration", async () => {
    const restorer = {
      ...principal,
      capabilities: [
        "communications.submissions.review",
        "communications.submissions.restore_spam",
      ],
    };
    mocks.resolveAdminAccess.mockResolvedValue({
      status: "authorized",
      principal: restorer,
    });
    mocks.restore.mockResolvedValue({});
    await expect(
      submissionWorkflowAction(
        { status: "idle" },
        workflowForm("restore-spam"),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.restore).toHaveBeenCalledWith(mocks.prisma, restorer, id, 7);
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/admin/communications/submissions/${id}?submission=submission-spam-restored`,
    );
  });

  it("rejects direct action invocation without the review capability", async () => {
    mocks.hasCapability.mockReturnValue(false);
    const result = await submissionWorkflowAction(
      { status: "idle" },
      workflowForm("accept"),
    );
    expect(result).toEqual({
      status: "error",
      message: "The requested action is not permitted.",
    });
    expect(result.message).not.toContain("Jordan");
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("retains a bounded note value and field error on validation failure", async () => {
    const result = await submissionReviewNoteAction(
      { status: "idle", value: "old" },
      noteForm("x".repeat(2_001)),
    );
    expect(result.status).toBe("error");
    expect(result.value).toHaveLength(2_000);
    expect(result.fieldError).toContain("2,000");
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("preserves the entered note and reports stale concurrency without success feedback", async () => {
    mocks.updateNote.mockRejectedValue(new ConcurrencyError());
    const result = await submissionReviewNoteAction(
      { status: "idle", value: "old" },
      noteForm("Keep this entered note."),
    );
    expect(result).toEqual({
      status: "error",
      message:
        "This submission changed in another session. Reload before submitting again.",
      value: "Keep this entered note.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
