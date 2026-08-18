import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listCampaignDrafts } from "@/modules/communications/campaigns";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
import { CampaignListUI } from "./campaign-list-ui";

export const metadata: Metadata = { title: "Campaigns administration" };

export default async function CampaignsAdminPage() {
  const access = await resolveAdminAccess();
  if (access.status === "unauthenticated")
    redirect("/admin/sign-in?next=%2Fadmin%2Fcampaigns");
  if (
    access.status === "denied" ||
    (!hasCapability(access.principal, "campaigns.create") &&
      !hasCapability(access.principal, "campaigns.read.draft.own") &&
      !hasCapability(access.principal, "campaigns.read.draft.any"))
  )
    redirect("/admin/access-denied");
  const campaigns = await listCampaignDrafts(prisma, access.principal);
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/campaigns",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">Campaigns</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight">
            Campaigns
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-8">
            Manage public initiatives, their editorial lifecycle, linked
            Projects, and approved external action handoffs.
          </p>
        </div>
        {hasCapability(access.principal, "campaigns.create") ? (
          <Link
            href="/admin/campaigns/new"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-sm px-4 py-2 font-semibold"
          >
            Create Campaign
          </Link>
        ) : null}
      </div>
      <CampaignListUI campaigns={campaigns} />
    </AdminShell>
  );
}
