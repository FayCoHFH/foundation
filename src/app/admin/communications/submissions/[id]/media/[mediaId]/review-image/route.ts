import { notFound, redirect } from "next/navigation";

import { deliverPublicStorySubmissionMediaReviewDerivative } from "@/modules/communications/submissions";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { getRuntimeSubmissionQuarantineStorage } from "@/platform/storage";
import { AppError } from "@/platform/errors/app-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") redirect("/admin/access-denied");
  if (!hasCapability(access.principal, "communications.submissions.review"))
    redirect("/admin/access-denied");
  const storage = getRuntimeSubmissionQuarantineStorage();
  if (!storage)
    return new Response("Private media delivery is unavailable.", {
      status: 503,
    });
  const { id, mediaId } = await params;
  const submissionId = id;
  try {
    const delivery = await deliverPublicStorySubmissionMediaReviewDerivative(
      prisma,
      storage,
      access.principal,
      mediaId,
      submissionId,
    );
    return new Response(Buffer.from(delivery.body), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "Content-Type": delivery.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    return new Response("Private media delivery is unavailable.", {
      status: 404,
    });
  }
}
