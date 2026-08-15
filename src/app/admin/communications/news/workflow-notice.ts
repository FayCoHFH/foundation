export const NEWS_WORKFLOW_NOTICE_CODES = [
  "submit",
  "changes",
  "approval",
  "approve",
  "release",
  "withdraw",
  "archive",
  "feature",
  "clear-feature",
] as const;

export type NewsWorkflowNoticeCode =
  (typeof NEWS_WORKFLOW_NOTICE_CODES)[number];

export const NEWS_WORKFLOW_NOTICE_MESSAGES: Record<
  NewsWorkflowNoticeCode,
  string
> = {
  submit: "News submitted for review.",
  changes: "News changes requested.",
  approval: "News sent for approval.",
  approve: "Exact News revision approved.",
  release: "Immutable public News snapshot released.",
  withdraw: "Public News withdrawn.",
  archive: "News archived.",
  feature: "Featured News updated.",
  "clear-feature": "Featured News cleared.",
};

export function isNewsWorkflowNoticeCode(
  value: string | string[] | undefined,
): value is NewsWorkflowNoticeCode {
  return (
    typeof value === "string" &&
    (NEWS_WORKFLOW_NOTICE_CODES as readonly string[]).includes(value)
  );
}
