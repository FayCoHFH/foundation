import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listPublicStorySubmissions } from "@/modules/communications/submissions";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

import { parseSubmissionSearchParams, type SubmissionPageState } from "./query";
import { StorySubmissionsListContent } from "./submission-ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Story Submissions" };

type SubmissionSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function readFailureMessage(error: unknown) {
  if (error instanceof AppError && error.code === "INVALID_INPUT") {
    return "That Story Submission filter is invalid. Choose a listed option and try again.";
  }
  return "Story Submissions are temporarily unavailable. Try again shortly.";
}

export default async function StorySubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<SubmissionSearchParams>;
}) {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") {
    redirect(
      access.status === "unauthenticated"
        ? "/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fsubmissions"
        : "/admin/access-denied",
    );
  }
  if (!hasCapability(access.principal, "communications.submissions.review")) {
    redirect("/admin/access-denied");
  }

  const parsed = parseSubmissionSearchParams(await searchParams);
  const state = parsed.state satisfies SubmissionPageState;
  let result: Awaited<ReturnType<typeof listPublicStorySubmissions>> | null =
    null;
  let errorMessage: string | undefined;
  try {
    result = await listPublicStorySubmissions(prisma, access.principal, state);
  } catch (error) {
    errorMessage = readFailureMessage(error);
  }

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
      <StorySubmissionsListContent
        result={result}
        state={state}
        invalid={Object.values(parsed.invalid).some(Boolean)}
        {...(errorMessage ? { errorMessage } : {})}
      />
    </AdminShell>
  );
}
