import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getPublicStorySubmissionMediaAdminReview } from "@/modules/communications/submissions/submission-media-admin-service";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

import { SubmissionMediaDetailContent } from "../../../media-ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Review submitted image" };

const MEDIA_STATUS_MESSAGES: Record<string, string> = {
  "subject-created": "Subject added to this image.",
  "clearance-created": "Clearance created and left pending verification.",
  "applicability-updated": "Clearance applicability updated.",
  "clearance-verified": "Clearance verified.",
  "clearance-rejected": "Clearance rejected; its history remains available.",
  "clearance-revoked":
    "Clearance revoked; existing uses require separate review.",
  "media-restricted": "Media restriction recorded.",
  "eligibility-restored":
    "Media restriction restored after authoritative eligibility checks.",
  "media-promoted": "Sanitized media asset created in the Media Library.",
  "evidence-uploaded": "Evidence uploaded and processed for review.",
  "evidence-removed": "Evidence removed with its history retained.",
};

export default async function SubmissionMediaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string; mediaId: string }>;
  searchParams: Promise<{ media?: string | string[] }>;
}) {
  const access = await resolveAdminAccess();
  const { submissionId, mediaId } = await params;
  if (access.status !== "authorized") redirect("/admin/access-denied");
  if (!hasCapability(access.principal, "communications.submissions.review"))
    redirect("/admin/access-denied");
  let review;
  try {
    review = await getPublicStorySubmissionMediaAdminReview(
      prisma,
      access.principal,
      submissionId,
      mediaId,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const rawStatus = (await searchParams).media;
  const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        `/admin/communications/submissions/${submissionId}/media`,
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      {status && MEDIA_STATUS_MESSAGES[status] ? (
        <p role="status" className="mt-1 font-semibold">
          {MEDIA_STATUS_MESSAGES[status]}
        </p>
      ) : null}
      <SubmissionMediaDetailContent
        review={review}
        canPromote={hasCapability(
          access.principal,
          "communications.media.promote",
        )}
        canRestore={hasCapability(
          access.principal,
          "communications.media.restore_eligibility",
        )}
      />
    </AdminShell>
  );
}
