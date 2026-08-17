import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { communicationsNavigation } from "@/components/admin-shell";
import { PublicStorySubmissionStatus } from "@/generated/prisma/client";
import type {
  PublicStorySubmissionAdminDetail,
  PublicStorySubmissionAdminListItem,
} from "@/modules/communications/submissions";

import {
  parseSubmissionSearchParams,
  submissionHref,
} from "@/app/admin/communications/submissions/query";
import { SubmissionReviewNoteForm } from "@/app/admin/communications/submissions/review-note-form";
import {
  isSubmissionStatusCode,
  SUBMISSION_STATUS_MESSAGES,
} from "@/app/admin/communications/submissions/status";
import {
  StorySubmissionDetailContent,
  StorySubmissionsListContent,
} from "@/app/admin/communications/submissions/submission-ui";
import {
  submissionActionsForStatus,
  SubmissionWorkflowControls,
} from "@/app/admin/communications/submissions/workflow-controls";

vi.mock("@/app/admin/communications/submissions/actions", () => ({
  submissionReviewNoteAction: vi.fn(),
  submissionWorkflowAction: vi.fn(),
}));

const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-17T18:00:00.000Z");

const principal = {
  adminUserId: id,
  authUserId: "auth-user",
  capabilities: ["communications.submissions.review"] as const,
  email: "not-rendered@example.org",
  isSuperAdmin: false,
  name: "Submission reviewer",
  sessionCreatedAt: now,
  sessionExpiresAt: new Date("2026-08-18T18:00:00.000Z"),
  sessionId: "session",
};

function listItem(
  overrides: Partial<PublicStorySubmissionAdminListItem> = {},
): PublicStorySubmissionAdminListItem {
  return {
    id,
    submitterName: "Jordan Example",
    relationshipToHabitat: "Community volunteer",
    suggestedTitle: "A neighborhood built together",
    status: PublicStorySubmissionStatus.RECEIVED,
    involvesMinor: true,
    involvesHomeownerOrApplicant: false,
    containsSensitivePersonalCircumstances: false,
    receivedAt: now,
    updatedAt: now,
    statusChangedAt: now,
    version: 1,
    ...overrides,
  };
}

