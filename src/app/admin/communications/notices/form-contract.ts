import { z } from "zod";

import type { SiteNoticeAdmin } from "@/modules/communications/notices";
import type { SiteNoticeInput } from "@/modules/communications/notices/notice-content";
import type {
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import {
  formatEditorialDateTimeInput,
  parseEditorialWallTime,
} from "@/platform/time/editorial";

export const SITE_NOTICE_SEVERITIES = ["INFO", "IMPORTANT", "URGENT"] as const;
export const SITE_NOTICE_TARGET_AREAS = ["SITE_WIDE", "HOMEPAGE"] as const;
const SITE_NOTICE_TITLE_MAX_LENGTH = 160;
const SITE_NOTICE_MESSAGE_MAX_LENGTH = 500;
const SITE_NOTICE_CTA_LABEL_MAX_LENGTH = 80;
const SITE_NOTICE_CTA_URL_MAX_LENGTH = 2_048;

export const NOTICE_FORM_FIELDS = [
  "title",
  "message",
  "severity",
  "targetArea",
  "startsAt",
  "endsAt",
  "ctaLabel",
  "ctaUrl",
] as const;

export type NoticeFormField = (typeof NOTICE_FORM_FIELDS)[number];

export type NoticeFormValues = Record<NoticeFormField, string>;

export type NoticeFormState = {
  status: "idle" | "error";
  values: NoticeFormValues;
  message?: string;
  fieldErrors?: Partial<Record<NoticeFormField, string>>;
};

const rawNoticeFormSchema = z.object({
  title: z.string().trim().max(SITE_NOTICE_TITLE_MAX_LENGTH),
  message: z.string().trim().max(SITE_NOTICE_MESSAGE_MAX_LENGTH),
  severity: z.enum(SITE_NOTICE_SEVERITIES),
  targetArea: z.enum(SITE_NOTICE_TARGET_AREAS),
  startsAt: z.string().trim(),
  endsAt: z.string().trim(),
  ctaLabel: z.string().trim().max(SITE_NOTICE_CTA_LABEL_MAX_LENGTH),
  ctaUrl: z.string().trim().max(SITE_NOTICE_CTA_URL_MAX_LENGTH),
});

export const EMPTY_NOTICE_FORM_VALUES: NoticeFormValues = {
  title: "",
  message: "",
  severity: "INFO",
  targetArea: "SITE_WIDE",
  startsAt: "",
  endsAt: "",
  ctaLabel: "",
  ctaUrl: "",
};

export function readNoticeFormValues(formData: FormData): NoticeFormValues {
  return Object.fromEntries(
    NOTICE_FORM_FIELDS.map((field) => [
      field,
      String(formData.get(field) ?? "").trim(),
    ]),
  ) as NoticeFormValues;
}

function fieldErrorsFromZod(error: z.ZodError) {
  const flattened = error.flatten().fieldErrors as Partial<
    Record<NoticeFormField, string[]>
  >;
  return Object.fromEntries(
    NOTICE_FORM_FIELDS.flatMap((field) =>
      flattened[field]?.[0] ? [[field, flattened[field][0]]] : [],
    ),
  ) as Partial<Record<NoticeFormField, string>>;
}

export function parseNoticeFormInput(
  values: NoticeFormValues,
):
  | { input: SiteNoticeInput }
  | { message: string; fieldErrors: Partial<Record<NoticeFormField, string>> } {
  const parsed = rawNoticeFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      message: "Review the highlighted fields and try again.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const fieldErrors: Partial<Record<NoticeFormField, string>> = {};
  const dates = {
    startsAt: null as Date | null,
    endsAt: null as Date | null,
  };
  for (const field of ["startsAt", "endsAt"] as const) {
    if (!parsed.data[field]) continue;
    const result = parseEditorialWallTime(parsed.data[field]);
    if ("error" in result) fieldErrors[field] = result.error;
    else dates[field] = result.date;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      message: "Review the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const input: SiteNoticeInput = {
    title: parsed.data.title,
    message: parsed.data.message,
    severity: parsed.data.severity as SiteNoticeSeverity,
    targetArea: parsed.data.targetArea as SiteNoticeTargetArea,
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    ctaLabel: parsed.data.ctaLabel || null,
    ctaUrl: parsed.data.ctaUrl || null,
  };
  return { input };
}

export function noticeFieldErrorsFromMessage(message: string) {
  const fieldErrors: Partial<Record<NoticeFormField, string>> = {};
  if (/title/i.test(message)) fieldErrors.title = message;
  if (/message/i.test(message)) fieldErrors.message = message;
  if (/severity/i.test(message)) fieldErrors.severity = message;
  if (/target area/i.test(message)) fieldErrors.targetArea = message;
  if (/start time|activation window/i.test(message)) {
    fieldErrors.startsAt = message;
    fieldErrors.endsAt = message;
  }
  if (/end time/i.test(message)) fieldErrors.endsAt = message;
  if (/cta/i.test(message)) {
    fieldErrors.ctaLabel = message;
    fieldErrors.ctaUrl = message;
  }
  return fieldErrors;
}

export function noticeFormError(
  values: NoticeFormValues,
  message: string,
  fieldErrors: Partial<
    Record<NoticeFormField, string>
  > = noticeFieldErrorsFromMessage(message),
): NoticeFormState {
  return {
    status: "error",
    values,
    message,
    ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
  };
}

export function noticeStatusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^| )\w/g, (character) => character.toUpperCase());
}

export function noticeTargetLabel(targetArea: SiteNoticeTargetArea) {
  return targetArea === "SITE_WIDE" ? "Site-wide" : "Homepage";
}

export function noticeSeverityLabel(severity: SiteNoticeSeverity) {
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export function noticeDefaults(notice: SiteNoticeAdmin): NoticeFormValues {
  return {
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    targetArea: notice.targetArea,
    startsAt: formatEditorialDateTimeInput(notice.startsAt),
    endsAt: formatEditorialDateTimeInput(notice.endsAt),
    ctaLabel: notice.ctaLabel ?? "",
    ctaUrl: notice.ctaUrl ?? "",
  };
}
