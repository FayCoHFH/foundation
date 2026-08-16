import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAdmin } from "@/app/admin/actions";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listSiteNotices } from "@/modules/communications/notices";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";

import { SiteNoticeListContent } from "./notice-list-ui";

export const metadata: Metadata = { title: "Site Notices" };

export default async function SiteNoticesPage() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") {
    redirect(
      access.status === "unauthenticated"
        ? "/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fnotices"
        : "/admin/access-denied",
    );
  }
  if (!hasCapability(access.principal, "communications.notices.manage")) {
    redirect("/admin/access-denied");
  }
  const notices = await listSiteNotices(prisma, access.principal, {
    evaluationTime: new Date(),
  });
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/notices",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <SiteNoticeListContent
        notices={notices}
        canCreate={hasCapability(
          access.principal,
          "communications.notices.manage",
        )}
      />
    </AdminShell>
  );
}
