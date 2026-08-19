import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listCampaignProjectCandidates } from "@/modules/communications/campaigns";
import { listCampaignDestinationOptions } from "@/modules/engagement";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { CampaignCreateForm } from "../campaign-form";

export const metadata: Metadata = { title: "Create Campaign" };

export default async function NewCampaignPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fcampaigns%2Fnew");
  if (
    access.status === "denied" ||
    !hasCapability(access.principal, "campaigns.create")
  )
    redirect("/admin/access-denied");
  const [projects, destinationOptions] = await Promise.all([
    listCampaignProjectCandidates(prisma, access.principal),
    listCampaignDestinationOptions(prisma, access.principal),
  ]);
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/campaigns/new",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">
        Campaigns · new draft
      </p>
      <h1 className="text-foreground type-display mt-3 text-4xl leading-tight">
        Create a Campaign
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl">
        Draft a public initiative. Save, review, approve, and release are
        separate steps; external Donate and Volunteer actions leave this
        platform.
      </p>
      <CampaignCreateForm
        projects={projects}
        destinationOptions={destinationOptions}
      />
    </AdminShell>
  );
}
