import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  getEngagementConfiguration,
  listDonorViewDestinations,
} from "@/modules/engagement";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { DestinationManagementUI } from "./destination-management-ui";

export const metadata: Metadata = { title: "Giving & Volunteer Destinations" };

export default async function EngagementDestinationsPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fengagement");
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "integrations.donorview.read")
  )
    redirect("/admin/access-denied");
  const [destinations, configuration] = await Promise.all([
    listDonorViewDestinations(prisma, access.principal),
    getEngagementConfiguration(prisma, access.principal),
  ]);
  const canConfigure = hasCapability(
    access.principal,
    "integrations.donorview.configure",
  );
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/engagement",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">Giving & Volunteer</p>
      <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
        DonorView Destinations
      </h1>
      <p className="text-muted-foreground mt-4 max-w-3xl text-lg leading-8">
        Govern the approved external handoffs for giving and volunteering. This
        surface stores destinations and verification evidence only; DonorView
        remains authoritative for donor, payment, and volunteer records.
      </p>
      <DestinationManagementUI
        destinations={destinations}
        configuration={configuration}
        canConfigure={canConfigure}
      />
    </AdminShell>
  );
}
