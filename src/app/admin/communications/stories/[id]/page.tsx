import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { StoryEditorForm } from "@/app/admin/communications/stories/story-editor-form";
import { StoryWorkflowControls } from "@/app/admin/communications/stories/story-workflow-controls";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  getStoryDraft,
  storyDocumentToPlainText,
} from "@/modules/communications/stories";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";

export const metadata: Metadata = { title: "Story draft" };

export default async function StoryDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await resolveAdminAccess();
  const { id } = await params;
  if (access.status === "unauthenticated")
    redirect(`/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fstories%2F${id}`);
  if (access.status === "denied") redirect("/admin/access-denied");
  let story;
  try {
    story = await getStoryDraft(prisma, access.principal, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const { principal } = access;
  const canEdit =
    hasCapability(principal, "stories.edit.any") ||
    (hasCapability(principal, "stories.edit.own") &&
      story.editorialOwnerAdminUserId === principal.adminUserId);
  return (
    <AdminShell
      identity={{ displayName: principal.name, email: principal.email }}
      navigation={communicationsNavigation(
        principal,
        "/admin/communications/stories",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">
        Communications · private draft
      </p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        {story.currentRevision.headline}
      </h1>
      <dl className="border-border mt-7 grid gap-4 border-y py-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Workflow</dt>
          <dd className="mt-1 font-semibold">
            {story.workflow.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current revision</dt>
          <dd className="mt-1 font-semibold">
            Revision {story.currentRevision.number}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Editorial owner</dt>
          <dd className="mt-1 font-mono text-xs">
            {story.editorialOwnerAdminUserId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public release</dt>
          <dd className="mt-1 font-semibold">
            {story.releaseState.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Snapshots</dt>
          <dd className="mt-1 font-semibold">{story.snapshotCount}</dd>
        </div>
      </dl>
      {canEdit ? (
        <StoryEditorForm
          storyId={story.storyId}
          version={story.version}
          headline={story.currentRevision.headline}
          deck={story.currentRevision.deck}
          excerpt={story.currentRevision.excerpt}
          body={storyDocumentToPlainText(story.currentRevision.body)}
        />
      ) : (
        <p className="text-muted-foreground mt-8">
          You can review this draft, but do not have permission to edit it.
        </p>
      )}
      <StoryWorkflowControls
        storyId={story.storyId}
        version={story.version}
        contentHash={story.currentRevision.contentHash}
        workflow={story.workflow}
        canSubmit={hasCapability(principal, "stories.submit")}
        canReview={hasCapability(principal, "stories.review")}
        canApprove={hasCapability(principal, "stories.approve")}
        canPublish={hasCapability(principal, "stories.publish")}
        canWithdraw={hasCapability(principal, "stories.withdraw")}
        releaseState={story.releaseState}
        slug={story.slug}
      />
    </AdminShell>
  );
}
