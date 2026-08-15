import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import {
  getNewsDraft,
  newsDocumentToPlainText,
} from "@/modules/communications/news";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";
import { NewsForm } from "../new/page";
import { newsWorkflowForm, saveNewsForm } from "../actions";
export default async function NewsDraft({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await resolveAdminAccess(),
    { id } = await params;
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
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={[
        { href: "/admin/communications/news", label: "News" },
        { href: "#", label: "News draft", current: true },
      ]}
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
      <form action={newsWorkflowForm} className="mt-8 flex flex-wrap gap-3">
        {Object.entries(fields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input
          name="slug"
          defaultValue={item.slug ?? ""}
          placeholder="release-slug"
          className="border-border rounded-sm border p-2"
        />
        <input
          name="reason"
          placeholder="Reason when needed"
          className="border-border rounded-sm border p-2"
        />
        {[
          "submit",
          "changes",
          "approval",
          "approve",
          "release",
          "withdraw",
          "archive",
          "feature",
          "clear-feature",
        ].map((action) => (
          <button
            key={action}
            name="action"
            value={action}
            className="border-border min-h-10 rounded-sm border px-3 text-sm font-semibold"
            type="submit"
          >
            {action.replaceAll("-", " ")}
          </button>
        ))}
      </form>
    </AdminShell>
  );
}
