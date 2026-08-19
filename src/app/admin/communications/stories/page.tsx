import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";

export const metadata: Metadata = { title: "Story drafts" };

export default async function StoryDraftsPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fstories");
  if (
    access.status === "denied" ||
    (!hasCapability(access.principal, "stories.create") &&
      !hasCapability(access.principal, "stories.read.draft.own") &&
      !hasCapability(access.principal, "stories.read.draft.any"))
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
        Story drafts
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
        Create and work on private Story candidates. This slice intentionally
        does not include a Story list or any public presentation.
      </p>
      {hasCapability(principal, "stories.create") ? (
        <Link
          href="/admin/communications/stories/new"
          className="bg-primary text-primary-foreground mt-8 inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold"
        >
          Create Story draft
        </Link>
      ) : null}
    </AdminShell>
  );
}
