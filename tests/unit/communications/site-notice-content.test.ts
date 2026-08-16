import { describe, expect, it } from "vitest";

import {
  compareEffectiveSiteNotices,
  deriveSiteNoticeStatus,
  validateCta,
  validateLimit,
  validateSiteNoticeInput,
} from "@/modules/communications/notices";
import {
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import { ValidationError } from "@/platform/errors/app-error";

const base = {
  severity: SiteNoticeSeverity.INFO,
  targetArea: SiteNoticeTargetArea.SITE_WIDE,
};

describe("Site Notice validation", () => {
  it("allows an incomplete draft but requires title, message, and a bounded window to publish", () => {
    expect(validateSiteNoticeInput(base)).toMatchObject({
      title: "",
      message: "",
    });
    expect(() => validateSiteNoticeInput(base, "PUBLISH")).toThrow(
      ValidationError,
    );
    expect(() =>
      validateSiteNoticeInput(
        {
          ...base,
          title: "Office closed",
          message: "The office is closed today.",
          startsAt: new Date("2040-08-16T12:00:00Z"),
          endsAt: new Date("2040-08-16T13:00:00Z"),
        },
        "PUBLISH",
      ),
    ).not.toThrow();
  });

  it("rejects oversized title and message values", () => {
    expect(() =>
      validateSiteNoticeInput({ ...base, title: "x".repeat(161) }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSiteNoticeInput({ ...base, message: "x".repeat(501) }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid severity, target area, and windows", () => {
    expect(() =>
      validateSiteNoticeInput({
        ...base,
        severity: "EMERGENCY" as SiteNoticeSeverity,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSiteNoticeInput({
        ...base,
        targetArea: "RESTORE" as SiteNoticeTargetArea,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSiteNoticeInput({
        ...base,
        startsAt: new Date("2040-08-16T13:00:00Z"),
        endsAt: new Date("2040-08-16T12:00:00Z"),
      }),
    ).toThrow(ValidationError);
  });

  it("requires a complete safe CTA pair", () => {
    expect(validateCta(null, null)).toEqual({ label: null, url: null });
    expect(validateCta("Read more", "/news")).toEqual({
      label: "Read more",
      url: "/news",
    });
    expect(validateCta("Read more", "https://example.org/news")).toEqual({
      label: "Read more",
      url: "https://example.org/news",
    });
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "http://example.org",
      "https://user:password@example.org",
      "//example.org/news",
    ]) {
      expect(() => validateCta("Read more", url)).toThrow(ValidationError);
    }
    expect(() => validateCta("Read more", null)).toThrow(ValidationError);
  });
});

describe("Site Notice derived behavior", () => {
  const startsAt = new Date("2040-08-16T12:00:00Z");
  const endsAt = new Date("2040-08-16T13:00:00Z");

  it("uses half-open activation and derives lifecycle status", () => {
    const notice = {
      lifecycle: SiteNoticeLifecycle.PUBLISHED,
      startsAt,
      endsAt,
    };
    expect(
      deriveSiteNoticeStatus(notice, new Date("2040-08-16T11:59:59Z")),
    ).toBe("UPCOMING");
    expect(deriveSiteNoticeStatus(notice, startsAt)).toBe("ACTIVE");
    expect(deriveSiteNoticeStatus(notice, endsAt)).toBe("EXPIRED");
    expect(
      deriveSiteNoticeStatus(
        { ...notice, lifecycle: SiteNoticeLifecycle.WITHDRAWN },
        startsAt,
      ),
    ).toBe("WITHDRAWN");
    expect(
      deriveSiteNoticeStatus(
        { ...notice, lifecycle: SiteNoticeLifecycle.DRAFT },
        startsAt,
      ),
    ).toBe("DRAFT");
  });

  it("orders urgent, important, and info notices by recency then ID", () => {
    const notices = [
      { id: "b", severity: SiteNoticeSeverity.INFO, startsAt },
      {
        id: "c",
        severity: SiteNoticeSeverity.IMPORTANT,
        startsAt: new Date(startsAt.valueOf() + 1_000),
      },
      { id: "a", severity: SiteNoticeSeverity.URGENT, startsAt },
    ];
    expect(
      notices.sort(compareEffectiveSiteNotices).map(({ id }) => id),
    ).toEqual(["a", "c", "b"]);
  });

  it("bounds requested limits", () => {
    expect(validateLimit(undefined, 3, 10, "Public limit")).toBe(3);
    expect(() => validateLimit(0, 3, 10, "Public limit")).toThrow(
      ValidationError,
    );
    expect(() => validateLimit(11, 3, 10, "Public limit")).toThrow(
      ValidationError,
    );
  });
});
