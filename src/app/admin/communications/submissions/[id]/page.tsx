import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getPublicStorySubmissionDetail } from "@/modules/communications/submissions";
import { listPublicStorySubmissionMediaAdminSummaries } from "@/modules/communications/submissions/submission-media-admin-service";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

import { isSubmissionStatusCode } from "../status";
import { StorySubmissionDetailContent } from "../submission-ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Review Story Submission" };

type SubmissionDetailSearchParams = Readonly<{
  submission?: string | string[];
}>;

export default async function StorySubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SubmissionDetailSearchParams>;
}) {
  const access = await resolveAdminAccess();
  const { id } = await params;
  if (access.status !== "authorized") {
    redirect(
      access.status === "unauthenticated"
        ? `/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fsubmissions%2F${encodeURIComponent(id)}`
        : "/admin/access-denied",
    );
  }
  if (!hasCapability(access.principal, "communications.submissions.review")) {
    redirect("/admin/access-denied");
  }

  let submission;
  let mediaSummaries = [];
  try {
    submission = await getPublicStorySubmissionDetail(
      prisma,
      access.principal,
      id,
    );
    mediaSummaries = await listPublicStorySubmissionMediaAdminSummaries(
      prisma,
      access.principal,
      submission.id,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }

  const rawStatus = (await searchParams).submission;
  const statusCode = isSubmissionStatusCode(rawStatus) ? rawStatus : undefined;

  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/submissions",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <StorySubmissionDetailContent
        submission={submission}
        mediaSummaries={mediaSummaries}
        canRestoreSpam={hasCapability(
          access.principal,
          "communications.submissions.restore_spam",
        )}
        canCreateStoryDraft={
          hasCapability(access.principal, "stories.create") &&
          hasCapability(access.principal, "communications.submissions.review")
        }
        {...(statusCode ? { statusCode } : {})}
      />
    </AdminShell>
  );
}
