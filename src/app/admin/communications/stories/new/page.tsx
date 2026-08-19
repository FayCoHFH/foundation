import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { StoryCreateForm } from "@/app/admin/communications/stories/story-create-form";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";

export const metadata: Metadata = { title: "Create Story draft" };

export default async function NewStoryPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fstories%2Fnew");
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "stories.create")
  )
    redirect("/admin/access-denied");
  const { principal } = access;
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
      <p className="text-primary text-sm font-semibold">Communications</p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        Create Story draft
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
        The initial revision is private, immutable after save, and assigned to
        you as internal editorial owner.
      </p>
      <StoryCreateForm />
    </AdminShell>
  );
}
