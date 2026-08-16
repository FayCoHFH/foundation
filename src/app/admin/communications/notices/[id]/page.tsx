import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { SiteNoticeLifecycle } from "@/generated/prisma/client";
import { getSiteNotice } from "@/modules/communications/notices";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";
import { formatEditorialDateTime } from "@/platform/time/editorial";

import { saveSiteNoticeAction, siteNoticeWorkflowAction } from "../actions";
import {
  noticeSeverityLabel,
  noticeStatusLabel,
  noticeTargetLabel,
} from "../form-contract";
import { NoticeForm, noticeDefaults } from "../notice-form";
import { isSiteNoticeStatusCode, SITE_NOTICE_STATUS_MESSAGES } from "../status";
import { NoticeWorkflowControls } from "../workflow-controls";

export const metadata: Metadata = { title: "Edit Site Notice" };

export default async function SiteNoticeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const access = await resolveAdminAccess();
  const { id } = await params;
  if (access.status !== "authorized") {
    redirect(
      access.status === "unauthenticated"
        ? `/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fnotices%2F${encodeURIComponent(id)}`
        : "/admin/access-denied",
    );
  }
  if (!hasCapability(access.principal, "communications.notices.manage")) {
    redirect("/admin/access-denied");
  }
  let notice;
  try {
    notice = await getSiteNotice(prisma, access.principal, id, new Date());
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const rawStatus = (await searchParams).notice;
  const statusCode = isSiteNoticeStatusCode(rawStatus) ? rawStatus : undefined;
  const editable = notice.lifecycle !== SiteNoticeLifecycle.WITHDRAWN;

  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/notices",
      )}
    >
      <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
        Communications / Site Notices
      </p>
      <h1 className="text-editorial-pecan mt-3 font-serif text-4xl">
        Edit Site Notice
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">
        Site Notices are temporary operational messages, separate from News,
        Stories, and homepage curation.
      </p>
      {statusCode ? (
        <p
          role="status"
          data-notice-code={statusCode}
          className="mt-5 font-semibold"
        >
          {SITE_NOTICE_STATUS_MESSAGES[statusCode]}
        </p>
      ) : null}
      <section
        aria-labelledby="site-notice-summary-heading"
        className="border-border mt-8 border-y py-6"
      >
        <h2 id="site-notice-summary-heading" className="font-serif text-2xl">
          Current status
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-semibold">Lifecycle</dt>
            <dd>{noticeStatusLabel(notice.lifecycle)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Derived status</dt>
            <dd>{noticeStatusLabel(notice.status)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Severity</dt>
            <dd>{noticeSeverityLabel(notice.severity)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Target area</dt>
            <dd>{noticeTargetLabel(notice.targetArea)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Current version</dt>
            <dd>{notice.version}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created by</dt>
            <dd>{notice.creatorDisplayName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Updated by</dt>
            <dd>{notice.updaterDisplayName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created</dt>
            <dd>{formatEditorialDateTime(notice.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Updated</dt>
            <dd>{formatEditorialDateTime(notice.updatedAt)}</dd>
          </div>
        </dl>
      </section>
      <section
        aria-labelledby="site-notice-effectiveness-heading"
        className="mt-8"
      >
        <h2
          id="site-notice-effectiveness-heading"
          className="font-serif text-2xl"
        >
          Public effectiveness
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          {notice.status === "ACTIVE"
            ? "This notice is currently eligible for public display in its target area."
            : notice.status === "UPCOMING"
              ? "This notice is published but will not display until its start time."
              : notice.status === "EXPIRED"
                ? "This notice has passed its end time and is no longer displayed."
                : notice.status === "WITHDRAWN"
                  ? "This notice is withdrawn and is not displayed publicly."
                  : "This draft is not displayed publicly."}
        </p>
      </section>
      {editable ? (
        <NoticeForm
          action={saveSiteNoticeAction}
          defaults={noticeDefaults(notice)}
          hidden={{ noticeId: notice.id, expectedVersion: notice.version }}
          submitLabel="Save Site Notice"
        />
      ) : (
        <p className="border-border text-muted-foreground mt-8 border-l-4 pl-4">
          Withdrawn notices remain historical records and cannot be edited or
          republished.
        </p>
      )}
      <NoticeWorkflowControls
        notice={notice}
        action={siteNoticeWorkflowAction}
      />
    </AdminShell>
  );
}
