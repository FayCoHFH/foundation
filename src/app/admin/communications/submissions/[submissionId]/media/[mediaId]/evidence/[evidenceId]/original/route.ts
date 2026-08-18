import { notFound, redirect } from "next/navigation";

import { deliverPublicStorySubmissionClearanceEvidenceOriginal } from "@/modules/communications/submissions";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { getRuntimeSubmissionClearanceEvidenceStorage } from "@/platform/storage";
import { AppError } from "@/platform/errors/app-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      submissionId: string;
      mediaId: string;
      evidenceId: string;
    }>;
  },
) {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") redirect("/admin/access-denied");
  if (!hasCapability(access.principal, "communications.submissions.review"))
    redirect("/admin/access-denied");
  const storage = getRuntimeSubmissionClearanceEvidenceStorage();
  if (!storage)
    return new Response("Evidence delivery is unavailable.", { status: 503 });
  const { submissionId, mediaId, evidenceId } = await params;
  try {
    const scopedEvidence =
      await prisma.publicStorySubmissionMediaClearanceEvidenceDocument.findUnique(
        {
          where: { id: evidenceId },
          select: {
            clearance: {
              select: {
                submissionId: true,
                applicability: {
                  where: { mediaId },
                  select: { mediaId: true },
                },
              },
            },
          },
        },
      );
    if (
      !scopedEvidence ||
      scopedEvidence.clearance.submissionId !== submissionId ||
      scopedEvidence.clearance.applicability.length === 0
    )
      notFound();
    const delivery =
      await deliverPublicStorySubmissionClearanceEvidenceOriginal(
        prisma,
        storage,
        access.principal,
        evidenceId,
      );
    return new Response(Buffer.from(delivery.body), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "attachment",
        "Content-Type": delivery.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    return new Response("Evidence delivery is unavailable.", { status: 404 });
  }
}
