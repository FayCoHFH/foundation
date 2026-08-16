export const SITE_NOTICE_STATUS_CODES = [
  "notice-created",
  "notice-updated",
  "notice-published",
  "notice-withdrawn",
] as const;

export type SiteNoticeStatusCode = (typeof SITE_NOTICE_STATUS_CODES)[number];

export const SITE_NOTICE_STATUS_MESSAGES: Record<SiteNoticeStatusCode, string> =
  {
    "notice-created": "Site Notice draft created.",
    "notice-updated": "Site Notice updated.",
    "notice-published":
      "Site Notice published and now follows its activation window.",
    "notice-withdrawn": "Site Notice withdrawn from public display.",
  };

export function isSiteNoticeStatusCode(
  value: string | string[] | undefined,
): value is SiteNoticeStatusCode {
  return (
    typeof value === "string" &&
    (SITE_NOTICE_STATUS_CODES as readonly string[]).includes(value)
  );
}
