import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { createNewsForm } from "../actions";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
export default async function NewNews() {
  const access = await resolveAdminAccess();
  if (
    access.status !== "authorized" ||
    !hasCapability(access.principal, "news.create")
  )
    redirect("/admin/access-denied");
  return (
    <AdminShell
      identity={{
        displayName: access.principal.name,
        email: access.principal.email,
      }}
      navigation={[
        { href: "/admin/communications/news", label: "News" },
        { href: "#", label: "New News", current: true },
      ]}
    >
      <h1 className="font-serif text-4xl">Create News draft</h1>
      <NewsForm action={createNewsForm} />
    </AdminShell>
  );
}
export function NewsForm({
  action,
  defaults,
  hidden,
}: {
  action: (data: FormData) => Promise<void>;
  defaults?: {
    headline: string;
    summary: string;
    body: string;
    expiresAt: string;
  };
  hidden?: Record<string, string | number>;
}) {
  return (
    <form action={action} className="mt-8 grid max-w-3xl gap-5">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <label className="grid gap-2 font-semibold">
        Headline
        <input
          name="headline"
          required
          maxLength={180}
          defaultValue={defaults?.headline}
          className="border-border rounded-sm border p-3"
        />
      </label>
      <label className="grid gap-2 font-semibold">
        Summary
        <textarea
          name="summary"
          required
          maxLength={600}
          defaultValue={defaults?.summary}
          className="border-border min-h-24 rounded-sm border p-3"
        />
      </label>
      <label className="grid gap-2 font-semibold">
        Body
        <textarea
          name="body"
          required
          defaultValue={defaults?.body}
          className="border-border min-h-64 rounded-sm border p-3"
        />
      </label>
      <label className="grid gap-2 font-semibold">
        Expiration (optional)
        <input
          type="datetime-local"
          name="expiresAt"
          defaultValue={defaults?.expiresAt}
          className="border-border rounded-sm border p-3"
        />
      </label>
      <button
        className="bg-primary text-primary-foreground min-h-11 rounded-sm px-4 font-semibold"
        type="submit"
      >
        Save News draft
      </button>
    </form>
  );
}
