import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { communicationsNavigation } from "@/components/admin-shell";
import { SiteNoticeContent, NoticeItem } from "@/components/site/site-notice";
import {
  SiteNoticeLifecycle,
  SiteNoticeSeverity,
  SiteNoticeTargetArea,
} from "@/generated/prisma/client";
import type {
  SiteNoticeAdmin,
  SiteNoticePublic,
} from "@/modules/communications/notices";

import { NoticeForm } from "@/app/admin/communications/notices/notice-form";
import { SiteNoticeListContent } from "@/app/admin/communications/notices/notice-list-ui";
import {
  EMPTY_NOTICE_FORM_VALUES,
  noticeFieldErrorsFromMessage,
  parseNoticeFormInput,
  noticeFormError,
  type NoticeFormState,
} from "@/app/admin/communications/notices/form-contract";
import { NoticeWorkflowControls } from "@/app/admin/communications/notices/workflow-controls";
import {
  isSiteNoticeStatusCode,
  SITE_NOTICE_STATUS_MESSAGES,
} from "@/app/admin/communications/notices/status";

const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-16T12:00:00.000Z");

const principal = {
  adminUserId: id,
  authUserId: "auth-user",
  capabilities: ["communications.notices.manage"] as const,
  email: "not-rendered@example.org",
  isSuperAdmin: false,
  name: "Notice manager",
  sessionCreatedAt: now,
  sessionExpiresAt: new Date("2026-08-17T12:00:00.000Z"),
  sessionId: "session",
};

function admin(overrides: Partial<SiteNoticeAdmin> = {}): SiteNoticeAdmin {
  return {
    id,
    title: "Office schedule",
    message: "The office has a temporary schedule change.",
    severity: SiteNoticeSeverity.IMPORTANT,
    targetArea: SiteNoticeTargetArea.SITE_WIDE,
    lifecycle: SiteNoticeLifecycle.DRAFT,
    startsAt: new Date("2026-08-16T13:00:00.000Z"),
    endsAt: new Date("2026-08-17T13:00:00.000Z"),
    status: "UPCOMING",
    hasCta: false,
    ctaLabel: null,
    ctaUrl: null,
    version: 4,
    createdAt: now,
    updatedAt: now,
    creatorDisplayName: "Creator",
    updaterDisplayName: "Updater",
    publishedAt: null,
    withdrawnAt: null,
    ...overrides,
  };
}

function publicNotice(
  overrides: Partial<SiteNoticePublic> = {},
): SiteNoticePublic {
  return {
    id,
    title: "Operational notice",
    message: "The office has a temporary schedule change.",
    severity: SiteNoticeSeverity.INFO,
    targetArea: SiteNoticeTargetArea.SITE_WIDE,
    startsAt: now,
    endsAt: new Date("2026-08-17T12:00:00.000Z"),
    ctaLabel: null,
    ctaUrl: null,
    ...overrides,
  };
}

const workflowAction = async (state: {
  status: "idle" | "error";
  message?: string;
}) => state;