function detail(
  overrides: Partial<PublicStorySubmissionAdminDetail> = {},
): PublicStorySubmissionAdminDetail {
  return {
    id,
    submitterName: "Jordan Example",
    submitterEmail: "jordan@example.org",
    relationshipToHabitat: "Community volunteer",
    suggestedTitle: "A neighborhood built together",
    storyText: "First paragraph.\nStill first paragraph.\n\nSecond paragraph.",
    contactConsent: true,
    privacyNoticeVersion: "public-story-v1",
    privacyNoticeAcceptedAt: now,
    editorialReviewAcknowledged: true,
    sensitiveDataWarningAcknowledged: true,
    publicationInterest: true,
    involvesMinor: true,
    involvesHomeownerOrApplicant: false,
    containsSensitivePersonalCircumstances: true,
    status: PublicStorySubmissionStatus.IN_REVIEW,
    internalReviewNote: "Keep this private.",
    version: 4,
    receivedAt: now,
    statusChangedAt: now,
    statusChangedByDisplayName: "Communications Manager",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Story Submission administrative UI", () => {
  it("filters navigation by capability and marks the protected route current", () => {
    expect(
      communicationsNavigation(principal, "/admin/communications/submissions"),
    ).toContainEqual({
      href: "/admin/communications/submissions",
      label: "Story Submissions",
      current: true,
    });
    expect(
      communicationsNavigation(
        { ...principal, capabilities: [] },
        "/admin/communications/submissions",
      ),
    ).not.toContainEqual(
      expect.objectContaining({ label: "Story Submissions" }),
    );
  });

  it("normalizes status and pagination queries safely and preserves filters", () => {
    expect(
      parseSubmissionSearchParams({
        status: "IN_REVIEW",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      state: { status: "IN_REVIEW", page: 2, pageSize: 50 },
      invalid: { status: false, page: false, pageSize: false },
    });
    expect(
      parseSubmissionSearchParams({
        status: "unknown",
        page: "0",
        pageSize: "101",
      }).invalid,
    ).toEqual({ status: true, page: true, pageSize: true });
    expect(parseSubmissionSearchParams({ status: "" })).toEqual({
      state: { page: 1, pageSize: 25 },
      invalid: { status: false, page: false, pageSize: false },
    });
    expect(submissionHref({ status: "FOLLOW_UP", page: 3, pageSize: 50 })).toBe(
      "/admin/communications/submissions?status=FOLLOW_UP&page=3&pageSize=50",
    );
  });

  it("renders safe paginated list fields without confidential detail fields", () => {
    const markup = renderToStaticMarkup(
      <StorySubmissionsListContent
        result={{ items: [listItem()], page: 1, pageSize: 25, total: 1 }}
        state={{ page: 1, pageSize: 25 }}
        invalid={false}
      />,
    );
    expect(markup).toContain("Story Submissions");
    expect(markup).toContain("Confidential intake");
    expect(markup).toContain("Jordan Example");
    expect(markup).toContain("Community volunteer");
    expect(markup).toContain("A neighborhood built together");
    expect(markup).toContain("Received");
    expect(markup).toContain("Minor involved");
    expect(markup).toContain("Showing");
    expect(markup).toContain("Review Story Submission from Jordan Example");
    expect(markup).not.toContain("jordan@example.org");
    expect(markup).not.toContain("First paragraph");
    expect(markup).not.toContain("Keep this private");
    expect(markup).not.toContain("privacy-notice");
  });

  it("renders status-specific empty states without implying inactivity", () => {
    const markup = renderToStaticMarkup(
      <StorySubmissionsListContent
        result={{ items: [], page: 1, pageSize: 25, total: 0 }}
        state={{
          status: PublicStorySubmissionStatus.FOLLOW_UP,
          page: 1,
          pageSize: 25,
        }}
        invalid={true}
      />,
    );
    expect(markup).toContain("No Story submissions are waiting for follow-up.");
    expect(markup).toContain("invalid filter or page value");
    expect(markup).not.toContain("Submit a story");
  });

  it("renders confidential detail sections and keeps publication interest distinct from consent", () => {
    const markup = renderToStaticMarkup(
      <StorySubmissionDetailContent
        submission={detail()}
        statusCode="submission-review-started"
      />,
    );
    expect(markup).toContain("Review Story Submission");
    expect(markup).toContain("jordan@example.org");
    expect(markup).toContain("mailto:jordan@example.org");
    expect(markup).toContain("First paragraph.");
    expect(markup).toContain("Second paragraph.");
    expect(markup).toContain("public-story-v1");
    expect(markup).toContain("Privacy notice accepted");
    expect(markup).toContain(
      "Open to discussing publication — this is not publication consent.",
    );
    expect(markup).toContain("Minor involved");
    expect(markup).toContain("Sensitive personal circumstances");
    expect(markup).toContain("Keep this private.");
    expect(markup).toContain("Story submission moved to In Review.");
    expect(markup).not.toContain("auditEvents");
    expect(markup).not.toContain("tokenHash");
    expect(markup).not.toContain("Convert to Story");
    expect(markup).not.toContain("Delete");
    expect(markup).not.toContain("Export");
  });

  it("renders only active lifecycle actions and closes terminal states", () => {
    expect(
      submissionActionsForStatus("RECEIVED").map(([, label]) => label),
    ).toEqual(["Begin Review", "Accept", "Decline", "Mark as Spam"]);
    expect(
      submissionActionsForStatus("IN_REVIEW").map(([, label]) => label),
    ).toEqual(["Mark for Follow-Up", "Accept", "Decline", "Mark as Spam"]);
    expect(
      submissionActionsForStatus("FOLLOW_UP").map(([, label]) => label),
    ).toEqual(["Resume Review", "Accept", "Decline", "Mark as Spam"]);
    for (const status of ["ACCEPTED", "DECLINED", "SPAM"] as const) {
      const markup = renderToStaticMarkup(
        <SubmissionWorkflowControls
          submissionId={id}
          expectedVersion={4}
          status={status}
        />,
      );
      expect(markup).not.toContain('name="action"');
      expect(markup).toContain("terminal");
    }
    const spamRestoreMarkup = renderToStaticMarkup(
      <SubmissionWorkflowControls
        submissionId={id}
        expectedVersion={4}
        status="SPAM"
        canRestoreSpam
      />,
    );
    expect(spamRestoreMarkup).toContain("Restore to Received");
    expect(spamRestoreMarkup).toContain('value="restore-spam"');
    const receivedMarkup = renderToStaticMarkup(
      <SubmissionWorkflowControls
        submissionId={id}
        expectedVersion={4}
        status="RECEIVED"
      />,
    );
    expect(receivedMarkup).toContain("Mark as Spam");
    expect(receivedMarkup).toContain('type="button"');
    expect(receivedMarkup).not.toContain('value="mark-spam"');
  });

  it("keeps review-note input labelled, bounded, and versioned", () => {
    const markup = renderToStaticMarkup(
      <SubmissionReviewNoteForm
        submissionId={id}
        expectedVersion={4}
        initialValue="Current note"
      />,
    );
    expect(markup).toContain('name="internalReviewNote"');
    expect(markup).toContain('maxLength="2000"');
    expect(markup).toContain('name="expectedVersion" value="4"');
    expect(markup).toContain("Private to authorized reviewers");
    expect(markup).toContain("Do not copy this note into public content");
  });

  it("allowlists post-action status messages and ignores arbitrary codes", () => {
    expect(isSubmissionStatusCode("submission-note-updated")).toBe(true);
    expect(isSubmissionStatusCode("submitter@example.org")).toBe(false);
    expect(SUBMISSION_STATUS_MESSAGES["submission-accepted"]).not.toContain(
      "consent",
    );
    expect(SUBMISSION_STATUS_MESSAGES["submission-spam-restored"]).toContain(
      "ordinary triage",
    );
  });
});
