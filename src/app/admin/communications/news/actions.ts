"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  archiveNews,
  approveNews,
  createNews,
  newsDocumentFromPlainText,
  releaseNews,
  requestNewsChanges,
  saveNewsRevision,
  sendNewsForApproval,
  setFeaturedNews,
  submitNews,
  withdrawNews,
} from "@/modules/communications/news";
import { resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import {
  AuthorizationError,
  ValidationError,
} from "@/platform/errors/app-error";
import { NEWS_WORKFLOW_NOTICE_CODES } from "./workflow-notice";
const form = z.object({
  headline: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(600),
  body: z.string().trim().min(1).max(30000),
  expiresAt: z.string().trim().optional(),
});
async function actor() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  return access.principal;
}
function candidate(data: FormData) {
  const parsed = form.parse(Object.fromEntries(data));
  const expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.valueOf()))
    throw new ValidationError("Enter a valid expiration date.");
  return { ...parsed, body: newsDocumentFromPlainText(parsed.body), expiresAt };
}
export async function createNewsForm(data: FormData) {
  const draft = await createNews(prisma, await actor(), candidate(data));
  redirect(`/admin/communications/news/${draft.newsId}`);
}
export async function saveNewsForm(data: FormData) {
  const parsed = candidate(data);
  await saveNewsRevision(prisma, await actor(), {
    ...parsed,
    newsId: z.string().uuid().parse(data.get("newsId")),
    expectedVersion: z.coerce
      .number()
      .int()
      .positive()
      .parse(data.get("expectedVersion")),
  });
  redirect(`/admin/communications/news/${data.get("newsId")}`);
}
export async function newsWorkflowForm(data: FormData) {
  const input = {
    newsId: z.string().uuid().parse(data.get("newsId")),
    expectedVersion: z.coerce
      .number()
      .int()
      .positive()
      .parse(data.get("expectedVersion")),
    expectedContentHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .parse(data.get("expectedContentHash")),
    reason: z
      .string()
      .optional()
      .parse(data.get("reason") || undefined),
  };
  const action = z.enum(NEWS_WORKFLOW_NOTICE_CODES).parse(data.get("action"));
  const principal = await actor();
  if (action === "submit") await submitNews(prisma, principal, input);
  else if (action === "changes")
    await requestNewsChanges(prisma, principal, input);
  else if (action === "approval")
    await sendNewsForApproval(prisma, principal, input);
  else if (action === "approve") await approveNews(prisma, principal, input);
  else if (action === "release")
    await releaseNews(prisma, principal, {
      ...input,
      slug: z.string().min(1).parse(data.get("slug")),
    });
  else if (action === "withdraw")
    await withdrawNews(prisma, principal, {
      newsId: input.newsId,
      expectedVersion: input.expectedVersion,
      reason: input.reason ?? "Administrative withdrawal",
    });
  else if (action === "archive")
    await archiveNews(prisma, principal, {
      newsId: input.newsId,
      expectedVersion: input.expectedVersion,
    });
  else if (action === "feature")
    await setFeaturedNews(prisma, principal, input.newsId);
  else await setFeaturedNews(prisma, principal, null);
  redirect(`/admin/communications/news/${input.newsId}?notice=${action}`);
}
