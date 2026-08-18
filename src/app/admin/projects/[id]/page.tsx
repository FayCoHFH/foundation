import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getProjectDraft } from "@/modules/communications/projects";
import { storyDocumentToPlainText } from "@/modules/communications/stories";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { AppError } from "@/platform/errors/app-error";
import {
  dateInputValue,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "../project-constants";
import { ProjectEditorForm } from "../project-form";
import { ProjectWorkflowControls } from "../project-workflow-controls";
export const metadata: Metadata = { title: "Project draft" };
export default async function ProjectAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await resolveAdminAccess();
  const { id } = await params;
  if (access.status === "unauthenticated")
    redirect(`/admin/sign-in?next=%2Fadmin%2Fprojects%2F${id}`);
  if (access.status === "denied") redirect("/admin/access-denied");
  let project;
  try {
    project = await getProjectDraft(prisma, access.principal, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    redirect("/admin/access-denied");
  }
  const canEdit =
    hasCapability(access.principal, "projects.edit.any") ||
    (hasCapability(access.principal, "projects.edit.own") &&
      project.editorialOwnerAdminUserId === access.principal.adminUserId);
  const values = {
    title: project.currentRevision.title,
    summary: project.currentRevision.summary,
    projectType: project.currentRevision.projectType,
    projectStatus: project.currentRevision.projectStatus,
    community: project.currentRevision.community,
    county: project.currentRevision.county,
    publicArea: project.currentRevision.publicArea ?? "",
    startDate: dateInputValue(project.currentRevision.startDate),
    completionDate: dateInputValue(project.currentRevision.completionDate),
    body: storyDocumentToPlainText(project.currentRevision.body),
    impactFacts: [...project.currentRevision.impactFacts],
  };
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(access.principal, "/admin/projects")}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">
        <Link className="underline" href="/admin/projects">
          Projects
        </Link>{" "}
        · private draft
      </p>
      <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
        {project.currentRevision.title}
      </h1>
      <dl className="border-border mt-7 grid gap-4 border-y py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Project type</dt>
          <dd className="mt-1 font-semibold">
            {PROJECT_TYPE_LABELS[project.currentRevision.projectType]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Project status</dt>
          <dd className="mt-1 font-semibold">
            {PROJECT_STATUS_LABELS[project.currentRevision.projectStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Editorial workflow</dt>
          <dd className="mt-1 font-semibold">
            {project.workflow.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public release</dt>
          <dd className="mt-1 font-semibold">
            {project.releaseState.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Editorial owner</dt>
          <dd className="mt-1 font-mono text-xs">
            {project.editorialOwnerAdminUserId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current revision</dt>
          <dd className="mt-1 font-semibold">
            Revision {project.currentRevision.number}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Public snapshots</dt>
          <dd className="mt-1 font-semibold">{project.snapshotCount}</dd>
        </div>
      </dl>
      {project.releaseState === "PUBLISHED" && project.workflow === "DRAFT" ? (
        <p className="border-primary bg-surface-subtle mt-6 border-l-4 p-4">
          This is a successor draft. The current public Project remains
          unchanged until this revision is released.
        </p>
      ) : null}
      {canEdit ? (
        <ProjectEditorForm
          projectId={project.projectId}
          expectedVersion={project.version}
          values={values}
        />
      ) : (
        <p className="text-muted-foreground mt-8">
          You can review this Project, but you do not have permission to edit
          it.
        </p>
      )}
      <ProjectWorkflowControls
        projectId={project.projectId}
        version={project.version}
        contentHash={project.currentRevision.contentHash}
        workflow={project.workflow}
        releaseState={project.releaseState}
        slug={project.slug}
        canSubmit={hasCapability(access.principal, "projects.submit_review")}
        canReview={hasCapability(access.principal, "projects.review")}
        canApprove={hasCapability(access.principal, "projects.approve")}
        canRelease={hasCapability(access.principal, "projects.release")}
        canWithdraw={hasCapability(access.principal, "projects.withdraw")}
        canArchive={hasCapability(access.principal, "projects.archive")}
      />
    </AdminShell>
  );
}
