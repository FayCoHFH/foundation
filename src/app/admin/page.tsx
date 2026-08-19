import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminHomePage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated") {
    redirect("/admin/sign-in?next=%2Fadmin");
  }
  if (access.status === "denied") redirect("/admin/access-denied");
  const { principal } = access;
  const navigation = communicationsNavigation(principal, "/admin");
  if (hasCapability(principal, "users.invite")) {
    navigation.splice(1, 0, {
      href: "/admin/invitations/new",
      label: "Invite administrator",
    });
  }

  return (
    <AdminShell
      identity={{ displayName: principal.name, email: principal.email }}
      navigation={navigation}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit" className="min-h-11">
            Sign out
          </Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">Foundation</p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        Administration
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
        This shell proves server-side identity, active-principal, and live
        capability boundaries. Story drafts are internal until a later public
        snapshot and presentation slice.
      </p>
      <dl className="border-border mt-10 grid max-w-2xl gap-6 border-t pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-sm">Session policy</dt>
          <dd className="mt-1 font-semibold">12 hours, non-sliding</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">
            Effective capabilities
          </dt>
          <dd className="mt-1 font-semibold">
            {principal.capabilities.length}
          </dd>
        </div>
      </dl>
    </AdminShell>
  );
}
