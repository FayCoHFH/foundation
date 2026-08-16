import { notFound, redirect } from "next/navigation";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import {
  getNewsDraft,
  newsDocumentToPlainText,
} from "@/modules/communications/news";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";
import { NewsForm } from "../new/page";
import { newsWorkflowForm, saveNewsForm } from "../actions";
import {
  isNewsWorkflowNoticeCode,
  NEWS_WORKFLOW_NOTICE_MESSAGES,
} from "../workflow-notice";
export default async function NewsDraft({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const access = await resolveAdminAccess(),
    { id } = await params,
    notice = (await searchParams).notice;
  if (access.status !== "authorized") redirect("/admin/access-denied");
  let item;
  try {
    item = await getNewsDraft(prisma, access.principal, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const editable =
    hasCapability(access.principal, "news.edit.any") ||
    (hasCapability(access.principal, "news.edit.own") &&
      item.editorialOwnerAdminUserId === access.principal.adminUserId);
  const fields = {
    newsId: item.newsId,
    expectedVersion: item.version,
    expectedContentHash: item.currentRevision.contentHash,
  };
  const current =
    !item.currentRevision.expiresAt ||
    item.currentRevision.expiresAt > new Date();
  const canSubmit =
    (item.workflow === "DRAFT" || item.workflow === "CHANGES_REQUESTED") &&
    hasCapability(access.principal, "news.submit");
  const canReview =
    item.workflow === "IN_REVIEW" &&
    hasCapability(access.principal, "news.review");
  const canApprove =
    item.workflow === "PENDING_APPROVAL" &&
    hasCapability(access.principal, "news.approve");
  const canRelease =
    item.workflow === "APPROVED" &&
    hasCapability(access.principal, "news.publish");
  const canManagePublished =
    item.releaseState === "PUBLISHED" &&
    (hasCapability(access.principal, "news.withdraw") ||
      hasCapability(access.principal, "news.archive") ||
      (current &&
        hasCapability(access.principal, "communications.placements.manage")));
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/news",
      )}
    >
      <h1 className="font-serif text-4xl">{item.currentRevision.headline}</h1>
      <p className="text-muted-foreground mt-3">
        {item.workflow.replaceAll("_", " ")} ·{" "}
        {item.releaseState.replaceAll("_", " ")} ·{" "}
        {item.currentRevision.expiresAt &&
        item.currentRevision.expiresAt <= new Date()
          ? "Expired"
          : "Current"}
      </p>
      {isNewsWorkflowNoticeCode(notice) ? (
        <p
          className="mt-4 font-semibold"
          data-notice-code={notice}
          role="status"
        >
          {NEWS_WORKFLOW_NOTICE_MESSAGES[notice]}
        </p>
      ) : null}
      {editable ? (
        <NewsForm
          action={saveNewsForm}
          hidden={{ newsId: item.newsId, expectedVersion: item.version }}
          defaults={{
            headline: item.currentRevision.headline,
            summary: item.currentRevision.summary,
            body: newsDocumentToPlainText(item.currentRevision.body),
            expiresAt:
              item.currentRevision.expiresAt?.toISOString().slice(0, 16) ?? "",
          }}
        />
      ) : null}
      {canSubmit ||
      canReview ||
      canApprove ||
      canRelease ||
      canManagePublished ? (
        <section
          aria-labelledby="news-workflow-actions-heading"
          className="border-border mt-10 border-t pt-7"
        >
          <h2
            id="news-workflow-actions-heading"
            className="text-xl font-semibold"
          >
            Workflow actions
          </h2>
          <form action={newsWorkflowForm} className="mt-5 space-y-4">
            {Object.entries(fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            {canRelease ? (
              <div>
                <label htmlFor="slug" className="block font-semibold">
                  Canonical URL slug
                </label>
                <input
                  id="slug"
                  name="slug"
                  required
                  defaultValue={item.slug ?? ""}
                  className="border-border mt-2 w-full rounded-sm border p-2"
                />
              </div>
            ) : null}
            {canReview ||
            (item.releaseState === "PUBLISHED" &&
              hasCapability(access.principal, "news.withdraw")) ? (
              <div>
                <label htmlFor="reason" className="block font-semibold">
                  {item.releaseState === "PUBLISHED"
                    ? "Withdrawal reason"
                    : "Reason for requested changes"}
                </label>
                <input
                  id="reason"
                  name="reason"
                  required={item.releaseState === "PUBLISHED"}
                  className="border-border mt-2 w-full rounded-sm border p-2"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {canSubmit ? (
                <button
                  className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 text-sm font-semibold"
                  formNoValidate
                  name="action"
                  value="submit"
                  type="submit"
                >
                  Submit for review
                </button>
              ) : null}
              {canReview ? (
                <>
                  <button
                    className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 text-sm font-semibold"
                    formNoValidate
                    name="action"
                    value="approval"
                    type="submit"
                  >
                    Send for approval
                  </button>
                  <button
                    className="border-border min-h-10 rounded-sm border px-3 text-sm font-semibold"
                    formNoValidate
                    name="action"
                    value="changes"
                    type="submit"
                  >
                    Request changes
                  </button>
                </>
              ) : null}
              {canApprove ? (
                <button
                  className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 text-sm font-semibold"
                  formNoValidate
                  name="action"
                  value="approve"
                  type="submit"
                >
                  Approve exact revision
                </button>
              ) : null}
              {canRelease ? (
                <button
                  className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 text-sm font-semibold"
                  formNoValidate
                  name="action"
                  value="release"
                  type="submit"
                >
                  Release immutable public snapshot
                </button>
              ) : null}
              {item.releaseState === "PUBLISHED" &&
              hasCapability(access.principal, "news.withdraw") ? (
                <button
                  className="border-border min-h-10 rounded-sm border px-3 text-sm font-semibold"
                  name="action"
                  value="withdraw"
                  type="submit"
                >
                  Withdraw public News
                </button>
              ) : null}
              {item.releaseState === "PUBLISHED" &&
              hasCapability(access.principal, "news.archive") ? (
                <button
                  className="border-border min-h-10 rounded-sm border px-3 text-sm font-semibold"
                  formNoValidate
                  name="action"
                  value="archive"
                  type="submit"
                >
                  Archive News
                </button>
              ) : null}
              {item.releaseState === "PUBLISHED" &&
              current &&
              hasCapability(
                access.principal,
                "communications.placements.manage",
              ) ? (
                <>
                  <button
                    className="bg-primary text-primary-foreground min-h-10 rounded-sm px-3 text-sm font-semibold"
                    formNoValidate
                    name="action"
                    value="feature"
                    type="submit"
                  >
                    Set as Featured News
                  </button>
                  <button
                    className="border-border min-h-10 rounded-sm border px-3 text-sm font-semibold"
                    formNoValidate
                    name="action"
                    value="clear-feature"
                    type="submit"
                  >
                    Clear Featured News
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </AdminShell>
  );
}