describe("Site Notice administration UI", () => {
  it("shows the navigation entry only with the capability and marks it current", () => {
    expect(
      communicationsNavigation(principal, "/admin/communications/notices"),
    ).toContainEqual({
      href: "/admin/communications/notices",
      label: "Site Notices",
      current: true,
    });
    expect(
      communicationsNavigation(
        { ...principal, capabilities: [] },
        "/admin/communications/notices",
      ),
    ).not.toContainEqual(expect.objectContaining({ label: "Site Notices" }));
  });

  it("renders the bounded list read model with typed detail links and safe fields", () => {
    const markup = renderToStaticMarkup(
      <SiteNoticeListContent notices={[admin()]} canCreate />,
    );
    expect(markup).toContain("Site Notices");
    expect(markup).toContain("Office schedule");
    expect(markup).toContain("Important");
    expect(markup).toContain("Site-wide");
    expect(markup).toContain("Upcoming");
    expect(markup).toContain("Starts");
    expect(markup).toContain("Ends");
    expect(markup).toContain("Updated by");
    expect(markup).toContain(`/admin/communications/notices/${id}`);
    expect(markup).not.toContain("not-rendered@example.org");
  });

  it("renders all create fields without lifecycle, actor, or editable version controls", () => {
    const action = async (state: NoticeFormState): Promise<NoticeFormState> =>
      state;
    const markup = renderToStaticMarkup(<NoticeForm action={action} />);
    for (const field of [
      "title",
      "message",
      "severity",
      "targetArea",
      "startsAt",
      "endsAt",
      "ctaLabel",
      "ctaUrl",
    ]) {
      expect(markup).toContain(`name="${field}"`);
    }
    expect(markup).not.toContain('name="lifecycle"');
    expect(markup).not.toContain('name="createdByAdminUserId"');
    expect(markup).not.toContain('name="version"');
  });

  it("includes the protected expected version on edit and only shows valid lifecycle actions", () => {
    const action = async (state: NoticeFormState): Promise<NoticeFormState> =>
      state;
    const draftMarkup = renderToStaticMarkup(
      <>
        <NoticeForm
          action={action}
          defaults={{ ...EMPTY_NOTICE_FORM_VALUES, title: "Office schedule" }}
          hidden={{ noticeId: id, expectedVersion: 4 }}
        />
        <NoticeWorkflowControls notice={admin()} action={workflowAction} />
      </>,
    );
    expect(draftMarkup).toContain('name="expectedVersion" value="4"');
    expect(draftMarkup).toContain("Publish Site Notice");
    expect(draftMarkup).not.toContain("Withdraw from public display");

    const withdrawnMarkup = renderToStaticMarkup(
      <NoticeWorkflowControls
        notice={admin({
          lifecycle: SiteNoticeLifecycle.WITHDRAWN,
          status: "WITHDRAWN",
        })}
        action={workflowAction}
      />,
    );
    expect(withdrawnMarkup).not.toContain("Publish Site Notice");
    expect(withdrawnMarkup).not.toContain("restore");
    expect(withdrawnMarkup).not.toContain("republish");

    const publishedMarkup = renderToStaticMarkup(
      <NoticeWorkflowControls
        notice={admin({
          lifecycle: SiteNoticeLifecycle.PUBLISHED,
          status: "ACTIVE",
        })}
        action={workflowAction}
      />,
    );
    expect(publishedMarkup).toContain("Withdraw from public display");
    expect(publishedMarkup).not.toContain("Delete");
  });

  it("keeps field errors associated and status feedback allowlisted", () => {
    const values = { ...EMPTY_NOTICE_FORM_VALUES, ctaUrl: "javascript:bad" };
    const parsed = parseNoticeFormInput(values);
    expect("input" in parsed).toBe(true);
    expect(
      noticeFieldErrorsFromMessage(
        "CTA URL must use a safe internal or HTTPS URL.",
      ),
    ).toEqual({
      ctaLabel: expect.any(String),
      ctaUrl: expect.any(String),
    });
    expect(
      noticeFormError(values, "CTA label and URL must be supplied together.")
        .fieldErrors,
    ).toEqual({ ctaLabel: expect.any(String), ctaUrl: expect.any(String) });
    expect(
      noticeFieldErrorsFromMessage("Start time must precede end time."),
    ).toEqual({
      startsAt: expect.any(String),
      endsAt: expect.any(String),
    });
    expect(
      noticeFormError(
        values,
        "This Site Notice changed in another session. Reload before submitting again.",
      ).message,
    ).not.toContain("<");
    expect(isSiteNoticeStatusCode("notice-updated")).toBe(true);
    expect(isSiteNoticeStatusCode("arbitrary text")).toBe(false);
    expect(SITE_NOTICE_STATUS_MESSAGES["notice-updated"]).toBe(
      "Site Notice updated.",
    );
  });
});

describe("public Site Notice rendering", () => {
  it("renders SITE_WIDE and HOMEPAGE DTOs with safe text, severity, CTA, and time context", () => {
    const external = publicNotice({
      targetArea: SiteNoticeTargetArea.HOMEPAGE,
      severity: SiteNoticeSeverity.URGENT,
      ctaLabel: "Read details",
      ctaUrl: "https://example.org/details",
    });
    const markup = renderToStaticMarkup(
      <SiteNoticeContent
        targetArea={SiteNoticeTargetArea.HOMEPAGE}
        notices={[publicNotice(), external]}
      />,
    );
    expect(markup).toContain("Homepage notices");
    expect(markup).toContain("Info");
    expect(markup).toContain("Urgent");
    expect(markup).toContain("Read details");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("Through");
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain("lifecycle");
    expect(markup).not.toContain("version");
    expect(markup).not.toContain("Creator");
    expect(markup.indexOf("Operational notice")).toBeLessThan(
      markup.indexOf("Read details"),
    );
  });

  it("renders no public region for an empty result and does not duplicate content for responsive layouts", () => {
    expect(
      renderToStaticMarkup(
        <SiteNoticeContent
          targetArea={SiteNoticeTargetArea.SITE_WIDE}
          notices={[]}
        />,
      ),
    ).toBe("");
    const markup = renderToStaticMarkup(<NoticeItem notice={publicNotice()} />);
    expect(markup.match(/Operational notice/g)).toHaveLength(1);
    expect(markup).toContain("Info");
  });
});
