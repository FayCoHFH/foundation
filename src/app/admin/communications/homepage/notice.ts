export const HOMEPAGE_PLACEMENT_NOTICE_CODES = [
  "assign",
  "schedule",
  "clear",
  "cancel",
] as const;

export type HomepagePlacementNoticeCode =
  (typeof HOMEPAGE_PLACEMENT_NOTICE_CODES)[number];

export const HOMEPAGE_PLACEMENT_NOTICE_MESSAGES: Record<
  HomepagePlacementNoticeCode,
  string
> = {
  assign: "Homepage placement updated.",
  schedule: "Homepage placement scheduled.",
  clear: "Homepage placement cleared.",
  cancel: "Upcoming homepage placement cancelled.",
};

export function isHomepagePlacementNoticeCode(
  value: string | string[] | undefined,
): value is HomepagePlacementNoticeCode {
  return (
    typeof value === "string" &&
    (HOMEPAGE_PLACEMENT_NOTICE_CODES as readonly string[]).includes(value)
  );
}
