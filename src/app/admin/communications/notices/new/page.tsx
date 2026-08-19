import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";

import { saveSiteNoticeAction } from "../actions";
import { NoticeForm } from "../notice-form";

export const metadata: Metadata = { title: "Create Site Notice" };

export default async function NewSiteNoticePage() {
  const access = await resolveAdminAccess();
  if (
    access.status !== "authorized" ||
    !hasCapability(access.principal, "communications.notices.manage")
  ) {
    redirect(
      access.status === "unauthenticated"
        ? "/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fnotices%2Fnew"
        : "/admin/access-denied",
    );
  }
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/notices/new",
      )}
    >
      <p className="text-primary text-sm font-semibold tracking-[.14em] uppercase">
        Communications / Site Notices
      </p>
      <h1 className="text-brand-black type-display mt-3 text-4xl">
        Create Site Notice
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">
        Create an operational draft. Publishing is a separate action and
        requires a complete bounded activation window.
      </p>
      <NoticeForm action={saveSiteNoticeAction} />
    </AdminShell>
  );
}
