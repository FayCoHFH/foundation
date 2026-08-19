import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { InvitationForm } from "@/app/admin/invitations/new/invitation-form";
import { AdminShell, type AdminNavigationItem } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";

export const metadata: Metadata = { title: "Invite administrator" };

export default async function NewInvitationPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated") {
    redirect("/admin/sign-in?next=%2Fadmin%2Finvitations%2Fnew");
  }
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "users.invite")
  ) {
    redirect("/admin/access-denied");
  }
  const { principal } = access;
  const roles = await prisma.role.findMany({
    where: { isActive: true, key: { not: "super-admin" } },
    orderBy: { name: "asc" },
    select: { key: true, name: true },
  });
  const navigation: AdminNavigationItem[] = [
    { href: "/admin", label: "Administration" },
    {
      href: "/admin/invitations/new",
      label: "Invite administrator",
      current: true,
    },
  ];

  return (
    <AdminShell
      identity={{ displayName: principal.name, email: principal.email }}
      navigation={navigation}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">Identity and access</p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        Invite administrator
      </h1>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
        Create an expiring, single-use invitation for a specific verified Google
        Workspace identity. No email is sent by this foundation.
      </p>
      <InvitationForm roles={roles} />
    </AdminShell>
  );
}
