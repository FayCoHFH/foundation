import {
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

export const SITE_NOTICE_SEVERITIES = [
  SiteNoticeSeverity.INFO,
  SiteNoticeSeverity.IMPORTANT,
  SiteNoticeSeverity.URGENT,
] as const;

export const SITE_NOTICE_TARGET_AREAS = [
  SiteNoticeTargetArea.SITE_WIDE,
  SiteNoticeTargetArea.HOMEPAGE,
] as const;

export const SITE_NOTICE_TITLE_MAX_LENGTH = 160;
export const SITE_NOTICE_MESSAGE_MAX_LENGTH = 500;
export const SITE_NOTICE_CTA_LABEL_MAX_LENGTH = 80;
export const SITE_NOTICE_CTA_URL_MAX_LENGTH = 2_048;
export const SITE_NOTICE_PUBLIC_LIMIT = 3;
export const SITE_NOTICE_PUBLIC_MAX_LIMIT = 10;
export const SITE_NOTICE_ADMIN_LIMIT = 50;
export const SITE_NOTICE_ADMIN_MAX_LIMIT = 100;

export type SiteNoticeStatus =
  "DRAFT" | "UPCOMING" | "ACTIVE" | "EXPIRED" | "WITHDRAWN";

export type SiteNoticeInput = Readonly<{
  title?: string | null;
  message?: string | null;
  severity: SiteNoticeSeverity;
  targetArea: SiteNoticeTargetArea;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}>;

export type ValidatedSiteNoticeInput = Readonly<{
  title: string;
  message: string;
  severity: SiteNoticeSeverity;
  targetArea: SiteNoticeTargetArea;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}>;

function text(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new ValidationError(`${label} must be text.`);
  }
  const normalized = value?.trim() ?? "";
  if (normalized.length > maxLength) {
    throw new ValidationError(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}

function date(value: Date | null | undefined, label: string) {
  if (value === undefined || value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new ValidationError(`${label} must be a valid instant.`);
  }
  return value;
}

function enumValue<T extends string>(
  value: T,
  allowed: readonly T[],
  label: string,
) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${label} is not supported.`);
  }
  return value;
}

export function validateCta(
  label: string | null | undefined,
  url: string | null | undefined,
) {
  const normalizedLabel = text(
    label,
    "CTA label",
    SITE_NOTICE_CTA_LABEL_MAX_LENGTH,
  );
  const normalizedUrl = text(url, "CTA URL", SITE_NOTICE_CTA_URL_MAX_LENGTH);
  if (Boolean(normalizedLabel) !== Boolean(normalizedUrl)) {
    throw new ValidationError("CTA label and URL must be supplied together.");
  }
  if (!normalizedUrl) return { label: null, url: null } as const;

  if (
    normalizedUrl.startsWith("//") ||
    /[\u0000-\u001f\u007f]/.test(normalizedUrl)
  ) {
    throw new ValidationError("CTA URL must use a safe internal or HTTPS URL.");
  }
  if (normalizedUrl.startsWith("/")) {
    return { label: normalizedLabel, url: normalizedUrl } as const;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new ValidationError("CTA URL must use a safe internal or HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ValidationError("CTA URL must use a safe internal or HTTPS URL.");
  }
  return { label: normalizedLabel, url: normalizedUrl } as const;
}

export function validateSiteNoticeInput(
  input: SiteNoticeInput,
  mode: "DRAFT" | "PUBLISH" = "DRAFT",
): ValidatedSiteNoticeInput {
  const title = text(input.title, "Title", SITE_NOTICE_TITLE_MAX_LENGTH);
  const message = text(
    input.message,
    "Message",
    SITE_NOTICE_MESSAGE_MAX_LENGTH,
  );
  const severity = enumValue(
    input.severity,
    SITE_NOTICE_SEVERITIES,
    "Severity",
  );
  const targetArea = enumValue(
    input.targetArea,
    SITE_NOTICE_TARGET_AREAS,
    "Target area",
  );
  const startsAt = date(input.startsAt, "Start time");
  const endsAt = date(input.endsAt, "End time");
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new ValidationError("Start time must precede end time.");
  }
  if (mode === "PUBLISH") {
    if (!title) throw new ValidationError("Title is required to publish.");
    if (!message) throw new ValidationError("Message is required to publish.");
    if (!startsAt || !endsAt) {
      throw new ValidationError(
        "Published Site Notices require a bounded activation window.",
      );
    }
  }
  const cta = validateCta(input.ctaLabel, input.ctaUrl);
  return {
    title,
    message,
    severity,
    targetArea,
    ctaLabel: cta.label,
    ctaUrl: cta.url,
    startsAt,
    endsAt,
  };
}

export function deriveSiteNoticeStatus(
  notice: {
    lifecycle: SiteNoticeLifecycle;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  evaluationTime: Date,
): SiteNoticeStatus {
  if (notice.lifecycle === SiteNoticeLifecycle.DRAFT) return "DRAFT";
  if (notice.lifecycle === SiteNoticeLifecycle.WITHDRAWN) return "WITHDRAWN";
  if (!notice.startsAt || !notice.endsAt) return "DRAFT";
  if (evaluationTime < notice.startsAt) return "UPCOMING";
  if (evaluationTime >= notice.endsAt) return "EXPIRED";
  return "ACTIVE";
}

export function compareEffectiveSiteNotices(
  left: { severity: SiteNoticeSeverity; startsAt: Date; id: string },
  right: { severity: SiteNoticeSeverity; startsAt: Date; id: string },
) {
  const severityOrder = {
    [SiteNoticeSeverity.URGENT]: 3,
    [SiteNoticeSeverity.IMPORTANT]: 2,
    [SiteNoticeSeverity.INFO]: 1,
  } as const;
  return (
    severityOrder[right.severity] - severityOrder[left.severity] ||
    right.startsAt.valueOf() - left.startsAt.valueOf() ||
    left.id.localeCompare(right.id)
  );
}

export function validateLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
) {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new ValidationError(`${label} must be between 1 and ${maximum}.`);
  }
  return limit;
}

export function validateEvaluationTime(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new ValidationError("Evaluation time must be a valid instant.");
  }
  return value;
}
