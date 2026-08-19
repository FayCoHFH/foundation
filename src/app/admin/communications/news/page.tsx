import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell, communicationsNavigation } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { signOutAdmin } from "@/app/admin/actions";
import { listNewsDrafts } from "@/modules/communications/news";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import { prisma } from "@/platform/database/prisma";
export default async function NewsAdmin() {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized")
    redirect(
      access.status === "unauthenticated"
        ? "/admin/sign-in?next=%2Fadmin%2Fcommunications%2Fnews"
        : "/admin/access-denied",
    );
  const items = await listNewsDrafts(prisma, access.principal);
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={communicationsNavigation(
        access.principal,
        "/admin/communications/news",
      )}
      accountActions={
        <form action={signOutAdmin}>
          <Button type="submit">Sign out</Button>
        </form>
      }
    >
      <p className="text-primary text-sm font-semibold">Communications</p>
      <h1 className="type-display mt-3 text-4xl">News</h1>
      {hasCapability(access.principal, "news.create") ? (
        <Link
          className="bg-primary text-primary-foreground mt-7 inline-flex min-h-11 items-center rounded-sm px-4 font-semibold"
          href="/admin/communications/news/new"
        >
          Create News draft
        </Link>
      ) : null}
      <ul className="border-border mt-8 divide-y border-y">
        {items.map((item) => (
          <li className="py-4" key={item.newsId}>
            <Link
              className="font-semibold underline"
              href={`/admin/communications/news/${item.newsId}`}
            >
              {item.currentRevision.headline}
            </Link>
            <p className="text-muted-foreground mt-1 text-sm">
              {item.workflow.replaceAll("_", " ")} ·{" "}
              {item.releaseState.replaceAll("_", " ")} ·{" "}
              {item.currentRevision.expiresAt &&
              item.currentRevision.expiresAt <= new Date()
                ? "Expired"
                : "Current"}
            </p>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
