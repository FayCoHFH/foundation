export const SUBMISSION_STATUS_CODES = [
  "submission-review-started",
  "submission-follow-up-marked",
  "submission-review-resumed",
  "submission-accepted",
  "submission-declined",
  "submission-marked-spam",
  "submission-spam-restored",
  "submission-note-updated",
] as const;

export type SubmissionStatusCode = (typeof SUBMISSION_STATUS_CODES)[number];

export const SUBMISSION_STATUS_MESSAGES: Record<SubmissionStatusCode, string> =
  {
    "submission-review-started": "Story submission moved to In Review.",
    "submission-follow-up-marked": "Story submission marked for Follow Up.",
    "submission-review-resumed": "Story submission moved back to In Review.",
    "submission-accepted":
      "Story submission accepted for editorial consideration.",
    "submission-declined": "Story submission declined.",
    "submission-marked-spam": "Story submission marked as spam.",
    "submission-spam-restored":
      "Story submission restored to Received for ordinary triage.",
    "submission-note-updated": "Internal review note updated.",
  };

export function isSubmissionStatusCode(
  value: string | string[] | undefined,
): value is SubmissionStatusCode {
  return (
    typeof value === "string" &&
    (SUBMISSION_STATUS_CODES as readonly string[]).includes(value)
  );
}
