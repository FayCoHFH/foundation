import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { ProjectCreateForm } from "../project-form";
export const metadata: Metadata = { title: "Create Project" };
export default async function NewProjectPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fprojects%2Fnew");
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "projects.create")
  )
    redirect("/admin/access-denied");
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
      <p className="text-primary text-sm font-semibold">Projects · new draft</p>
      <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
        Create a Project
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl">
        Draft a public-facing record about a Fayette County Habitat project.
        Save, review, approve, and release are separate steps.
      </p>
      <ProjectCreateForm />
    </AdminShell>
  );
}
