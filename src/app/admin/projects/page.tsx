import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listProjectDrafts } from "@/modules/communications/projects";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { ProjectListUI } from "./project-list-ui";
export const metadata: Metadata = { title: "Projects administration" };
export default async function ProjectsAdminPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fprojects");
  if (
    access.status === "denied" ||
    (!hasCapability(access.principal, "projects.create") &&
      !hasCapability(access.principal, "projects.read.draft.own") &&
      !hasCapability(access.principal, "projects.read.draft.any"))
  )
    redirect("/admin/access-denied");
  const projects = await listProjectDrafts(prisma, access.principal);
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
      <p className="text-primary text-sm font-semibold">Projects</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
            Projects
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-8">
            Manage public Project candidates and their review lifecycle. Private
            project-management details are outside this editorial surface.
          </p>
        </div>
        {hasCapability(access.principal, "projects.create") ? (
          <Link
            href="/admin/projects/new"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold"
          >
            Create Project
          </Link>
        ) : null}
      </div>
      <ProjectListUI projects={projects} />
    </AdminShell>
  );
}
